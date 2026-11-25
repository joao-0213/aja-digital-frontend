import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHttpClient, HttpError } from '../src/lib/http-client.ts';
import { createStudentsApi, type EnrollmentDto, type EnrollmentPreview } from '../src/features/students/api.ts';
import {
  createBatchItems,
  describePreviewOutcome,
  keepOnlyValidEmails,
  parseBatchEmails,
  runBatchConfirm,
  runBatchPreview,
  summarizeBatch,
} from '../src/features/students/enrollment-batch.ts';

function previewFor(email: string, overrides: Partial<EnrollmentPreview> = {}): EnrollmentPreview {
  return {
    email,
    classId: 'c1',
    canEnroll: true,
    message: '',
    account: null,
    existingEnrollment: null,
    otherClass: null,
    ...overrides,
  };
}

function enrollmentFor(email: string, status: EnrollmentDto['status'] = 'pending'): EnrollmentDto {
  return {
    id: `enr-${email}`,
    classId: 'c1',
    email,
    status,
    createdAt: '2031-06-15T12:00:00Z',
    createdBy: 'admin',
    unassignedAssessmentIds: [],
  };
}

test('parseBatchEmails cleans whitespace, lowercases, splits mixed separators, deduplicates and flags invalid entries', () => {
  const raw = '  ANA@Escola.BR, bruno@escola.br;   ana@escola.br\ncarlos@escola.br\t\ninvalido-sem-arroba   ' + `${'a'.repeat(248)}@ex.com`;
  const parsed = parseBatchEmails(raw);

  assert.deepEqual(parsed.valid, ['ana@escola.br', 'bruno@escola.br', 'carlos@escola.br']);
  assert.equal(parsed.duplicatesRemoved, 1);
  assert.equal(parsed.invalid.length, 2);
  assert.equal(parsed.invalid[0].raw, 'invalido-sem-arroba');
  assert.match(parsed.invalid[0].reason ?? '', /inválido/i);
  assert.match(parsed.invalid[1].reason ?? '', /254/);
  assert.equal(keepOnlyValidEmails(raw), 'ana@escola.br\nbruno@escola.br\ncarlos@escola.br');
});

test('createBatchItems assigns unique stable Idempotency-Keys and preserves invalid entries without queuing them', () => {
  const parsed = parseBatchEmails('a@ex.test, invalido, b@ex.test');
  const existing = new Map([['a@ex.test', 'frozen-key-a']]);
  let seq = 0;
  const items = createBatchItems(parsed, existing, () => `gen-key-${++seq}`);

  assert.deepEqual(items.map(i => [i.email, i.status, i.idempotencyKey]), [
    ['a@ex.test', 'queued', 'frozen-key-a'],
    ['invalido', 'invalid', 'gen-key-1'],
    ['b@ex.test', 'queued', 'gen-key-2'],
  ]);
});

test('runBatchPreview enforces bounded concurrency, isolates per-item preview failures and supports retrying only errors', async () => {
  const parsed = parseBatchEmails('ok1@ex.test, blocked@ex.test, flaky@ex.test, ok2@ex.test, broken-format');
  const items = createBatchItems(parsed, undefined, () => crypto.randomUUID());

  let inFlight = 0;
  let maxInFlight = 0;
  let flakyAttempts = 0;
  const requested: string[] = [];

  const firstRun = await runBatchPreview(items, async email => {
    requested.push(email);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise(resolve => setTimeout(resolve, 10));
    inFlight--;
    if (email === 'blocked@ex.test') {
      return previewFor(email, { canEnroll: false, message: 'O aluno já tem vínculo ativo em Turma B.', otherClass: { id: 'c2', name: 'Turma B' } });
    }
    if (email === 'flaky@ex.test' && ++flakyAttempts === 1) {
      throw new HttpError('unavailable', 'Serviço temporariamente indisponível.', { status: 503 });
    }
    return previewFor(email);
  }, { concurrency: 2 });

  assert.equal(maxInFlight <= 2, true, `expected concurrency <= 2, got ${maxInFlight}`);
  assert.equal(requested.includes('broken-format'), false, 'invalid email must never hit preview endpoint');
  assert.equal(firstRun.completed, 4);
  assert.equal(firstRun.total, 4);

  const byEmail = Object.fromEntries(firstRun.items.map(item => [item.email, item]));
  assert.equal(byEmail['ok1@ex.test'].status, 'ready');
  assert.equal(byEmail['ok1@ex.test'].selected, true);
  assert.equal(byEmail['blocked@ex.test'].status, 'blocked');
  assert.equal(byEmail['blocked@ex.test'].selected, false);
  assert.equal(byEmail['flaky@ex.test'].status, 'preview-error');
  assert.equal(byEmail['flaky@ex.test'].selected, false);
  assert.equal(byEmail['broken-format'].status, 'invalid');

  // Retry only failed previews.
  const retryRequested: string[] = [];
  const retryRun = await runBatchPreview(firstRun.items, async email => {
    retryRequested.push(email);
    return previewFor(email);
  }, { onlyStatuses: ['preview-error'] });

  assert.deepEqual(retryRequested, ['flaky@ex.test']);
  assert.equal(retryRun.items.find(i => i.email === 'flaky@ex.test')?.status, 'ready');
  assert.equal(retryRun.items.find(i => i.email === 'blocked@ex.test')?.status, 'blocked');
});

test('runBatchConfirm runs sequentially, continues after partial failures, and reuses frozen Idempotency-Keys on retry', async () => {
  const parsed = parseBatchEmails('first@ex.test, fail-once@ex.test, unselected@ex.test, last@ex.test');
  let seq = 0;
  const items = createBatchItems(parsed, undefined, () => `idemp-key-000${++seq}`).map(item => ({
    ...item,
    status: 'ready' as const,
    selected: item.email !== 'unselected@ex.test',
    preview: previewFor(item.email),
  }));

  let inFlight = 0;
  let maxInFlight = 0;
  let failOnceCount = 0;
  const calls: Array<{ email: string; key: string }> = [];

  const firstRun = await runBatchConfirm(items, async (email, key) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    calls.push({ email, key });
    await new Promise(resolve => setTimeout(resolve, 5));
    inFlight--;
    if (email === 'fail-once@ex.test' && ++failOnceCount === 1) {
      throw new HttpError('conflict', 'O aluno já tem vínculo ativo em outra turma.', { status: 409, code: 'BUSINESS_CONFLICT' });
    }
    return enrollmentFor(email, email === 'first@ex.test' ? 'active' : 'pending');
  });

  assert.equal(maxInFlight, 1, 'writes must run strictly sequentially');
  assert.deepEqual(calls.map(c => c.email), ['first@ex.test', 'fail-once@ex.test', 'last@ex.test']);
  assert.equal(new Set(calls.map(c => c.key)).size, 3, 'every email must send a distinct Idempotency-Key');
  assert.equal(firstRun.succeeded, 2);
  assert.equal(firstRun.failed, 1);

  const summaryAfterFirst = summarizeBatch(firstRun.items);
  assert.equal(summaryAfterFirst.activeCount, 1);
  assert.equal(summaryAfterFirst.pendingCount, 1);
  assert.equal(summaryAfterFirst.errorCount, 1);
  assert.deepEqual(summaryAfterFirst.problemEmails, ['fail-once@ex.test']);

  // Retry failed item: must reuse exact same Idempotency-Key and skip already-succeeded items.
  const retryCalls: Array<{ email: string; key: string }> = [];
  const retryRun = await runBatchConfirm(firstRun.items, async (email, key) => {
    retryCalls.push({ email, key });
    return enrollmentFor(email, 'pending');
  }, { mode: 'retry-failed' });

  assert.equal(retryCalls.length, 1);
  assert.equal(retryCalls[0].email, 'fail-once@ex.test');
  assert.equal(retryCalls[0].key, calls[1].key);
  assert.equal(retryRun.succeeded, 1);
  assert.equal(retryRun.failed, 0);
  assert.equal(summarizeBatch(retryRun.items).successCount, 3);
});

test('session expiration stops remaining batch requests immediately instead of hammering 401s', async () => {
  const parsed = parseBatchEmails('a@ex.test, b@ex.test, c@ex.test');
  const items = createBatchItems(parsed, undefined, () => crypto.randomUUID()).map(item => ({
    ...item,
    status: 'ready' as const,
    selected: true,
    preview: previewFor(item.email),
  }));

  const called: string[] = [];
  const run = await runBatchConfirm(items, async email => {
    called.push(email);
    throw new HttpError('session', 'Entre novamente para continuar.', { status: 401, code: 'SESSION_REQUIRED' });
  });

  assert.deepEqual(called, ['a@ex.test']);
  assert.equal(run.sessionExpired, true);
  assert.equal(run.items[0].status, 'error');
  assert.equal(run.items[1].status, 'ready');
});

test('batch orchestrator calls exact existing HTTP preview and enrollment endpoints without altering contracts', async () => {
  const recorded: Array<{ method: string; url: string; body: unknown; idempotencyKey?: string }> = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    recorded.push({
      method: req.method!,
      url: req.url!,
      body: raw ? JSON.parse(raw) : undefined,
      idempotencyKey: req.headers['idempotency-key'] as string | undefined,
    });
    res.setHeader('Content-Type', 'application/json');
    const url = new URL(req.url!, 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname === '/api/v1/enrollments/preview') {
      const email = url.searchParams.get('email')!;
      const classId = url.searchParams.get('classId')!;
      res.end(JSON.stringify(previewFor(email, {
        classId,
        canEnroll: email !== 'impedido@ex.test',
        message: email === 'impedido@ex.test' ? 'Conta inativa.' : '',
      })));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/v1/enrollments') {
      const body = JSON.parse(raw) as { classId: string; email: string };
      res.statusCode = 201;
      res.end(JSON.stringify(enrollmentFor(body.email, 'pending')));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Não encontrado.' } }));
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  try {
    const api = createStudentsApi(createHttpClient({ baseUrl: `http://127.0.0.1:${address.port}/api/v1` }));
    const parsed = parseBatchEmails('NOVO1@ex.test; impedido@ex.test\nnovo2@ex.test');
    const items = createBatchItems(parsed, undefined, () => crypto.randomUUID());

    const checked = await runBatchPreview(items, email => api.preview('c1', email), { concurrency: 1 });
    const confirmed = await runBatchConfirm(checked.items, (email, key) => api.add('c1', email, key));

    assert.equal(confirmed.succeeded, 2);
    assert.equal(confirmed.failed, 0);

    const previews = recorded.filter(r => r.method === 'GET');
    const posts = recorded.filter(r => r.method === 'POST');
    assert.deepEqual(previews.map(p => p.url), [
      '/api/v1/enrollments/preview?classId=c1&email=novo1%40ex.test',
      '/api/v1/enrollments/preview?classId=c1&email=impedido%40ex.test',
      '/api/v1/enrollments/preview?classId=c1&email=novo2%40ex.test',
    ]);
    assert.deepEqual(posts.map(p => ({ url: p.url, body: p.body })), [
      { url: '/api/v1/enrollments', body: { classId: 'c1', email: 'novo1@ex.test' } },
      { url: '/api/v1/enrollments', body: { classId: 'c1', email: 'novo2@ex.test' } },
    ]);
    assert.ok(posts[0].idempotencyKey && posts[0].idempotencyKey.length >= 8);
    assert.ok(posts[1].idempotencyKey && posts[1].idempotencyKey.length >= 8);
    assert.notEqual(posts[0].idempotencyKey, posts[1].idempotencyKey);
  } finally {
    await new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()); });
  }
});

test('describePreviewOutcome classifies existing, pending, confirmed, unconfirmed and blocked previews clearly', () => {
  assert.equal(describePreviewOutcome(previewFor('a@ex.test', { canEnroll: false, message: 'Bloqueado' })).badge, 'Impedido');
  assert.equal(describePreviewOutcome(previewFor('a@ex.test', { existingEnrollment: enrollmentFor('a@ex.test', 'active') })).badge, 'Já ativo na turma');
  assert.equal(describePreviewOutcome(previewFor('a@ex.test', { account: { id: 'u1', name: 'Caio', email: 'a@ex.test', role: 'student', emailConfirmedAt: '2031-01-01T00:00:00Z' } })).badge, 'Vínculo imediato');
  assert.equal(describePreviewOutcome(previewFor('a@ex.test', { account: { id: 'u2', name: 'Dora', email: 'a@ex.test', role: 'student', emailConfirmedAt: null } })).badge, 'Ficará pendente');
  assert.equal(describePreviewOutcome(previewFor('a@ex.test')).badge, 'Ficará pendente');
});

test('runBatchPreview does not report aborted when abort fires after the last item was already started, and resumes queued items after an early abort', async () => {
  const single = createBatchItems(parseBatchEmails('last@ex.test'), undefined, () => crypto.randomUUID());
  let stopFlag = false;
  const lateAbort = await runBatchPreview(single, async email => {
    stopFlag = true;
    return previewFor(email);
  }, { concurrency: 1, isAborted: () => stopFlag });
  assert.equal(lateAbort.completed, 1);
  assert.equal(lateAbort.aborted, false);
  assert.equal(lateAbort.items[0].status, 'ready');

  const multi = createBatchItems(parseBatchEmails('one@ex.test, two@ex.test, three@ex.test'), undefined, () => crypto.randomUUID());
  let stopAfterFirst = false;
  const partial = await runBatchPreview(multi, async email => {
    stopAfterFirst = true;
    return previewFor(email);
  }, { concurrency: 1, isAborted: () => stopAfterFirst });
  assert.equal(partial.completed, 1);
  assert.equal(partial.aborted, true);
  assert.deepEqual(partial.items.map(item => item.status), ['ready', 'queued', 'queued']);

  const resumedCalls: string[] = [];
  const resumed = await runBatchPreview(partial.items, async email => {
    resumedCalls.push(email);
    return previewFor(email);
  }, { concurrency: 1 });
  assert.deepEqual(resumedCalls, ['two@ex.test', 'three@ex.test']);
  assert.equal(resumed.aborted, false);
  assert.deepEqual(resumed.items.map(item => item.status), ['ready', 'ready', 'ready']);
});

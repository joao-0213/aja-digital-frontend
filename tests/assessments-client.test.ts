import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssessmentsApi, createWorkSubmitCommand, type AttemptQuestionPrompt, type AttemptStaff } from '../src/features/assessments/api.ts';
import * as assessmentApiModule from '../src/features/assessments/api.ts';
import { HttpError } from '../src/lib/http-client.ts';
import type { HttpRequestOptions } from '../src/lib/http-client.ts';
import { fromBrazilDateTimeLocal, toBrazilDateTimeLocal } from '../src/features/assessments/lib/assessment-editor.ts';

const fields = { moduleId: 'm 1', title: 'Prova', description: 'Instruções', kind: 'quiz' as const, maxGrade: null, deadline: null, required: true, allowLate: false, questions: [{ source: 'bank' as const, questionId: 'q:1' }] };

test('assessment adapter encodes filters and IDs and separates draft, edit and publish commands', async () => {
  const calls: { path: string; options?: HttpRequestOptions }[] = [];
  const api = createAssessmentsApi({ request: async <T>(path: string, options?: HttpRequestOptions) => { calls.push({ path, options }); return { id: 'a:1', revision: 3, status: 'draft' } as T; } });
  await api.list({ subjectId: 's 1', status: 'published', kind: 'quiz' }, 2);
  await api.read('a:1');
  await api.create(fields, 'assessment-intent');
  await api.edit('a:1', { ...fields, confirmResetDrafts: true }, 2);
  await api.publish('a:1', 3, 'publish-intent');
  assert.match(calls[0].path, /subjectId=s\+1/);
  assert.match(calls[0].path, /page=2/);
  assert.equal(calls[1].path, '/assessments/a%3A1');
  assert.deepEqual(calls[2].options, { method: 'POST', json: fields, headers: { 'Idempotency-Key': 'assessment-intent' } });
  assert.deepEqual(calls[3].options, { method: 'PATCH', json: { ...fields, confirmResetDrafts: true, expectedRevision: 2 } });
  assert.deepEqual(calls[4].options, { method: 'POST', json: { expectedRevision: 3 }, headers: { 'Idempotency-Key': 'publish-intent' } });
});

test('work adapter freezes submissions, uses multipart upload, and rejects a late session response', async () => {
  let sessionKey = 'session-a';
  const calls: { path: string; options?: HttpRequestOptions }[] = [];
  const api = createAssessmentsApi({
    getSnapshot: () => ({ status: 'authenticated', user: null, sessionId: 'server-session-a', expiresAt: null, sessionKey, resourceEpoch: 0 }),
    request: async <T>(path: string, options?: HttpRequestOptions) => {
      calls.push({ path, options });
      if (path.startsWith('/submissions?')) return { items: [{ id: 'submission-1' }], page: 1, pageSize: 100, total: 1 } as T;
      if (path === '/files') return { id: 'file-1' } as T;
      if (path === '/submissions/submission-1/submit') return { id: 'submission-1', receipt: { id: 'receipt-1' } } as T;
      sessionKey = 'session-b';
      return {} as T;
    }
  });
  const list = await api.allSubmissions({ assessmentId: 'assessment:1' }, undefined, 'session-a');
  assert.equal(list[0].id, 'submission-1');
  const upload = new FormData();
  upload.set('purpose', 'work'); upload.set('parentId', 'assessment:1'); upload.set('file', new Blob(['x']), 'x.txt');
  await api.uploadWorkFile(upload, 'upload-intent', 'session-a');
  await api.submitWork('submission-1', 2, 'submit-intent', 'session-a');
  await assert.rejects(api.saveFeedback('submission-1', { expectedRevision: 3, comment: 'Privado', grade: 0 }, 'session-a'), (error: unknown) => error instanceof HttpError && error.kind === 'cancelled');
  assert.equal(calls[0].path, '/submissions?page=1&pageSize=100&assessmentId=assessment%3A1');
  assert.deepEqual(calls[1].options, { method: 'POST', body: upload, headers: { 'Idempotency-Key': 'upload-intent' } });
  assert.deepEqual(calls[2].options, { method: 'POST', json: { expectedRevision: 2 }, headers: { 'Idempotency-Key': 'submit-intent' } });
  assert.deepEqual(calls[3].options, { method: 'PATCH', json: { expectedRevision: 3, comment: 'Privado', grade: 0 } });
});

test('work submission retries keep one frozen revision and require acknowledgment before replacement', async () => {
  const command = createWorkSubmitCommand(() => 'work-submit-frozen-key');
  const sent: { revision: number; key: string }[] = [];
  const frozen = command.freeze(4);
  const send = async (value: { revision: number; key: string }) => {
    sent.push(value);
    if (sent.length === 1) throw new Error('connection lost after possible commit');
    return { receipt: 'receipt-stable' };
  };
  await assert.rejects(command.send(send), /connection lost/);
  assert.deepEqual(command.current(), frozen);
  assert.deepEqual(await command.send(send), { receipt: 'receipt-stable' });
  assert.deepEqual(sent, [frozen, frozen]);
  assert.throws(() => command.acknowledgeRevisionConflict(4), /revisão mais recente/i);
  command.acknowledgeRevisionConflict(5);
  assert.deepEqual(command.current(), null);
});

test('multi-step assessment save stops before publication when the authenticated session changes', async () => {
  let sessionKey = 'session-a';
  const calls: string[] = [];
  const api = createAssessmentsApi({
    getSnapshot: () => ({ status: 'authenticated', user: null, sessionId: 'server-session-a', expiresAt: null, sessionKey, resourceEpoch: 0 }),
    request: async <T>(path: string) => {
      calls.push(path);
      sessionKey = 'session-b';
      return { id: 'a1', revision: 3, status: 'draft' } as T;
    }
  });
  await assert.rejects(api.saveAndPublish({ id: 'a1', revision: 2, fields }, 'session-a', 'new-assessment-key'), (error: unknown) => error instanceof HttpError && error.kind === 'cancelled');
  assert.deepEqual(calls, ['/assessments/a1']);
});

test('assessment deadlines round-trip in fixed Brasília time without the device timezone', () => {
  assert.equal(fromBrazilDateTimeLocal('2031-11-02T20:15'), '2031-11-02T20:15:00-03:00');
  assert.equal(toBrazilDateTimeLocal('2031-11-02T23:15:00Z'), '2031-11-02T20:15');
  assert.equal(fromBrazilDateTimeLocal(''), null);
  assert.equal(toBrazilDateTimeLocal(null), '');
});

test('editing an existing Brasilia deadline by date preserves hidden seconds and milliseconds', () => {
  assert.equal(
    fromBrazilDateTimeLocal('2031-06-26T20:00', '2031-06-25T23:00:59.999Z'),
    '2031-06-26T20:00:59.999-03:00'
  );
});

test('assessment multi-page loads stop before issuing the next page after a session switch', async () => {
  let sessionKey = 'session-a';
  const calls: string[] = [];
  const api = createAssessmentsApi({
    getSnapshot: () => ({ status: 'authenticated', user: null, sessionId: 'server-session-a', expiresAt: null, sessionKey, resourceEpoch: 0 }),
    request: async <T>(path: string) => {
      calls.push(path);
      sessionKey = 'session-b';
      return { items: [{ id: 'a1' }], page: 1, pageSize: 1, total: 2 } as T;
    }
  });
  await assert.rejects(api.all({}, undefined, 'session-a'), (error: unknown) => error instanceof HttpError && error.kind === 'cancelled');
  assert.deepEqual(calls, ['/assessments?page=1&pageSize=100']);
});

test('attempt adapter uses authenticated routes, preserves null answers, and reuses explicit intent keys', async () => {
  const calls: { path: string; options?: HttpRequestOptions }[] = [];
  const attempt = { id: 'attempt:1' };
  const api = createAssessmentsApi({
    getSnapshot: () => ({ status: 'authenticated', user: null, sessionId: 'server-session-a', expiresAt: null, sessionKey: 'session-a', resourceEpoch: 0 }),
    request: async <T>(path: string, options?: HttpRequestOptions) => {
      calls.push({ path, options });
      return (path.startsWith('/attempts?') ? { items: [attempt], page: 1, pageSize: 100, total: 1 } : attempt) as T;
    }
  });

  await api.startAttempt('assessment:1', 'attempt-start-key', 'session-a');
  await api.allAttempts({ assessmentId: 'assessment:1' }, undefined, 'session-a');
  await api.readAttempt('attempt:1', undefined, 'session-a');
  await api.saveAttemptAnswers('attempt:1', 2, { q1: null }, 'session-a');
  await api.submitAttempt('attempt:1', 3, 'attempt-submit-key', 'session-a');
  await api.readAttemptResult('attempt:1', undefined, 'session-a');

  assert.equal(calls[0].path, '/attempts');
  assert.deepEqual(calls[0].options, { method: 'POST', json: { assessmentId: 'assessment:1' }, headers: { 'Idempotency-Key': 'attempt-start-key' } });
  assert.equal(calls[1].path, '/attempts?page=1&pageSize=100&assessmentId=assessment%3A1');
  assert.equal(calls[2].path, '/attempts/attempt%3A1');
  assert.deepEqual(calls[3], { path: '/attempts/attempt%3A1/answers', options: { method: 'PATCH', json: { expectedRevision: 2, answers: { q1: null } } } });
  assert.deepEqual(calls[4], { path: '/attempts/attempt%3A1/submit', options: { method: 'POST', json: { expectedRevision: 3 }, headers: { 'Idempotency-Key': 'attempt-submit-key' } } });
  assert.equal(calls[5].path, '/attempts/attempt%3A1/result');
});

test('attempt commands reject late session results instead of applying or navigating with them', async () => {
  let sessionKey = 'session-a';
  const calls: string[] = [];
  const api = createAssessmentsApi({
    getSnapshot: () => ({ status: 'authenticated', user: null, sessionId: 'server-session-a', expiresAt: null, sessionKey, resourceEpoch: 0 }),
    request: async <T>(path: string) => {
      calls.push(path);
      sessionKey = 'session-b';
      return { id: 'attempt-1' } as T;
    }
  });

  await assert.rejects(api.submitAttempt('attempt-1', 3, 'attempt-submit-key', 'session-a'), (error: unknown) => error instanceof HttpError && error.kind === 'cancelled');
  assert.deepEqual(calls, ['/attempts/attempt-1/submit']);
});

test('staff attempt prompts keep answer keys out of the client response type', () => {
  const prompt = { id: 'q1', subject: 'MatemÃ¡tica', topic: 'RazÃµes', difficulty: 'easy' as const, institution: 'AJA', year: 2031, statement: 'Enunciado', options: ['A', 'B'], image: null } satisfies AttemptQuestionPrompt;
  const staffAttempt = { questions: [prompt] } satisfies Pick<AttemptStaff, 'questions'>;
  assert.deepEqual(staffAttempt.questions, [prompt]);
  assert.equal('correct' in staffAttempt.questions[0], false);
  assert.equal('explanation' in staffAttempt.questions[0], false);
});

test('attempt submit retries reuse the frozen POST intent without autosaving again', async () => {
  type FrozenIntent = { revision: number; key: string };
  type CreateSubmitter = (makeKey: () => string) => {
    submit: <T>(prepare: () => Promise<number>, send: (intent: FrozenIntent) => Promise<T>) => Promise<T>;
    current: () => FrozenIntent | null;
  };
  const createSubmitter = (assessmentApiModule as unknown as { createAttemptSubmitCommand?: CreateSubmitter }).createAttemptSubmitCommand;
  assert.equal(typeof createSubmitter, 'function', 'attempt submission needs a frozen retry controller');
  if (!createSubmitter) return;

  const patchCalls: number[] = [];
  const postCalls: FrozenIntent[] = [];
  let committedReceipt: { id: string } | null = null;
  let loseFirstResponse = true;
  const submitter = createSubmitter(() => 'frozen-intent-1');
  const send = (intent: FrozenIntent) => {
    postCalls.push(intent);
    if (!committedReceipt) committedReceipt = { id: 'receipt-1' };
    if (loseFirstResponse) { loseFirstResponse = false; throw new Error('connection dropped after commit'); }
    return Promise.resolve(committedReceipt);
  };
  const prepare = async () => { patchCalls.push(2); return 2; };

  await assert.rejects(submitter.submit(prepare, send), /connection dropped after commit/);
  assert.deepEqual(await submitter.submit(prepare, send), { id: 'receipt-1' });
  assert.deepEqual(patchCalls, [2]);
  assert.deepEqual(postCalls, [{ revision: 2, key: 'frozen-intent-1' }, { revision: 2, key: 'frozen-intent-1' }]);
});

test('attempt submit retries after a pre-commit network failure with the same POST body and key', async () => {
  type FrozenIntent = { revision: number; key: string };
  type CreateSubmitter = (makeKey: () => string) => {
    submit: <T>(prepare: () => Promise<number>, send: (intent: FrozenIntent) => Promise<T>) => Promise<T>;
    current: () => FrozenIntent | null;
  };
  const createSubmitter = (assessmentApiModule as unknown as { createAttemptSubmitCommand?: CreateSubmitter }).createAttemptSubmitCommand;
  assert.equal(typeof createSubmitter, 'function', 'attempt submission needs a frozen retry controller');
  if (!createSubmitter) return;

  let saves = 0;
  const posts: FrozenIntent[] = [];
  let requestReachedServer = false;
  const submitter = createSubmitter(() => 'frozen-intent-before-commit');
  const prepare = async () => { saves++; return 3; };
  const send = async (intent: FrozenIntent) => {
    posts.push(intent);
    if (!requestReachedServer) { requestReachedServer = true; throw new Error('connection dropped before commit'); }
    return { receipt: 'receipt-2' };
  };

  await assert.rejects(submitter.submit(prepare, send), /connection dropped before commit/);
  assert.deepEqual(await submitter.submit(prepare, send), { receipt: 'receipt-2' });
  assert.equal(saves, 1);
  assert.deepEqual(posts, [{ revision: 3, key: 'frozen-intent-before-commit' }, { revision: 3, key: 'frozen-intent-before-commit' }]);
});

test('quiz submit controller replaces a rejected revision only after latest answers are reviewed', async () => {
  type FrozenIntent = { revision: number; key: string };
  type CreateSubmitter = (makeKey: () => string) => {
    submit: <T>(prepare: () => Promise<number>, send: (intent: FrozenIntent) => Promise<T>) => Promise<T>;
    current: () => FrozenIntent | null;
    acknowledgeRevisionConflict: (reviewedRevision: number) => void;
  };
  const createSubmitter = (assessmentApiModule as unknown as { createAttemptSubmitCommand?: CreateSubmitter }).createAttemptSubmitCommand;
  assert.equal(typeof createSubmitter, 'function', 'QuizSession uses the frozen submit controller');
  if (!createSubmitter) return;

  let currentRevision = 2;
  let saveCalls = 0;
  let keyNumber = 0;
  const posts: FrozenIntent[] = [];
  const submitter = createSubmitter(() => `intent-${++keyNumber}`);
  const prepare = async () => { saveCalls++; return currentRevision; };
  const send = async (intent: FrozenIntent) => {
    posts.push(intent);
    if (posts.length === 1) {
      currentRevision = 3;
      throw new HttpError('conflict', 'Outra aba salvou respostas mais recentes.', { status: 409, code: 'REVISION_CONFLICT' });
    }
    return { receipt: 'receipt-1' };
  };

  await assert.rejects(submitter.submit(prepare, send), (error: unknown) => error instanceof HttpError && error.code === 'REVISION_CONFLICT');
  assert.deepEqual(submitter.current(), { revision: 2, key: 'intent-1' });
  assert.equal(saveCalls, 1);
  assert.deepEqual(posts, [{ revision: 2, key: 'intent-1' }]);
  assert.throws(() => submitter.acknowledgeRevisionConflict(2), /reviewed revision/i, 'the stale revision cannot be acknowledged');
  assert.deepEqual(submitter.current(), { revision: 2, key: 'intent-1' });

  const latest = { revision: currentRevision, answers: { q1: 1 } };
  assert.deepEqual(latest.answers, { q1: 1 }, 'the UI must inspect the latest server answers before the explicit acknowledgment');
  submitter.acknowledgeRevisionConflict(latest.revision);
  currentRevision = 4;
  assert.deepEqual(await submitter.submit(prepare, send), { receipt: 'receipt-1' });
  assert.equal(saveCalls, 2);
  assert.deepEqual(posts, [{ revision: 2, key: 'intent-1' }, { revision: 4, key: 'intent-2' }]);
});

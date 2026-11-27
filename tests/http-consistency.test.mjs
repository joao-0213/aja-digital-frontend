import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import jsonServer from 'json-server';
import { createTransactionStore, atomicPersist } from '../server/transaction-store.mjs';
import { createCommandService, HttpError } from '../server/command-service.mjs';
import { openRepository } from '../server/repository.mjs';
import { canManageSubject } from '../src/lib/access.ts';

async function setup(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aja-consistency-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { filename } = openRepository(directory, { baseDate: '2031-06-15' });
  const store = createTransactionStore({ filename, ...options });
  const service = createCommandService({
    store,
    resolveActor: (req) => req.headers['x-test-actor'],
    now: options.now ?? (() => '2031-06-15T12:00:00Z')
  });
  const app = jsonServer.create();
  app.use(jsonServer.bodyParser);
  app.use((req, res, next) => {
    options.onRequest?.(req);
    if (req.headers['x-test-drop-response'])
      res.json = () => {
        res.destroy();
        return res;
      };
    next();
  });
  // Controlled test actors exist ONLY in this harness, never in the production app.
  const authorize =
    options.authorize ??
    ((state, actor, id) => {
      if (!canManageSubject(state, actor, id))
        throw new HttpError(403, 'FORBIDDEN', 'Operação não permitida.');
    });
  const project =
    options.project ?? ((row) => ({ id: row.id, name: row.name, revision: row.revision }));
  app.get(
    '/api/v1/subjects/:id',
    service.read({
      authorize: (s, a, req) => authorize(s, a, req.params.id),
      select: (s, _a, req) => s.subjects.find((r) => r.id === req.params.id),
      project
    })
  );
  app.patch(
    '/api/v1/subjects/:id',
    service.command({
      operation: 'PATCH /subjects/{id}',
      target: (req) => req.params.id,
      authorize: (s, a, req) => authorize(s, a, req.params.id),
      expected: (req) => [
        { collection: 'subjects', id: req.params.id, revision: req.body.expectedRevision }
      ],
      apply:
        options.apply ??
        ((draft, actor, req) => {
          if (typeof req.body.name !== 'string' || !req.body.name.trim())
            throw new HttpError(422, 'VALIDATION_ERROR', 'Informe o nome.');
          const subject = draft.subjects.find((r) => r.id === req.params.id);
          subject.name = req.body.name;
          draft.modules.find((r) => r.subjectId === subject.id).description = req.body.name;
          return subject;
        }),
      project,
      replayProject: Object.hasOwn(options, 'replayProject') ? options.replayProject : (dto) => dto
    })
  );
  app.post(
    '/api/v1/attempts/:id/submit',
    service.command({
      operation: 'POST /attempts/{id}/submit',
      target: (req) => req.params.id,
      requireIdempotency: true,
      authorize: (s, a, req) => {
        if (!s.attempts.some((r) => r.id === req.params.id && r.userId === a.id))
          throw new HttpError(403, 'FORBIDDEN', 'Operação não permitida.');
      },
      apply: (s, _actor, req) => {
        const attempt = s.attempts.find((r) => r.id === req.params.id);
        attempt.submittedAt = '2031-06-15T12:00:00Z';
        return { id: attempt.id, receipt: 'fixed-receipt' };
      },
      project: (result) => result,
      replayProject: (result) => result
    })
  );
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      })
  );
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const request = (route, actor, body, key, drop = false) =>
    fetch(base + route, {
      method: body ? (route.includes('/submit') ? 'POST' : 'PATCH') : 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(actor ? { 'x-test-actor': actor } : {}),
        ...(key ? { 'Idempotency-Key': key } : {}),
        ...(drop ? { 'x-test-drop-response': '1' } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
  return { store, request, filename };
}

test('HTTP resolves current actor, denies direct ID and returns only explicitly projected fields', async (t) => {
  const { request } = await setup(t);
  assert.equal((await request('/subjects/s1', undefined)).status, 401);
  assert.equal((await request('/subjects/s1', 'teacher-unassigned')).status, 403);
  assert.equal((await request('/subjects/s1', 'student-inactive')).status, 401);
  const result = await request('/subjects/s1', 'teacher-a');
  assert.deepEqual(Object.keys(await result.json()).sort(), ['id', 'name', 'revision']);
});

test('HTTP concurrent teachers get one commit and one 409, changing all records and audit together', async (t) => {
  const { request, store } = await setup(t);
  const responses = await Promise.all(
    ['teacher-a', 'teacher-b'].map((actor, i) =>
      request('/subjects/s1', actor, { name: `Edit ${i}`, expectedRevision: 1 })
    )
  );
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  const state = await store.read();
  const subject = state.subjects.find((s) => s.id === 's1');
  assert.equal(subject.revision, 2);
  assert.equal(state.modules.find((m) => m.id === 'm1').description, subject.name);
  assert.equal(state.modules.find((m) => m.id === 'm1').revision, 2);
  assert.equal(state.audit.filter((a) => ['s1', 'm1'].includes(a.targetId)).length, 2);
  const conflict = await responses.find((r) => r.status === 409).json();
  assert.equal(conflict.error.code, 'REVISION_CONFLICT');
});

test('revoked access is checked against latest state after queued edits and never leaks conflict metadata', async (t) => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let entered;
  const waiting = new Promise((resolve) => {
    entered = resolve;
  });
  let received;
  const incoming = new Promise((resolve) => {
    received = resolve;
  });
  const { request, store } = await setup(t, {
    persist: async (filename, state) => {
      entered();
      await gate;
      atomicPersist(filename, state);
    },
    onRequest: () => received()
  });
  const revocation = store.transact((state) => {
    state.subjects.find((s) => s.id === 's1').teacherIds = ['teacher-b'];
  });
  await waiting;
  const pending = request('/subjects/s1', 'teacher-a', { name: 'Forbidden', expectedRevision: 1 });
  await incoming;
  release();
  await revocation;
  const result = await pending;
  assert.equal(result.status, 403);
  assert.equal((await result.json()).error.details, undefined);
  assert.notEqual((await store.read()).subjects.find((s) => s.id === 's1').name, 'Forbidden');
});

test('persistence failure returns 500 and preserves all records audit and idempotency on disk', async (t) => {
  const { request, store, filename } = await setup(t, {
    persist: () => {
      throw new Error('disk full');
    }
  });
  const before = fs.readFileSync(filename, 'utf8');
  const result = await request('/subjects/s1', 'teacher-a', {
    name: 'Not saved',
    expectedRevision: 1
  });
  assert.equal(result.status, 500);
  assert.equal((await result.json()).error.code, 'PERSISTENCE_FAILED');
  assert.equal(
    (await request('/attempts/attempt-draft/submit', 'student', {}, 'failure-001')).status,
    500
  );
  assert.equal(fs.readFileSync(filename, 'utf8'), before);
  assert.equal((await store.read()).subjects.find((s) => s.id === 's1').revision, 1);
});

test('lost response replay returns stored receipt once; key binds actor operation target and body', async (t) => {
  const { request, store } = await setup(t);
  await assert.rejects(
    request('/attempts/attempt-draft/submit', 'student', { a: 1, b: 2 }, 'intent-001', true)
  );
  const replay = await request(
    '/attempts/attempt-draft/submit',
    'student',
    { b: 2, a: 1 },
    'intent-001'
  );
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), { id: 'attempt-draft', receipt: 'fixed-receipt' });
  assert.equal((await store.read()).idempotency.length, 1);
  assert.equal((await store.read()).audit.filter((a) => a.targetId === 'attempt-draft').length, 1);
  assert.equal(
    (await request('/attempts/attempt-draft/submit', 'student', { changed: true }, 'intent-001'))
      .status,
    409
  );
  assert.equal(
    (await request('/attempts/attempt-sent/submit', 'student', {}, 'intent-001')).status,
    409
  );
  assert.equal(
    (await request('/attempts/attempt-draft/submit', 'student-two', {}, 'intent-001')).status,
    403
  );
  await store.transact((state) => {
    state.users.find((u) => u.id === 'student').active = false;
  });
  assert.equal(
    (await request('/attempts/attempt-draft/submit', 'student', { a: 1, b: 2 }, 'intent-001'))
      .status,
    401
  );
});

test('separate store instances for the same file share serialization and read the latest committed state', async (t) => {
  let entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const { store, filename } = await setup(t, {
    persist: async (file, state) => {
      entered();
      await gate;
      atomicPersist(file, state);
    }
  });
  const other = createTransactionStore({ filename });
  const first = store.transact((state) => {
    state.meta.count = (state.meta.count ?? 0) + 1;
  });
  await started;
  let secondExecuted = false;
  const second = other.transact((state) => {
    secondExecuted = true;
    state.meta.count = (state.meta.count ?? 0) + 1;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(secondExecuted, false);
  release();
  await Promise.all([first, second]);
  assert.equal((await other.read()).meta.count, 2);
});

test('replay preserves a derived DTO without applying its raw-record projector twice or storing private fields', async (t) => {
  const { request, store } = await setup(t, {
    project: (row) => ({ id: row.id, teamSize: row.teacherIds.length })
  });
  const body = { name: 'Derived', expectedRevision: 1 };
  const first = await request('/subjects/s1', 'teacher-a', body, 'derived-001');
  assert.equal(first.status, 200);
  const dto = await first.json();
  const second = await request('/subjects/s1', 'teacher-a', body, 'derived-001');
  assert.equal(second.status, 200);
  assert.deepEqual(await second.json(), dto);
  assert.deepEqual((await store.read()).idempotency[0].result, { id: 's1', teamSize: 2 });
});

test('idempotency intent expires after 24 hours while business receipts remain in their domain records', async (t) => {
  let clock = '2031-06-15T12:00:00Z';
  const { request, store } = await setup(t, { now: () => clock });
  assert.equal(
    (
      await request(
        '/subjects/s1',
        'teacher-a',
        { name: 'Day one', expectedRevision: 1 },
        'expires-001'
      )
    ).status,
    200
  );
  clock = '2031-06-16T11:59:59Z';
  assert.equal(
    (
      await request(
        '/subjects/s1',
        'teacher-a',
        { name: 'Day two', expectedRevision: 2 },
        'expires-001'
      )
    ).status,
    409
  );
  clock = '2031-06-16T12:00:01Z';
  assert.equal(
    (
      await request(
        '/subjects/s1',
        'teacher-a',
        { name: 'Day two', expectedRevision: 2 },
        'expires-001'
      )
    ).status,
    200
  );
  assert.equal((await store.read()).idempotency.length, 1);
});

test('an accidentally asynchronous authorization callback cannot bypass the command policy', async (t) => {
  const { request, store } = await setup(t, { authorize: async () => false });
  const result = await request('/subjects/s1', 'teacher-unassigned', {
    name: 'Async bypass',
    expectedRevision: 1
  });
  assert.equal(result.status, 500);
  assert.notEqual((await store.read()).subjects.find((s) => s.id === 's1').name, 'Async bypass');
});

test('atomic writer removes its temporary file and preserves original bytes when rename fails', async (t) => {
  const { filename } = await setup(t);
  const before = fs.readFileSync(filename, 'utf8');
  const spy = t.mock.method(fs, 'renameSync', () => {
    throw new Error('rename denied');
  });
  assert.throws(() => atomicPersist(filename, { changed: true }), /rename denied/);
  spy.mock.restore();
  assert.equal(fs.readFileSync(filename, 'utf8'), before);
  assert.deepEqual(
    fs.readdirSync(path.dirname(filename)).filter((name) => name.startsWith('.commit-')),
    []
  );
});

test('idempotent handlers must explicitly declare how the stored DTO is authorized for replay', async (t) => {
  const { request, store } = await setup(t, { replayProject: undefined });
  assert.equal(
    (
      await request(
        '/subjects/s1',
        'teacher-a',
        { name: 'No replay policy', expectedRevision: 1 },
        'policy-001'
      )
    ).status,
    500
  );
  assert.equal((await store.read()).subjects.find((s) => s.id === 's1').revision, 1);
});

test('same-role replay reprojects fields when a secondary scope is revoked but the target remains authorized', async (t) => {
  const scoped = (row, actor, state) => ({
    id: row.id,
    ...(state.subjects.find((s) => s.id === 's-empty').teacherIds.includes(actor.id)
      ? { secondary: 'visible-only-in-secondary-scope' }
      : {})
  });
  const { request, store } = await setup(t, { project: scoped, replayProject: scoped });
  const body = { name: 'Scoped', expectedRevision: 1 };
  assert.ok(
    (await (await request('/subjects/s1', 'teacher-a', body, 'scope-001')).json()).secondary
  );
  await store.transact((state) => {
    state.subjects.find((s) => s.id === 's-empty').teacherIds = [];
  });
  const replay = await request('/subjects/s1', 'teacher-a', body, 'scope-001');
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), { id: 's1' });
});

test('rejected async apply is refused without unhandled rejection or a partial commit', async (t) => {
  const { request, store } = await setup(t, {
    apply: async () => {
      throw new Error('async apply programming error');
    }
  });
  assert.equal(
    (await request('/subjects/s1', 'teacher-a', { name: 'Async', expectedRevision: 1 })).status,
    500
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await store.read()).subjects.find((s) => s.id === 's1').revision, 1);
});

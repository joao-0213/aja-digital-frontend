import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import jsonServer from 'json-server';
import { createHttpClient, HttpError as ClientError } from '../src/lib/http-client.ts';
import { createTransactionStore } from '../server/transaction-store.mjs';
import { createCommandService, HttpError as ServiceError } from '../server/command-service.mjs';
import { openRepository } from '../server/repository.mjs';

test('real client and command service agree on session errors, projections and concurrent conflicts', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aja-http-stack-'));
  const { filename } = openRepository(directory, { baseDate: '2031-06-15' });
  const store = createTransactionStore({ filename });
  // Actor transport exists only in this private harness, never in the product app.
  const service = createCommandService({ store, resolveActor: req => req.headers['x-test-actor'] });
  const app = jsonServer.create();
  app.use(jsonServer.bodyParser);
  app.patch('/api/v1/subjects/:id', service.command({
    operation: 'PATCH /subjects/{id}',
    target: req => req.params.id,
    authorize: (state, actor, req) => {
      const subject = state.subjects.find(row => row.id === req.params.id);
      if (!subject?.teacherIds.includes(actor.id)) throw new ServiceError(403, 'FORBIDDEN', 'Operação não permitida.');
    },
    expected: req => [{ collection: 'subjects', id: req.params.id, revision: req.body.expectedRevision }],
    apply: (state, _actor, req) => {
      const subject = state.subjects.find(row => row.id === req.params.id);
      subject.name = req.body.name;
      return subject;
    },
    project: row => ({ id: row.id, name: row.name, revision: row.revision })
  }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const client = createHttpClient({ baseUrl: `http://127.0.0.1:${server.address().port}/api/v1` });
  const json = { expectedRevision: 1, name: 'Edição compartilhada' };
  await assert.rejects(client.request('/subjects/s1', { method: 'PATCH', json }), error => error instanceof ClientError && error.kind === 'session' && error.status === 401);
  const responses = await Promise.allSettled(['teacher-a', 'teacher-b'].map(actor => client.request('/subjects/s1', { method: 'PATCH', json, headers: { 'x-test-actor': actor } })));
  const success = responses.find(result => result.status === 'fulfilled');
  const conflict = responses.find(result => result.status === 'rejected');
  assert.ok(success);
  assert.deepEqual(Object.keys(success.value).sort(), ['id', 'name', 'revision']);
  assert.equal(success.value.revision, 2);
  assert.ok(conflict?.reason instanceof ClientError);
  assert.equal(conflict.reason.kind, 'conflict');
  assert.equal(conflict.reason.code, 'REVISION_CONFLICT');
  assert.equal((await store.read()).subjects.find(row => row.id === 's1').revision, 2);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server/app.mjs';
import { openRepository } from '../server/repository.mjs';
import { createTransactionStore } from '../server/transaction-store.mjs';
import { createHttpClient } from '../src/lib/http-client.ts';
import { createStudentsApi } from '../src/features/students/api.ts';
import {
  createBatchItems,
  parseBatchEmails,
  runBatchConfirm,
  runBatchPreview,
  summarizeBatch,
} from '../src/features/students/enrollment-batch.ts';

test('batch flow works end-to-end against the real administration HTTP server without altering backend contracts', async t => {
  const origin = 'http://127.0.0.1:3000';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aja-batch-enr-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { filename } = openRepository(dir, { baseDate: '2031-06-15' });
  const store = createTransactionStore({ filename });
  const server = createApp({ origins: [origin], frontendOrigin: origin, store, now: () => '2031-06-15T12:00:00Z' }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));

  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;

  let cookie = '';
  const authedFetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('Origin', origin);
    if (cookie) headers.set('Cookie', cookie);
    const response = await fetch(input, { ...init, headers });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return response;
  };

  const http = createHttpClient({ baseUrl, fetch: authedFetch });
  await http.request('/auth/login', { method: 'POST', json: { email: 'admin@aja.local.test', password: 'AjaLocal-admin-2031!' } });
  const api = createStudentsApi(http);

  const raw = [
    '  STUDENT-EMPTY@aja.local.test ',
    'novo.lote@aja.local.test; student-empty@aja.local.test',
    'student@aja.local.test, teacher-a@aja.local.test',
    'student-inactive@aja.local.test formato-errado',
  ].join('\n');

  const parsed = parseBatchEmails(raw);
  assert.equal(parsed.duplicatesRemoved, 1);
  assert.equal(parsed.valid.length, 5);
  assert.equal(parsed.invalid.length, 1);

  const items = createBatchItems(parsed);
  const previewRun = await runBatchPreview(items, email => api.preview('c-empty', email));
  assert.equal(previewRun.completed, 5);

  const byEmail = Object.fromEntries(previewRun.items.map(item => [item.email, item]));
  assert.equal(byEmail['student-empty@aja.local.test'].status, 'ready');
  assert.equal(byEmail['novo.lote@aja.local.test'].status, 'ready');
  assert.equal(byEmail['student@aja.local.test'].status, 'blocked');
  assert.equal(byEmail['student@aja.local.test'].preview?.otherClass?.id, 'c1');
  assert.equal(byEmail['teacher-a@aja.local.test'].status, 'blocked');
  assert.equal(byEmail['student-inactive@aja.local.test'].status, 'blocked');
  assert.equal(byEmail['formato-errado'].status, 'invalid');

  const confirmRun = await runBatchConfirm(previewRun.items, (email, key) => api.add('c-empty', email, key));
  assert.equal(confirmRun.succeeded, 2);
  assert.equal(confirmRun.failed, 0);

  const summary = summarizeBatch(confirmRun.items);
  assert.equal(summary.activeCount, 1);
  assert.equal(summary.pendingCount, 1);
  assert.equal(summary.blockedCount, 3);
  assert.equal(summary.invalidCount, 1);

  const activeStudents = await api.list('c-empty', '', false, 1);
  assert.ok(activeStudents.items.some(s => s.email === 'student-empty@aja.local.test'));
  const pendingEnrollments = await api.enrollments('c-empty', '', false, 1);
  assert.ok(pendingEnrollments.items.some(e => e.email === 'novo.lote@aja.local.test' && e.status === 'pending'));
});

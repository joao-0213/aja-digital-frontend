import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server/app.mjs';
import { openRepository } from '../server/repository.mjs';
import { createTransactionStore } from '../server/transaction-store.mjs';

test('acervo HTTP filtra antes da paginação e libera gabarito somente na prática', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aja-questions-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { filename } = openRepository(directory, { baseDate: '2031-06-15' });
  const store = createTransactionStore({ filename });
  const server = createApp({
    origins: ['http://127.0.0.1:3000'],
    frontendOrigin: 'http://127.0.0.1:3000',
    store
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      })
  );
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const login = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { Origin: 'http://127.0.0.1:3000', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'student@aja.local.test', password: 'AjaLocal-student-2031!' })
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const call = (url, body) =>
    fetch(base + url, {
      method: body ? 'POST' : 'GET',
      headers: {
        Origin: 'http://127.0.0.1:3000',
        Cookie: cookie,
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
  assert.equal((await fetch(base + '/questions')).status, 401);
  const response = await call(
    '/questions?subject=Matem%C3%A1tica&difficulty=easy&page=2&pageSize=1'
  );
  assert.equal(response.status, 200);
  const page = await response.json();
  assert.equal(page.total, 2);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].id, 'q2');
  assert.equal('correct' in page.items[0], false);
  assert.equal('explanation' in page.items[0], false);
  const detail = await (await call('/questions/q2')).json();
  assert.equal('correct' in detail, false);
  assert.equal(detail.image.alt, 'Dois grupos com dois pontos cada.');
  assert.equal((await call('/files/file-question/content')).status, 200);
  const result = await (await call('/questions/q2/practice', { choice: 1 })).json();
  assert.equal(result.isCorrect, true);
  assert.equal(result.correct, 1);
  assert.equal((await call('/questions/q2/practice', { choice: 4 })).status, 422);
  assert.equal((await call('/questions/qa1')).status, 404);
  assert.equal((await call('/questions?difficulty=easy&difficulty=hard')).status, 422);
  assert.equal((await call('/questions?unexpected=x')).status, 422);
  assert.equal(
    (await call('/questions/q2/practice', { choice: 1, expectedRevision: 1 })).status,
    422
  );
  assert.equal((await call('/questions/q2%2Fpractice')).status, 404);
  await store.transact((state) => {
    state.questions[0].image = {
      src: 'https://untrusted.example/image',
      alt: 'x',
      secret: 'private'
    };
  });
  assert.equal('image' in (await (await call('/questions/q1')).json()), false);
  await store.transact((state) => {
    state.questions.push({ ...state.questions[0], id: 'private', origin: 'author' });
    state.questions.find((q) => q.id === 'q2').deletedAt = '2031-06-15T12:00:00Z';
  });
  assert.equal((await call('/questions/private')).status, 404);
  assert.equal((await call('/questions/private/practice', { choice: 0 })).status, 404);
  assert.equal((await call('/questions/q2')).status, 404);
  assert.equal((await call('/questions/q2/practice', { choice: 1 })).status, 404);
  assert.equal((await call('/files/file-question/content')).status, 404);
  assert.equal((await (await call('/questions')).json()).total, 1);
  await store.transact((state) => {
    const template = state.questions[0];
    for (let i = 0; i < 110; i++)
      state.questions.push({
        ...template,
        id: `bulk-${String(i).padStart(3, '0')}`,
        topic: i % 2 ? 'Outro' : 'Busca',
        statement: 'Conteúdo de teste'
      });
  });
  const large = await (await call('/questions?topic=Busca&page=2&pageSize=30')).json();
  assert.equal(large.total, 55);
  assert.equal(large.items.length, 25);
  assert.equal(large.items[0].id, 'bulk-060');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.mjs';
import { openRepository } from '../server/repository.mjs';
import { createTransactionStore, atomicPersist } from '../server/transaction-store.mjs';

const origin = 'http://127.0.0.1:3000';

async function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aja-forum-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { filename } = openRepository(directory, { baseDate: '2031-06-15' });
  const store = createTransactionStore({ filename, persist: atomicPersist });
  const server = createApp({
    origins: [origin],
    frontendOrigin: origin,
    store,
    now: () => '2031-06-15T12:00:00Z'
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
  async function client(id) {
    let cookie = '';
    const call = async (route, body, method = body ? 'POST' : 'GET', key = randomUUID()) => {
      const response = await fetch(base + route, {
        method,
        headers: {
          Origin: origin,
          ...(body ? { 'Content-Type': 'application/json', 'Idempotency-Key': key } : {}),
          ...(cookie ? { Cookie: cookie } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      if (response.headers.get('set-cookie'))
        cookie = response.headers.get('set-cookie').split(';')[0];
      return response;
    };
    assert.equal(
      (
        await call('/auth/login', {
          email: `${id}@aja.local.test`,
          password: `AjaLocal-${id}-2031!`
        })
      ).status,
      200
    );
    const upload = async (route, form) =>
      fetch(base + route, {
        method: 'POST',
        headers: {
          Origin: origin,
          'Idempotency-Key': randomUUID(),
          ...(cookie ? { Cookie: cookie } : {})
        },
        body: form
      });
    return {
      call,
      upload,
      get cookie() {
        return cookie;
      }
    };
  }
  return { client, store, base };
}

test('forum keeps concurrent replies and repeated votes/reads idempotent across sessions', async (t) => {
  const { client, store } = await fixture(t);
  const a = await client('student'),
    b = await client('student-two');
  const [left, right] = await Promise.all([
    a.call('/topics/topic1/replies', { body: 'Resposta paralela A' }),
    b.call('/topics/topic1/replies', { body: 'Resposta paralela B' })
  ]);
  assert.equal(left.status, 201);
  assert.equal(right.status, 201);
  const replies = (await (await a.call('/topics/topic1')).json()).replies;
  assert.equal(replies.filter((row) => row.body.startsWith('Resposta paralela')).length, 2);
  const intent = randomUUID(),
    fields = { body: 'Resposta com repetição segura.' };
  const first = await a.call('/topics/topic1/replies', fields, 'POST', intent),
    replay = await a.call('/topics/topic1/replies', fields, 'POST', intent);
  assert.equal((await first.json()).replies.filter((row) => row.body === fields.body).length, 1);
  assert.equal((await replay.json()).replies.filter((row) => row.body === fields.body).length, 1);
  const replyId = replies.find((row) => row.body === 'Resposta paralela B').id;
  assert.equal(
    (await a.call('/topics/topic1/replies/' + replyId + '/vote', { voted: true })).status,
    200
  );
  assert.equal(
    (await a.call('/topics/topic1/replies/' + replyId + '/vote', { voted: true })).status,
    200
  );
  assert.deepEqual(
    (await store.read()).topics
      .find((row) => row.id === 'topic1')
      .replies.find((row) => row.id === replyId).votes,
    { student: 1 }
  );
  assert.equal((await a.call('/topics/topic1/read', {})).status, 200);
  assert.equal((await a.call('/topics/topic1/read', {})).status, 200);
  assert.equal(
    (await store.read()).topics
      .find((row) => row.id === 'topic1')
      .readBy.filter((id) => id === 'student').length,
    1
  );
});

test('new replies reset other readers, accepted reply withdrawal preserves audit, archived staff may read only', async (t) => {
  const { client, store } = await fixture(t);
  const teacher = await client('teacher-a'),
    student = await client('student'),
    otherStudent = await client('student-two');
  await store.transact((state) => {
    state.topics.find((row) => row.id === 'topic1').readBy = [
      'student',
      'student-two',
      'teacher-a'
    ];
  });
  const created = await teacher.call('/topics/topic1/replies', { body: 'Resposta para retirada' });
  const replyTopic = await created.json();
  const reply = replyTopic.replies.find((row) => row.body === 'Resposta para retirada');
  assert.deepEqual((await store.read()).topics.find((row) => row.id === 'topic1').readBy, [
    'teacher-a'
  ]);
  assert.equal(
    (await otherStudent.call('/topics/topic1/solution', { replyId: reply.id })).status,
    403
  );
  const topic = await (await student.call('/topics/topic1')).json();
  assert.equal(
    (
      await student.call('/topics/topic1/solution', {
        expectedRevision: topic.revision,
        replyId: reply.id
      })
    ).status,
    200
  );
  const current = await (await teacher.call('/topics/topic1')).json();
  assert.equal(
    (
      await teacher.call(`/topics/topic1/replies/${reply.id}/withdraw`, {
        expectedRevision: current.revision
      })
    ).status,
    200
  );
  const saved = await store.read();
  assert.equal(
    saved.topics.find((row) => row.id === 'topic1').replies.find((row) => row.id === 'reply1')
      .accepted,
    false
  );
  assert.ok(
    saved.audit.some(
      (row) =>
        row.collection === 'forumReplies' && row.targetId === reply.id && row.action === 'delete'
    )
  );
  await store.transact((state) => {
    state.classes.find((row) => row.id === 'c-closed').active = false;
    state.topics.find((row) => row.id === 'topic-closed').readBy = [];
  });
  assert.equal(
    (await teacher.call('/topics?subjectId=s-closed&page=1&pageSize=20&sort=-createdAt')).status,
    200
  );
  assert.equal((await teacher.call('/topics/topic-closed/read', {})).status, 200);
  assert.deepEqual((await store.read()).topics.find((row) => row.id === 'topic-closed').readBy, [
    'teacher-a'
  ]);
  assert.equal(
    (await teacher.call('/topics/topic-closed/replies', { body: 'Resposta em turma encerrada' }))
      .status,
    403
  );
  await store.transact((state) => {
    state.classes.find((row) => row.id === 'c1').studentIds = ['student-two'];
  });
  assert.equal((await student.call('/topics/topic1')).status, 404);
  assert.equal((await student.call('/files/file-forum/content')).status, 404);
});

test('forum search includes replies and withdrawn topics are omitted', async (t) => {
  const { client, store } = await fixture(t);
  const student = await client('student');
  const result = await student.call(
    '/topics?subjectId=s1&q=mesmo%20fator&page=1&pageSize=20&sort=-createdAt'
  );
  const resultBody = await result.json();
  assert.equal(result.status, 200, JSON.stringify(resultBody));
  assert.ok(resultBody.items.some((row) => row.id === 'topic1'));
  const topic = await (await student.call('/topics/topic1')).json();
  assert.equal(
    (await student.call('/topics/topic1/withdraw', { expectedRevision: topic.revision })).status,
    200
  );
  assert.equal((await student.call('/topics/topic1')).status, 404);
  assert.ok((await store.read()).topics.find((row) => row.id === 'topic1').deletedAt);
});

test('replaying an idempotent topic create after withdrawal does not resurrect visibility', async (t) => {
  const { client } = await fixture(t);
  const student = await client('student');
  const fields = {
    classId: 'c1',
    subjectId: 's1',
    title: 'Pergunta para retirar',
    body: 'Uma dúvida que será retirada depois da publicação.',
    tags: [],
    target: null,
    attachmentId: null
  };
  const key = randomUUID();
  const created = await student.call('/topics', fields, 'POST', key);
  assert.equal(created.status, 201);
  const topic = await created.json();
  const detail = await student.call(`/topics/${topic.id}`);
  assert.equal(detail.status, 200);
  const withdrawn = await student.call(`/topics/${topic.id}/withdraw`, {
    expectedRevision: topic.revision
  });
  assert.equal(withdrawn.status, 200);
  assert.equal((await student.call(`/topics/${topic.id}`)).status, 404);
  const replay = await student.call('/topics', fields, 'POST', key);
  assert.equal(replay.status, 404, 'replay must use current visible-read projection');
  assert.equal((await student.call(`/topics/${topic.id}`)).status, 404);
});

test('forum attachment upload binds contextual references and stops serving bytes after enrollment revocation', async (t) => {
  const { client, store } = await fixture(t);
  const student = await client('student'),
    peer = await client('student-two');
  const pdf = new Blob([Buffer.from('%PDF-1.4\nfixture bytes\n%%EOF', 'utf8')], {
    type: 'application/pdf'
  });
  const form = new FormData();
  form.set('purpose', 'forum');
  form.set('parentId', 's1');
  form.set('file', pdf, 'duvida.pdf');
  const uploaded = await student.upload('/files', form);
  assert.equal(uploaded.status, 201);
  const file = await uploaded.json();
  const fields = {
    classId: 'c1',
    subjectId: 's1',
    title: 'Dúvida com anexo',
    body: 'Preciso conferir este trecho do material de proporções.',
    tags: ['proporção'],
    target: { type: 'material', id: 'material-text' },
    attachmentId: file.id
  };
  const key = randomUUID();
  const response = await student.call('/topics', fields, 'POST', key);
  assert.equal(response.status, 201);
  const topic = await response.json();
  const stored = await store.read();
  assert.ok(stored.idempotency.some((row) => row.key === key && row.operation === 'POST /topics'));
  assert.deepEqual(
    stored.files.find((row) => row.id === file.id) && {
      status: stored.files.find((row) => row.id === file.id).status,
      parentType: stored.files.find((row) => row.id === file.id).parentType,
      parentId: stored.files.find((row) => row.id === file.id).parentId,
      authorId: stored.files.find((row) => row.id === file.id).authorId
    },
    { status: 'attached', parentType: 'topic', parentId: topic.id, authorId: 'student' }
  );
  const replay = await student.call('/topics', fields, 'POST', key);
  const replayBody = await replay.json();
  assert.equal(replayBody.id, topic.id, JSON.stringify(replayBody));
  assert.equal(topic.target.id, 'material-text');
  assert.equal(topic.attachment.status, 'attached');
  assert.equal(topic.attachment.parentId, topic.id);
  const detail = await (await student.call(`/topics/${topic.id}`)).json();
  assert.ok(detail.reference.href.includes('material-text'));
  assert.equal((await peer.call(`/files/${file.id}/content`)).status, 200);
  await store.transact((state) => {
    state.classes.find((row) => row.id === 'c1').studentIds = ['student-two'];
  });
  assert.equal((await student.call(`/topics/${topic.id}`)).status, 404);
  assert.equal((await student.call(`/files/${file.id}/content`)).status, 404);
});

test('forum rejects forged references, other-account files, and wrong-context uploads without publication', async (t) => {
  const { client, store } = await fixture(t);
  const student = await client('student'),
    peer = await client('student-two');
  const before = (await store.read()).topics.length;
  const base = {
    classId: 'c1',
    subjectId: 's1',
    title: 'Pergunta contextual',
    body: 'Texto suficiente para esta pergunta.',
    tags: [],
    target: null,
    attachmentId: null
  };
  assert.equal(
    (
      await student.call('/topics', {
        ...base,
        target: { type: 'material', id: 'material-missing' }
      })
    ).status,
    422
  );
  const pdf = new Blob([Buffer.from('%PDF-1.4\nfixture\n%%EOF', 'utf8')], {
    type: 'application/pdf'
  });
  const form = new FormData();
  form.set('purpose', 'forum');
  form.set('parentId', 's1');
  form.set('file', pdf, 'outro.pdf');
  const staged = await student.upload('/files', form);
  assert.equal(staged.status, 201);
  const file = await staged.json();
  assert.equal((await peer.call('/topics', { ...base, attachmentId: file.id })).status, 403);
  const invalid = new FormData();
  invalid.set('purpose', 'forum');
  invalid.set('parentId', 's-empty');
  invalid.set('file', pdf, 'fora.pdf');
  assert.equal((await student.upload('/files', invalid)).status, 403);
  assert.equal((await store.read()).topics.length, before);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createApp } from '../server/app.mjs';
import { openRepository } from '../server/repository.mjs';
import { createTransactionStore, atomicPersist } from '../server/transaction-store.mjs';

const origin = 'http://127.0.0.1:3000';
const pdf = fs.readFileSync(new URL('../server/fixtures/proporcoes.pdf', import.meta.url));
async function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aja-material-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { filename } = openRepository(directory, { baseDate: '2031-06-15' });
  let fail = false,
    time = '2031-06-15T12:00:00Z';
  const store = createTransactionStore({
    filename,
    persist: (file, state) => {
      if (fail) throw new Error('disk full');
      atomicPersist(file, state);
    }
  });
  const server = createApp({
    origins: [origin],
    frontendOrigin: origin,
    store,
    now: () => time
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
    const api = {
      get cookie() {
        return cookie;
      },
      async call(
        route,
        body,
        method = body ? 'POST' : 'GET',
        key = route === '/me/progress' ? null : randomUUID()
      ) {
        const multipart = body instanceof FormData;
        const result = await fetch(base + route, {
          method,
          headers: {
            Origin: origin,
            ...(body
              ? {
                  ...(!multipart ? { 'Content-Type': 'application/json' } : {}),
                  ...(key ? { 'Idempotency-Key': key } : {})
                }
              : {}),
            ...(cookie ? { Cookie: cookie } : {})
          },
          ...(body ? { body: multipart ? body : JSON.stringify(body) } : {})
        });
        if (result.headers.get('set-cookie'))
          cookie = result.headers.get('set-cookie').split(';')[0];
        return result;
      },
      upload(
        bytes = pdf,
        {
          name = 'guia.pdf',
          mime = 'application/pdf',
          purpose = 'material',
          parentId = 'm1',
          key = randomUUID()
        } = {}
      ) {
        const data = new FormData();
        data.append('purpose', purpose);
        data.append('parentId', parentId);
        data.append('file', new Blob([bytes], { type: mime }), name);
        return this.call('/files', data, 'POST', key);
      }
    };
    assert.equal(
      (
        await api.call('/auth/login', {
          email: `${id}@aja.local.test`,
          password: `AjaLocal-${id}-2031!`
        })
      ).status,
      200
    );
    return api;
  }
  return {
    store,
    client,
    base,
    failWrites: (value) => {
      fail = value;
    },
    setTime: (value) => {
      time = value;
    }
  };
}
const item = (fileId) => ({
  moduleId: 'm1',
  title: 'Novo PDF',
  kind: 'pdf',
  duration: 10,
  content: '',
  fileId
});

test('teacher prepares and publishes PDF atomically, another authenticated browser reads exact bytes and safe metadata', async (t) => {
  const { client, store } = await fixture(t);
  const teacher = await client('teacher-a'),
    student = await client('student'),
    otherTeacher = await client('teacher-b');
  const upload = await teacher.upload();
  assert.equal(upload.status, 201);
  const file = await upload.json();
  assert.equal(file.status, 'staged');
  assert.equal(file.parentId, 'm1');
  assert.equal('bytesBase64' in file, false);
  assert.equal((await student.call(`/files/${file.id}`)).status, 404);
  assert.equal((await otherTeacher.call(`/files/${file.id}`)).status, 404);
  const module = await (await teacher.call('/modules/m1')).json();
  const published = await teacher.call('/materials/batch', {
    moduleId: 'm1',
    expectedRevision: module.revision,
    items: [item(file.id)]
  });
  assert.equal(published.status, 201);
  const material = (await published.json()).items[0];
  assert.equal(material.file.parentId, material.id);
  assert.equal(material.file.status, 'attached');
  assert.equal(material.author.id, 'teacher-a');
  const detail = await student.call(`/materials/${material.id}`);
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).module.id, 'm1');
  const bytes = await student.call(`/files/${file.id}/content?disposition=inline`);
  assert.equal(bytes.status, 200);
  assert.equal(bytes.headers.get('content-type'), 'application/pdf');
  assert.equal(bytes.headers.get('x-content-type-options'), 'nosniff');
  assert.match(bytes.headers.get('content-disposition'), /^inline;/);
  assert.match(bytes.headers.get('cache-control'), /no-store/);
  assert.deepEqual(Buffer.from(await bytes.arrayBuffer()), pdf);
  assert.equal((await teacher.call(`/files/${file.id}/discard`, {})).status, 409);
  assert.ok((await store.read()).files.find((f) => f.id === file.id));
});

test('upload validates MIME bytes extension filenames repeated parts and actual size instead of trusting headers', async (t) => {
  const { client, store } = await fixture(t);
  const teacher = await client('teacher-a'),
    student = await client('student');
  assert.equal((await student.upload()).status, 403);
  for (const options of [
    { mime: 'text/html' },
    { name: 'not-pdf.txt' },
    { name: '../escape.pdf' },
    { name: 'bad\nname.pdf' }
  ])
    assert.equal((await teacher.upload(pdf, options)).status, 422, JSON.stringify(options));
  assert.equal((await teacher.upload(Buffer.from('not a pdf'))).status, 422);
  assert.equal((await teacher.upload(Buffer.alloc(0))).status, 422);
  const duplicate = new FormData();
  duplicate.append('purpose', 'material');
  duplicate.append('parentId', 'm1');
  duplicate.append('file', new Blob([pdf], { type: 'application/pdf' }), 'one.pdf');
  duplicate.append('file', new Blob([pdf], { type: 'application/pdf' }), 'two.pdf');
  assert.equal((await teacher.call('/files', duplicate)).status, 422);
  const repeated = new FormData();
  repeated.append('purpose', 'material');
  repeated.append('purpose', 'material');
  repeated.append('parentId', 'm1');
  repeated.append('file', new Blob([pdf], { type: 'application/pdf' }), 'one.pdf');
  assert.equal((await teacher.call('/files', repeated)).status, 422);
  const maximum = Buffer.alloc(10 * 1024 * 1024);
  pdf.copy(maximum);
  assert.equal((await teacher.upload(maximum)).status, 201);
  assert.equal((await teacher.upload(Buffer.concat([maximum, Buffer.from('x')]))).status, 422);
  assert.equal(
    (await store.read()).files.filter((f) => f.status === 'staged' && !f.deletedAt).length,
    1
  );
});

test('upload idempotency binds actual bytes, discard and expiry never resurrect a staged upload under the old key', async (t) => {
  const { client, store, setTime } = await fixture(t);
  const teacher = await client('teacher-a');
  const key = randomUUID();
  const first = await teacher.upload(pdf, { key });
  assert.equal(first.status, 201);
  const file = await first.json();
  assert.equal((await (await teacher.upload(pdf, { key })).json()).id, file.id);
  assert.equal(
    (await teacher.upload(Buffer.concat([pdf, Buffer.from('\n')]), { key })).status,
    409
  );
  assert.equal((await teacher.call(`/files/${file.id}/discard`, {})).status, 204);
  assert.equal((await teacher.upload(pdf, { key })).status, 404);
  const expiredKey = randomUUID();
  const expires = await (await teacher.upload(pdf, { key: expiredKey })).json();
  setTime('2031-06-16T12:00:01Z');
  // Obtain a fresh session after the default 8-hour session expired.
  const fresh = await client('teacher-a');
  assert.equal((await fresh.upload(pdf, { key: expiredKey })).status, 404);
  assert.equal((await fresh.call(`/files/${expires.id}`)).status, 404);
  const row = (await store.read()).files.find((f) => f.id === expires.id);
  assert.equal(row.bytesBase64, undefined);
});

test('partially invalid batch cleans only its own staging and cannot reuse another account file or an attached file', async (t) => {
  const { client, store } = await fixture(t);
  const a = await client('teacher-a'),
    b = await client('teacher-b');
  const own = await (await a.upload()).json(),
    foreign = await (await b.upload()).json();
  const before = await store.read();
  const result = await a.call('/materials/batch', {
    moduleId: 'm1',
    expectedRevision: 1,
    items: [
      item(own.id),
      { moduleId: 'm1', title: 'Missing text', kind: 'lesson', duration: 10, content: '' }
    ]
  });
  assert.equal(result.status, 422);
  const after = await store.read();
  assert.deepEqual(after.materials, before.materials);
  assert.equal(after.modules.find((m) => m.id === 'm1').revision, 1);
  assert.equal((await a.call(`/files/${own.id}`)).status, 404);
  assert.equal((await b.call(`/files/${foreign.id}`)).status, 200);
  assert.equal(
    (
      await a.call('/materials/batch', {
        moduleId: 'm1',
        expectedRevision: 1,
        items: [item(foreign.id)]
      })
    ).status,
    404
  );
  assert.equal((await b.call(`/files/${foreign.id}`)).status, 200);
  assert.equal(
    (
      await a.call('/materials/batch', {
        moduleId: 'm1',
        expectedRevision: 1,
        items: [item('file-material')]
      })
    ).status,
    409
  );
});

test('injected persistence failure preserves prepared bytes metadata module state audit and publication intent', async (t) => {
  const { client, store, failWrites } = await fixture(t);
  const teacher = await client('teacher-a');
  const file = await (await teacher.upload()).json();
  const before = await store.read();
  failWrites(true);
  assert.equal(
    (
      await teacher.call('/materials/batch', {
        moduleId: 'm1',
        expectedRevision: 1,
        items: [item(file.id)]
      })
    ).status,
    500
  );
  assert.deepEqual(await store.read(), before);
  assert.equal((await teacher.upload()).status, 500);
  assert.deepEqual(await store.read(), before);
  failWrites(false);
});

test('material editing and complete-set ordering compare revisions and preserve legacy video without requiring a replacement URL', async (t) => {
  const { client, store } = await fixture(t);
  const a = await client('teacher-a'),
    b = await client('teacher-b');
  await store.transact((s) => {
    delete s.materials.find((m) => m.id === 'material-video').videoUrl;
  });
  assert.equal((await (await a.call('/materials/material-video')).json()).material.videoUrl, null);
  assert.equal(
    (
      await a.call(
        '/materials/material-video',
        { expectedRevision: 1, title: 'Vídeo antigo' },
        'PATCH'
      )
    ).status,
    200
  );
  assert.equal(
    (
      await a.call(
        '/materials/material-video',
        { expectedRevision: 2, videoUrl: 'http://insecure.example/video' },
        'PATCH'
      )
    ).status,
    422
  );
  assert.equal(
    (
      await a.call(
        '/materials/material-pdf',
        { expectedRevision: 1, fileId: 'replacement' },
        'PATCH'
      )
    ).status,
    422
  );
  await b.call(
    '/materials/material-text',
    { expectedRevision: 1, title: 'Changed by second teacher' },
    'PATCH'
  );
  const before = await store.read();
  const items = before.materials
    .filter((m) => m.moduleId === 'm1')
    .map((m) => ({ id: m.id, expectedRevision: m.id === 'material-text' ? 1 : m.revision }));
  assert.equal(
    (await a.call('/modules/m1/reorder-materials', { expectedRevision: 1, items })).status,
    409
  );
  assert.deepEqual(await store.read(), before);
  const current = before.materials
    .filter((m) => m.moduleId === 'm1')
    .reverse()
    .map((m) => ({ id: m.id, expectedRevision: m.revision }));
  assert.equal(
    (await a.call('/modules/m1/reorder-materials', { expectedRevision: 1, items: current })).status,
    200
  );
});

test('progress is session-owned, touches preserve completion and repeat completion creates no extra effect', async (t) => {
  const { client, store, setTime } = await fixture(t);
  const a = await client('student'),
    same = await client('student'),
    other = await client('student-two');
  const first = await a.call(
    '/me/progress',
    { materialId: 'material-pdf', completed: true },
    'PATCH'
  );
  assert.equal(first.status, 200);
  const completed = await first.json();
  const state = await store.read();
  setTime('2031-06-15T12:01:00Z');
  assert.equal(
    (await same.call('/me/progress', { materialId: 'material-pdf', completed: true }, 'PATCH'))
      .status,
    200
  );
  assert.deepEqual(await store.read(), state);
  const touch = await (
    await same.call('/me/progress', { materialId: 'material-pdf' }, 'PATCH')
  ).json();
  assert.equal(touch.completed, true);
  assert.ok(touch.lastAccess > completed.lastAccess);
  assert.equal(
    (await (await other.call('/me/progress?materialId=material-pdf')).json()).items.length,
    0
  );
  assert.equal(
    (await a.call('/me/progress', { materialId: 'material-pdf', completed: false }, 'PATCH'))
      .status,
    422
  );
  assert.equal(
    (await a.call('/me/progress', { materialId: 'material-pdf', userId: 'student-two' }, 'PATCH'))
      .status,
    422
  );
});

test('attached file authorization follows live parents, not uploader identity, and missing bytes stay unavailable', async (t) => {
  const { client, store } = await fixture(t);
  const student = await client('student'),
    a = await client('teacher-a'),
    b = await client('teacher-b'),
    admin = await client('admin');
  assert.equal((await student.call('/files/file-material/content')).status, 200);
  await admin.call('/users/teacher-a/deactivate', { expectedRevision: 1 });
  assert.equal((await b.call('/files/file-material/content')).status, 200);
  assert.equal((await a.call('/files/file-material/content')).status, 401);
  await store.transact((s) => {
    s.files.find((f) => f.id === 'file-material').fixture = 'does-not-exist.pdf';
  });
  assert.equal((await student.call('/files/file-material/content')).status, 404);
  await store.transact((s) => {
    s.materials.find((m) => m.id === 'material-pdf').deletedAt = '2031-06-15T12:00:00Z';
  });
  assert.equal((await b.call('/files/file-material')).status, 404);
});

test('upload checks actor before receiving data and revalidates assignment after a slow multipart body completes', async (t) => {
  const { client, base, store } = await fixture(t);
  const a = await client('teacher-a');
  const unauthenticated = await new Promise((resolve, reject) => {
    const req = http.request(
      base + '/files',
      {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'multipart/form-data; boundary=not-sent',
          'Content-Length': '1000',
          'Idempotency-Key': randomUUID()
        }
      },
      (res) => {
        res.resume();
        res.on('end', () => {
          resolve(res.statusCode);
          req.destroy();
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(2000, () =>
      req.destroy(new Error('Server waited for unauthenticated upload bytes'))
    );
    req.flushHeaders();
  });
  assert.equal(unauthenticated, 401);
  const boundary = 'aja-slow-upload';
  const prefix = `--${boundary}\r\nContent-Disposition: form-data; name="purpose"\r\n\r\nmaterial\r\n--${boundary}\r\nContent-Disposition: form-data; name="parentId"\r\n\r\nm1\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="slow.pdf"\r\nContent-Type: application/pdf\r\n\r\n`;
  let response;
  const received = new Promise((resolve, reject) => {
    response = http.request(
      base + '/files',
      {
        method: 'POST',
        headers: {
          Origin: origin,
          Cookie: a.cookie,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Idempotency-Key': randomUUID()
        }
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      }
    );
    response.on('error', reject);
  });
  response.write(prefix);
  response.write(pdf.subarray(0, 5));
  await store.transact((s) => {
    s.subjects.find((s) => s.id === 's1').teacherIds = ['teacher-b'];
  });
  response.end(Buffer.concat([pdf.subarray(5), Buffer.from(`\r\n--${boundary}--\r\n`)]));
  assert.equal(await received, 403);
  assert.equal(
    (await store.read()).files.some((f) => f.name === 'slow.pdf'),
    false
  );
});

test('PDF without a browser MIME is normalized only when extension and bytes agree, never for conflicting HTML MIME', async (t) => {
  const { client } = await fixture(t);
  const teacher = await client('teacher-a');
  const inferred = await teacher.upload(pdf, { mime: '' });
  assert.equal(inferred.status, 201);
  assert.equal((await inferred.json()).mime, 'application/pdf');
  assert.equal((await teacher.upload(pdf, { mime: 'text/html' })).status, 422);
});

test('attached work file requires a published assessment for its student owner but keeps authorized staff historical access', async (t) => {
  const { client, store } = await fixture(t);
  const student = await client('student'),
    teacher = await client('teacher-a');
  await store.transact((s) => {
    s.assessments.find((a) => a.id === 'work1').status = 'draft';
  });
  assert.equal((await student.call('/files/file-work')).status, 404);
  assert.equal((await student.call('/files/file-work/content')).status, 404);
  assert.equal((await teacher.call('/files/file-work/content')).status, 200);
});

test('download disposition escapes UTF-8 filenames and multipart caps apply to actual chunked bytes', async (t) => {
  const { client, base, store } = await fixture(t);
  const teacher = await client('teacher-a');
  const staged = await (await teacher.upload(pdf, { name: "plano 'ação'.pdf" })).json();
  const response = await teacher.call(`/files/${staged.id}/content?disposition=attachment`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition'), /filename\*=UTF-8''.*%27/);
  const before = await store.read();
  const status = await new Promise((resolve, reject) => {
    const req = http.request(
      base + '/files',
      {
        method: 'POST',
        headers: {
          Origin: origin,
          Cookie: teacher.cookie,
          'Content-Type': 'multipart/form-data; boundary=oversize',
          'Transfer-Encoding': 'chunked',
          'Idempotency-Key': randomUUID()
        }
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      }
    );
    req.on('error', reject);
    req.end(Buffer.alloc(10 * 1024 * 1024 + 64 * 1024 + 1));
  });
  assert.equal(status, 422);
  assert.deepEqual(await store.read(), before);
  assert.equal((await teacher.upload(Buffer.alloc(10 * 1024 * 1024 + 64 * 1024 + 1))).status, 422);
});

test('duplicate file IDs never publish two parents and expiry maintenance cleans abandoned preparation without touching attached bytes', async (t) => {
  const { client, store, setTime } = await fixture(t);
  const a = await client('teacher-a'),
    b = await client('teacher-b'),
    admin = await client('admin');
  const duplicate = await (await a.upload()).json();
  assert.equal(
    (
      await a.call('/materials/batch', {
        moduleId: 'm1',
        expectedRevision: 1,
        items: [item(duplicate.id), item(duplicate.id)]
      })
    ).status,
    422
  );
  assert.equal((await a.call(`/files/${duplicate.id}`)).status, 404);
  const abandoned = await (await b.upload()).json();
  assert.equal((await a.call(`/files/${abandoned.id}/discard`, {})).status, 404);
  await admin.call('/users/teacher-b/deactivate', { expectedRevision: 1 });
  setTime('2031-06-16T12:00:01Z');
  const fresh = await client('teacher-a');
  assert.equal((await fresh.call('/files/file-material/content')).status, 200);
  const row = (await store.read()).files.find((f) => f.id === abandoned.id);
  assert.ok(row.deletedAt);
  assert.equal(row.bytesBase64, undefined);
  assert.equal((await store.read()).files.find((f) => f.id === 'file-material').status, 'attached');
});

test('shared file mechanism enforces forum types, safely downloads free work formats and retains closed-class staff read only', async (t) => {
  const { client } = await fixture(t);
  const student = await client('student'),
    teacher = await client('teacher-a'),
    admin = await client('admin');
  const free = await student.upload(Buffer.alloc(0), {
    purpose: 'work',
    parentId: 'work1',
    name: 'conteudo.html',
    mime: 'text/html'
  });
  assert.equal(free.status, 201);
  const content = await student.call(`/files/${(await free.json()).id}/content?disposition=inline`);
  assert.equal(content.status, 200);
  assert.equal(content.headers.get('content-type'), 'application/octet-stream');
  assert.match(content.headers.get('content-disposition'), /^attachment;/);
  assert.equal(
    (
      await student.upload(Buffer.from('<svg/>'), {
        purpose: 'forum',
        parentId: 's1',
        name: 'image.svg',
        mime: 'image/svg+xml'
      })
    ).status,
    422
  );
  assert.equal((await teacher.call('/files/file-question/content')).status, 200);
  await admin.call('/classes/c1/close', { expectedRevision: 1 });
  assert.equal((await student.call('/files/file-material/content')).status, 404);
  assert.equal((await teacher.call('/files/file-material/content')).status, 200);
  assert.equal((await teacher.upload()).status, 403);
});

test('forum attachment cannot borrow an authorized subject while its topic points at a different class', async (t) => {
  const { client, store } = await fixture(t);
  const student = await client('student');
  assert.equal((await student.call('/files/file-forum/content')).status, 200);
  await store.transact((s) => {
    s.topics.find((t) => t.id === 'topic1').classId = 'c-empty';
  });
  assert.equal((await student.call('/files/file-forum/content')).status, 404);
});

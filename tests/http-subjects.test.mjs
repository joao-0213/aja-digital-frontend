import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createApp } from '../server/app.mjs';
import { createTransactionStore, atomicPersist } from '../server/transaction-store.mjs';
import { openRepository } from '../server/repository.mjs';

const origin = 'http://127.0.0.1:3000';
async function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aja-subject-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { filename } = openRepository(directory, { baseDate: '2031-06-15' });
  let fail = false;
  const store = createTransactionStore({ filename, persist: (file, state) => { if (fail) throw new Error('disk full'); atomicPersist(file, state); } });
  const server = createApp({ origins: [origin], frontendOrigin: origin, store, now: () => '2031-06-15T12:00:00Z' }).listen(0, '127.0.0.1');
  await once(server, 'listening'); t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  async function client(id) {
    let cookie = '';
    const api = {
      async call(route, body, method = body ? 'POST' : 'GET', key = randomUUID()) {
        const response = await fetch(base + route, { method, headers: { Origin: origin, ...(body ? { 'Content-Type': 'application/json', 'Idempotency-Key': key } : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
        if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
        return response;
      }
    };
    const login = await api.call('/auth/login', { email: `${id}@aja.local.test`, password: `AjaLocal-${id}-2031!` }); assert.equal(login.status, 200);
    return api;
  }
  return { store, client, failWrites: value => { fail = value; } };
}

test('subject summaries and detail expose only authorized context and counts, never private domain payloads', async t => {
  const { client } = await fixture(t); const student = await client('student'), teacher = await client('teacher-a'), outsider = await client('teacher-unassigned');
  const list = await student.call('/subjects'); assert.equal(list.status, 200);
  const page = await list.json(); assert.deepEqual(page.items.map(s => s.id), ['s1']);
  assert.equal(page.items[0].className, 'Turma Horizonte'); assert.equal(page.items[0].canManageContent, false);
  assert.deepEqual(page.items[0].teachers.map(a => a.id), ['teacher-a', 'teacher-b']);
  const detail = await student.call('/subjects/s1'); assert.equal(detail.status, 200);
  const dto = await detail.json(); assert.equal(dto.modules[0].id, 'm1'); assert.equal(dto.projections.materials.count, 3); assert.equal(dto.projections.assessments.count, 4);
  assert.equal(JSON.stringify(dto).includes('correct'), false); assert.equal(JSON.stringify(dto).includes('password'), false); assert.equal(JSON.stringify(dto).includes('quiz-draft'), false);
  assert.equal((await (await teacher.call('/subjects/s1')).json()).projections.assessments.count, 5);
  assert.equal((await outsider.call('/subjects/s1')).status, 404);
  assert.equal((await student.call('/subjects?classId=c-closed')).status, 404);
  assert.equal((await student.call('/modules/m-closed')).status, 404);
  assert.equal((await teacher.call('/subjects/s-closed')).status, 200);
  assert.equal((await teacher.call('/subjects/s-closed/visits', { publicationIds: [] })).status, 200);
  assert.equal((await teacher.call('/modules', { subjectId: 's-closed', title: 'Denied', description: '' })).status, 403);
});

test('administrator owns subject metadata and team assignments, validates active teachers and preserves unavailable selections until explicit removal', async t => {
  const { client, store } = await fixture(t); const admin = await client('admin'), teacher = await client('teacher-a');
  const body = { classId: 'c1', name: 'Física', description: 'Trilha de apoio', color: 'green', icon: 'atom', teacherIds: ['teacher-a', 'teacher-b'] };
  const key = randomUUID(); const first = await admin.call('/subjects', body, 'POST', key); assert.equal(first.status, 201); const created = await first.json();
  const replay = await admin.call('/subjects', body, 'POST', key); assert.equal((await replay.json()).id, created.id);
  assert.equal((await store.read()).subjects.filter(s => s.id === created.id).length, 1);
  assert.equal((await teacher.call('/subjects/s1', { expectedRevision: 1, name: 'Forbidden' }, 'PATCH')).status, 403);
  assert.equal((await admin.call('/subjects/s1', { expectedRevision: 1, teacherIds: ['student'] }, 'PATCH')).status, 422);
  await store.transact(s => { s.subjects.find(s => s.id === 's1').teacherIds.push('unavailable-legacy'); });
  const detail = await (await admin.call('/subjects/s1')).json(); assert.ok(detail.subject.teacherIds.includes('unavailable-legacy'));
  assert.equal((await admin.call('/subjects/s1', { expectedRevision: 1, teacherIds: detail.subject.teacherIds }, 'PATCH')).status, 422);
  const saved = await admin.call('/subjects/s1', { expectedRevision: 1, teacherIds: ['teacher-a', 'teacher-b'] }, 'PATCH'); assert.equal(saved.status, 200);
  assert.deepEqual((await saved.json()).teacherIds, ['teacher-a', 'teacher-b']);
});

test('two assigned teachers collaborate on modules, receive stale conflicts and lose edit permission immediately when assignment is revoked', async t => {
  const { client } = await fixture(t); const a = await client('teacher-a'), b = await client('teacher-b'), admin = await client('admin');
  const created = await a.call('/modules', { subjectId: 's1', title: 'Segundo módulo', description: 'Colaboração' }); assert.equal(created.status, 201); const mod = await created.json();
  const read = await b.call(`/modules/${mod.id}`); assert.equal(read.status, 200);
  const identities = (await (await b.call('/subjects/s1')).json()).subject.publicationIds;
  const writes = await Promise.all([a.call(`/modules/${mod.id}`, { expectedRevision: 1, title: 'Título A' }, 'PATCH'), b.call(`/modules/${mod.id}`, { expectedRevision: 1, title: 'Título B' }, 'PATCH')]);
  assert.deepEqual(writes.map(r => r.status).sort(), [200, 409]);
  assert.deepEqual((await (await b.call('/subjects/s1')).json()).subject.publicationIds, identities);
  const detail = await (await admin.call('/subjects/s1')).json();
  assert.equal((await admin.call('/subjects/s1', { expectedRevision: detail.subject.revision, teacherIds: ['teacher-b'] }, 'PATCH')).status, 200);
  const denied = await a.call(`/modules/${mod.id}`, { expectedRevision: 1, title: 'Revoked' }, 'PATCH'); assert.equal(denied.status, 403);
  assert.equal((await denied.json()).error.details, undefined);
});

test('reorder compares every child revision and full live set, rejects foreign IDs and preserves state on conflict', async t => {
  const { client, store } = await fixture(t); const a = await client('teacher-a'), b = await client('teacher-b');
  const mod = await (await a.call('/modules', { subjectId: 's1', title: 'Segundo módulo', description: '' })).json();
  const detail = await (await a.call('/subjects/s1')).json();
  const items = [...detail.modules].reverse().map(m => ({ id: m.id, expectedRevision: m.revision }));
  await b.call(`/modules/${mod.id}`, { expectedRevision: mod.revision, description: 'Changed' }, 'PATCH');
  const before = await store.read();
  const stale = await a.call('/subjects/s1/reorder-modules', { expectedRevision: detail.subject.revision, items }); assert.equal(stale.status, 409);
  assert.deepEqual(await store.read(), before);
  const foreign = await a.call('/subjects/s1/reorder-modules', { expectedRevision: detail.subject.revision, items: [{ id: 'm-closed', expectedRevision: 1 }] }); assert.equal(foreign.status, 403);
  assert.equal((await foreign.json()).error.details, undefined);
  const current = await (await a.call('/subjects/s1')).json();
  const intent = randomUUID();
  const orderBody = { expectedRevision: current.subject.revision, items: [...current.modules].reverse().map(m => ({ id: m.id, expectedRevision: m.revision })) };
  const order = await a.call('/subjects/s1/reorder-modules?pageSize=1', orderBody, 'POST', intent);
  assert.equal(order.status, 200); const page = await order.json(); assert.equal(page.total, 2); assert.equal(page.items.length, 1);
  assert.equal((await a.call('/subjects/s1/reorder-modules?pageSize=1', orderBody, 'POST', intent)).status, 200);
  const state = await store.read(); assert.equal(state.modules.find(m => m.id === mod.id).order, 1); assert.equal(state.modules.find(m => m.id === 'm1').order, 2);
  const snapshot = await (await a.call('/subjects/s1')).json();
  await b.call('/modules', { subjectId: 's1', title: 'Concorrente', description: '' });
  const concurrent = await a.call('/subjects/s1/reorder-modules', { expectedRevision: snapshot.subject.revision, items: snapshot.modules.map(m => ({ id: m.id, expectedRevision: m.revision })) }); assert.equal(concurrent.status, 409);
});

test('visits merge only observed publication identities for the actor and propagate across independent same-account sessions', async t => {
  const { client, store } = await fixture(t); const a = await client('student'), same = await client('student'), other = await client('student-two');
  const old = await (await a.call('/subjects/s1/visits')).json(); assert.equal(old.hasUpdates, true);
  await store.transact(s => { s.announcements.push({ ...s.announcements[0], id: 'notice-arrived-later', title: 'New publication' }); });
  const key = randomUUID(); const visit = await a.call('/subjects/s1/visits', { publicationIds: old.publicationIds }, 'POST', key); assert.equal(visit.status, 200);
  const dto = await visit.json(); assert.equal(dto.hasUpdates, true); assert.ok(!dto.seenPublicationIds.includes('notice:notice-arrived-later'));
  const visibleElsewhere = await (await same.call('/subjects/s1/visits')).json(); assert.deepEqual(visibleElsewhere.seenPublicationIds, dto.seenPublicationIds);
  assert.equal((await (await other.call('/subjects/s1/visits')).json()).seenPublicationIds.length, 0);
  const second = await same.call('/subjects/s1/visits', { publicationIds: visibleElsewhere.publicationIds }); assert.equal(second.status, 200); assert.equal((await second.json()).hasUpdates, false);
  const replay = await a.call('/subjects/s1/visits', { publicationIds: old.publicationIds }, 'POST', key); assert.equal((await replay.json()).hasUpdates, false);
  assert.equal((await (await a.call('/subjects')).json()).items[0].hasUpdates, false);
  await store.transact(s => { s.announcements.push({ ...s.announcements[0], id: 'notice-after-commit', title: 'Arrived after the first visit commit' }); });
  const newReplay = await a.call('/subjects/s1/visits', { publicationIds: old.publicationIds }, 'POST', key);
  assert.equal((await newReplay.json()).hasUpdates, true);
  const before = await store.read();
  assert.equal((await a.call('/subjects/s1/visits', { publicationIds: ['material:foreign'] })).status, 422);
  assert.deepEqual(await store.read(), before);
  const admin = await client('admin'); await admin.call('/enrollments/e1/end', { expectedRevision: 1 });
  assert.equal((await a.call('/subjects/s1/visits', { publicationIds: old.publicationIds }, 'POST', key)).status, 404);
});

test('persistence failure rolls back module, parent revision, audit, visit and idempotency state', async t => {
  const { client, store, failWrites } = await fixture(t); const teacher = await client('teacher-a'), student = await client('student');
  const before = await store.read(); failWrites(true);
  assert.equal((await teacher.call('/modules', { subjectId: 's1', title: 'Will fail', description: '' })).status, 500);
  assert.deepEqual(await store.read(), before);
  assert.equal((await student.call('/subjects/s1/visits', { publicationIds: [] })).status, 500);
  assert.deepEqual(await store.read(), before); failWrites(false);
});

test('subject and module routes keep strict query, body and scope boundaries without adding withdrawal commands', async t => {
  const { client } = await fixture(t); const admin = await client('admin');
  assert.equal((await admin.call('/subjects/s1?unknown=1')).status, 422);
  assert.equal((await admin.call('/subjects?unknown=1')).status, 422);
  assert.equal((await admin.call('/modules/m1', { expectedRevision: 1, subjectId: 's-closed' }, 'PATCH')).status, 422);
  assert.equal((await admin.call('/subjects/s1/reorder-modules?sort=id', { expectedRevision: 1, items: [{ id: 'm1', expectedRevision: 1 }] })).status, 422);
  assert.equal((await admin.call('/subjects/s1/withdraw', { expectedRevision: 1 })).status, 404);
  assert.equal((await admin.call('/modules/m1/withdraw', { expectedRevision: 1 })).status, 404);
  assert.equal((await admin.call('/%73ubjects/s1')).status, 404);
});

test('subject projections discard withdrawn publication records and withdrawn parents before computing identities and counts', async t => {
  const { client, store } = await fixture(t); const student = await client('student');
  await store.transact(s => {
    s.materials.find(m => m.id === 'material-text').deletedAt = '2031-06-15T12:00:00Z';
    s.assessments.find(a => a.id === 'quiz-open').deletedAt = '2031-06-15T12:00:00Z';
    s.announcements.find(a => a.id === 'notice1').deletedAt = '2031-06-15T12:00:00Z';
    s.modules.push({ ...s.modules[0], id: 'withdrawn-module', deletedAt: '2031-06-15T12:00:00Z' });
    s.materials.push({ ...s.materials[1], id: 'hidden-parent-material', moduleId: 'withdrawn-module' });
    s.assessments.push({ ...s.assessments[2], id: 'hidden-parent-assessment', moduleId: 'withdrawn-module' });
  });
  const detail = await (await student.call('/subjects/s1')).json();
  assert.deepEqual(detail.modules.map(m => m.id), ['m1']);
  assert.equal(detail.projections.materials.count, 2); assert.equal(detail.projections.assessments.count, 3); assert.equal(detail.projections.announcements.count, 1);
  for (const id of ['material:material-text', 'assessment:quiz-open', 'notice:notice1', 'material:hidden-parent-material', 'assessment:hidden-parent-assessment']) assert.equal(detail.subject.publicationIds.includes(id), false, id);
  assert.equal((await student.call('/modules/withdrawn-module')).status, 404);
  await store.transact(s => { s.subjects.find(s => s.id === 's1').deletedAt = '2031-06-15T12:00:00Z'; });
  assert.equal((await student.call('/subjects/s1')).status, 404);
});

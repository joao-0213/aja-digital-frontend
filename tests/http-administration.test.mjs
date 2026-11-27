import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createApp } from '../server/app.mjs';
import { createTransactionStore } from '../server/transaction-store.mjs';
import { openRepository } from '../server/repository.mjs';
import { canAccessSubject } from '../src/lib/access.ts';
import { enrolledForLesson } from '../src/lib/enrollment.ts';

const origin = 'http://127.0.0.1:3000';
async function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aja-admin-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { filename } = openRepository(directory, { baseDate: '2031-06-15' });
  let fail = false;
  const normal = createTransactionStore({ filename });
  const store = createTransactionStore({ filename, persist: async (file, state) => { if (fail) throw new Error('disk full'); const { atomicPersist } = await import('../server/transaction-store.mjs'); atomicPersist(file, state); } });
  const server = createApp({ origins: [origin], frontendOrigin: origin, store, now: options.now ?? (() => '2031-06-15T12:00:00Z') }).listen(0, '127.0.0.1');
  await once(server, 'listening'); t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const client = () => {
    let cookie = '';
    return {
      async call(route, body, method = body ? 'POST' : 'GET', key = randomUUID()) {
        const r = await fetch(base + route, { method, headers: { Origin: origin, ...(body ? { 'Content-Type': 'application/json', 'Idempotency-Key': key } : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
        if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
        return r;
      },
      login(id, password = `AjaLocal-${id}-2031!`) { return this.call('/auth/login', { email: `${id}@aja.local.test`, password }); }
    };
  };
  const admin = client(); assert.equal((await admin.login('admin')).status, 200);
  return { store, normal, admin, client, failWrites: value => { fail = value; } };
}

test('administration lists and direct IDs enforce roles, scopes and safe projections through real sessions', async t => {
  const { admin, client } = await fixture(t); const teacher = client(), student = client(), outsider = client();
  await teacher.login('teacher-a'); await student.login('student'); await outsider.login('teacher-unassigned');
  assert.equal((await teacher.call('/users/admin')).status, 403);
  assert.equal((await student.call('/users')).status, 403);
  const users = await admin.call('/users?role=teacher&q=daniela&pageSize=1'); assert.equal(users.status, 200);
  const page = await users.json(); assert.equal(page.total, 1); assert.equal(page.items[0].id, 'teacher-a');
  assert.equal('hash' in page.items[0], false);
  const classes = await (await student.call('/classes')).json(); assert.equal(classes.items.length, 1); assert.equal('studentIds' in classes.items[0], false);
  assert.equal((await student.call('/classes/c-closed')).status, 404);
  assert.equal((await outsider.call('/students/student')).status, 404);
  assert.equal((await teacher.call('/students/student')).status, 200);
  assert.equal((await teacher.call('/classes', { name: 'Denied', code: 'DEN', year: 2031, shift: 'Noite' })).status, 403);
  assert.equal((await admin.call('/users?unknown=1')).status, 422);
});

test('staff provisioning creates no public password and allows terminal-link setup, edit conflicts and session revocation', async t => {
  const { admin, client, store } = await fixture(t);
  const created = await admin.call('/users', { name: 'Docente Nova', email: '  NEW@EXAMPLE.TEST  ', role: 'teacher' });
  assert.equal(created.status, 201); const user = await created.json(); assert.equal(user.email, 'new@example.test'); assert.equal('password' in user, false);
  assert.equal((await admin.call('/users', { name: 'Duplicata', email: 'new@example.test', role: 'teacher' })).status, 409);
  const message = (await store.read()).outbox.filter(m => m.userId === user.id && m.purpose === 'password-reset').at(-1); assert.ok(message);
  const c = client();
  assert.equal((await c.call('/auth/password-resets', { token: new URL(message.url).searchParams.get('token'), password: 'Nova-senha-local-123!' })).status, 200);
  assert.equal((await c.call('/auth/login', { email: user.email, password: 'Nova-senha-local-123!' })).status, 200);
  const results = await Promise.all(['Uma edição', 'Outra edição'].map(name => admin.call(`/users/${user.id}`, { expectedRevision: user.revision, name }, 'PATCH')));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const current = await (await admin.call(`/users/${user.id}`)).json();
  assert.equal((await admin.call(`/users/${user.id}/deactivate`, { expectedRevision: current.revision })).status, 200);
  assert.equal((await c.call('/auth/session')).status, 401);
  assert.ok((await store.read()).sessions.filter(s => s.userId === user.id).every(s => s.revokedAt));
});

test('last active administrator is protected under concurrent independent sessions and failure preserves records', async t => {
  const { admin, client, store } = await fixture(t);
  const lastAdmin = await admin.call('/users/admin/role', { expectedRevision: 1, role: 'teacher' });
  assert.equal(lastAdmin.status, 409); assert.equal((await lastAdmin.json()).error.code, 'BUSINESS_CONFLICT');
  assert.equal((await admin.call('/users/admin/deactivate', { expectedRevision: 1 })).status, 409);
  assert.equal((await admin.call('/users/admin/withdraw', { expectedRevision: 1 })).status, 409);
  await store.transact(s => { const u = structuredClone(s.users.find(u => u.id === 'admin')); u.id = 'admin-two'; u.email = 'admin-two@aja.local.test'; s.users.push(u); const c = structuredClone(s.credentials.find(c => c.userId === 'admin')); c.id = 'credential-admin-two'; c.userId = u.id; s.credentials.push(c); });
  const other = client(); await other.login('admin-two', 'AjaLocal-admin-2031!');
  const results = await Promise.all([admin.call('/users/admin/role', { expectedRevision: 1, role: 'teacher' }), other.call('/users/admin-two/role', { expectedRevision: 1, role: 'teacher' })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal((await store.read()).users.filter(u => u.role === 'admin' && u.active).length, 1);
});

test('class closure atomically ends memberships and pending entries, preserves academic history, and reopening restores none', async t => {
  const { admin, store, client } = await fixture(t); const student = client(); await student.login('student');
  const before = await store.read();
  const result = await admin.call('/classes/c1/close', { expectedRevision: 1 }); assert.equal(result.status, 200);
  const after = await store.read();
  assert.deepEqual(after.attempts, before.attempts); assert.deepEqual(after.submissions, before.submissions); assert.deepEqual(after.attendance, before.attendance);
  assert.equal(after.enrollments.find(e => e.id === 'e-pending').status, 'cancelled');
  assert.equal(after.enrollments.find(e => e.id === 'e1').status, 'ended');
  assert.deepEqual(after.classes.find(c => c.id === 'c1').studentIds, []);
  assert.equal((await student.call('/classes/c1')).status, 404);
  const record = await result.json(); assert.equal((await admin.call('/classes/c1/reopen', { expectedRevision: record.revision })).status, 200);
  assert.deepEqual((await store.read()).classes.find(c => c.id === 'c1').studentIds, []);
});

test('class code uniqueness, input validation and injected persistence failures never cause partial updates', async t => {
  const { admin, store, failWrites } = await fixture(t);
  assert.equal((await admin.call('/classes', { name: 'Duplicada', code: ' hor-n ', year: 2031, shift: 'Noite' })).status, 409);
  assert.equal((await admin.call('/classes', { name: 'Inválida', code: 'BAD CODE', year: 2031, shift: 'Noite' })).status, 422);
  const before = await store.read(); failWrites(true);
  const result = await admin.call('/classes/c1/close', { expectedRevision: 1 }); assert.equal(result.status, 500);
  assert.deepEqual(await store.read(), before); failWrites(false);
});

test('enrollment commands normalize email, preserve pending identity and reject transfers, stale revisions and forbidden actors', async t => {
  const { admin, client, store } = await fixture(t); const student = client(); await student.login('student');
  assert.equal((await student.call('/enrollments', { classId: 'c-empty', email: 'new@example.test' })).status, 403);
  const response = await admin.call('/enrollments', { classId: 'c1', email: '  FUTURE@EXAMPLE.TEST ' }); assert.equal(response.status, 201);
  const pending = await response.json(); assert.equal(pending.email, 'future@example.test'); assert.equal(pending.status, 'pending');
  assert.equal((await store.read()).users.some(u => u.email === pending.email), false);
  assert.equal((await admin.call(`/enrollments/${pending.id}/activate`, { expectedRevision: pending.revision })).status, 409);
  assert.equal((await admin.call('/enrollments', { classId: 'c-empty', email: 'student@aja.local.test' })).status, 409);
  const existing = await admin.call('/enrollments', { classId: 'c1', email: 'STUDENT@aja.local.test' }); assert.equal(existing.status, 201); assert.equal((await existing.json()).id, 'e1');
  assert.equal((await admin.call(`/enrollments/${pending.id}/cancel`, { expectedRevision: pending.revision })).status, 200);
  assert.equal((await admin.call(`/enrollments/${pending.id}/cancel`, { expectedRevision: pending.revision })).status, 404);
  assert.equal((await admin.call('/enrollments', { classId: 'c1', email: pending.email })).status, 409);
});

test('confirmed inclusion marks expired assessments unassigned and teacher inactivation only removes that teacher assignments', async t => {
  const { admin, client, store } = await fixture(t);
  await store.transact(s => { s.subjects.find(x => x.id === 's1').teacherIds.push('unavailable-legacy'); s.assessments.find(a => a.id === 'quiz-closed').allowLate = true; });
  const included = await admin.call('/enrollments', { classId: 'c1', email: 'student-empty@aja.local.test' }); assert.equal(included.status, 201);
  assert.ok((await included.json()).unassignedAssessmentIds.includes('quiz-closed'));
  const teacher = client(); await teacher.login('teacher-a');
  assert.equal((await admin.call('/users/teacher-a/deactivate', { expectedRevision: 1 })).status, 200);
  const after = await store.read(); assert.deepEqual(after.subjects.find(x => x.id === 's1').teacherIds, ['teacher-b', 'unavailable-legacy']);
  assert.ok(after.materials.some(m => m.authorId === 'teacher-a'));
  assert.equal((await teacher.call('/me')).status, 401);
});

test('read-only enrollment preview never commits and a later state change is revalidated by the actual command', async t => {
  const { admin, store } = await fixture(t);
  const before = await store.read();
  const preview = await admin.call('/enrollments/preview?classId=c1&email=STUDENT-EMPTY%40aja.local.test');
  assert.equal(preview.status, 200); const dto = await preview.json(); assert.equal(dto.canEnroll, true); assert.equal(dto.account.id, 'student-empty');
  assert.deepEqual(await store.read(), before);
  await store.transact(s => { s.classes.find(c => c.id === 'c1').active = false; });
  assert.equal((await admin.call('/enrollments', { classId: 'c1', email: dto.email })).status, 409);
});

test('historical enrollment identity cannot transfer when a former account email is reused by another account', async t => {
  const { admin, client, store } = await fixture(t);
  await store.transact(s => { s.users.find(u => u.id === 'student').email = 'renamed@example.test'; s.users.find(u => u.id === 'student-empty').email = 'student@aja.local.test'; });
  const result = await admin.call('/enrollments', { classId: 'c1', email: 'student@aja.local.test' });
  assert.equal(result.status, 409);
  const after = await store.read(); assert.equal(after.enrollments.find(e => e.id === 'e1').studentId, 'student');
  assert.equal(after.classes.find(c => c.id === 'c1').studentIds.includes('student-empty'), false);
});

test('legacy proof permits only assigned staff historical profile without inventing enrollment dates or future eligibility', async t => {
  const { admin, client, store } = await fixture(t); const teacher = client(), outsider = client(), student = client();
  await teacher.login('teacher-a'); await outsider.login('teacher-b'); await student.login('student-empty');
  await store.transact(s => { s.enrollments.push({ id: 'legacy-history', revision: 1, classId: 'c-closed', studentId: 'student-empty', email: 'student-empty@aja.local.test', status: 'ended', legacy: true, createdAt: '2031-06-01T12:00:00Z', createdBy: 'admin', unassignedAssessmentIds: [] }); });
  const detail = await teacher.call('/students/student-empty'); assert.equal(detail.status, 200);
  assert.equal((await detail.json()).enrollments.find(e => e.id === 'legacy-history').enrolledAt, null);
  assert.equal((await outsider.call('/students/student-empty')).status, 404);
  assert.equal((await student.call('/students/student-empty')).status, 403);
  let state = await store.read(); assert.equal(enrolledForLesson(state, 'c-closed', 'student-empty', '2031-06-20'), false);
  assert.equal(canAccessSubject(state, state.users.find(u => u.id === 'student-empty'), 's-closed'), false);
  await admin.call('/classes/c-closed/reopen', { expectedRevision: 1 });
  state = await store.read(); assert.equal(canAccessSubject(state, state.users.find(u => u.id === 'student-empty'), 's-closed'), false);
  await store.transact(s => { s.subjects.find(v => v.id === 's-closed').teacherIds = []; });
  assert.equal((await teacher.call('/students/student-empty')).status, 404);
});

test('closing legacy residual members clears active membership but retains an explicit dateless historical record', async t => {
  const { admin, store } = await fixture(t);
  await store.transact(s => { s.classes.find(c => c.id === 'c1').studentIds.push('student-empty'); });
  assert.equal((await admin.call('/classes/c1/close', { expectedRevision: 1 })).status, 200);
  const s = await store.read(); assert.deepEqual(s.classes.find(c => c.id === 'c1').studentIds, []);
  const legacy = s.enrollments.find(e => e.studentId === 'student-empty' && e.classId === 'c1');
  assert.equal(legacy.legacy, true); assert.equal(legacy.status, 'ended'); assert.equal(legacy.enrolledAt, undefined);
});

test('opaque ID segments can be encoded independently without accepting aliases for static path segments', async t => {
  const { admin, store } = await fixture(t);
  await store.transact(s => { s.users.push({ ...s.users.find(u => u.id === 'teacher-a'), id: 'teacher:legacy', email: 'legacy@example.test' }); });
  assert.equal((await admin.call('/users/teacher%3Alegacy')).status, 200);
  assert.equal((await admin.call('/%75sers/teacher-a')).status, 404);
  assert.equal((await admin.call('/users/teacher%2Flegacy')).status, 404);
});

test('administration rejects unknown detail and command query parameters and invalid enrollment IDs', async t => {
  const { admin } = await fixture(t);
  assert.equal((await admin.call('/users/admin?unknown=1')).status, 422);
  assert.equal((await admin.call('/classes/c1/close?unknown=1', { expectedRevision: 1 })).status, 422);
  assert.equal((await admin.call('/enrollments', { classId: 123, email: 'new@example.test' })).status, 422);
});

test('dateless legacy attendance retains only already documented marks before the recorded exit', async t => {
  const { store } = await fixture(t);
  await store.transact(s => {
    s.enrollments.push({ id: 'legacy-lesson', revision: 1, classId: 'c-closed', studentId: 'student-empty', email: 'student-empty@aja.local.test', status: 'ended', legacy: true, createdAt: '2031-06-15T12:00:00Z', endedAt: '2031-06-15T12:00:00Z', createdBy: 'admin', unassignedAssessmentIds: [] });
    s.attendance.push({ id: 'historic-closed', subjectId: 's-closed', date: '2031-06-10', time: '19:00', records: { 'student-empty': false } });
  });
  const s = await store.read();
  assert.equal(enrolledForLesson(s, 'c-closed', 'student-empty', '2031-06-10'), true);
  assert.equal(enrolledForLesson(s, 'c-closed', 'student-empty', '2031-06-11'), false);
  assert.equal(enrolledForLesson(s, 'c-closed', 'student-two', '2031-06-10'), false);
  assert.equal(enrolledForLesson(s, 'c-empty', 'student-empty', '2031-06-10'), false);
  s.attendance.push({ id: 'future-closed', subjectId: 's-closed', date: '2031-06-20', time: '19:00', records: { 'student-empty': true } });
  assert.equal(enrolledForLesson(s, 'c-closed', 'student-empty', '2031-06-20'), false);
});

test('ambiguous legacy memberships stay intact while unrelated administrative edits can proceed', async t => {
  const { admin, client, store } = await fixture(t); const student = client(); await student.login('student');
  await store.transact(s => { s.classes.find(c => c.id === 'c-empty').studentIds.push('student'); });
  assert.deepEqual((await (await student.call('/classes')).json()).items, []);
  assert.equal((await admin.call('/classes/c-closed', { expectedRevision: 1, name: 'Histórico preservado' }, 'PATCH')).status, 200);
  const s = await store.read(); assert.ok(s.classes.find(c => c.id === 'c1').studentIds.includes('student')); assert.ok(s.classes.find(c => c.id === 'c-empty').studentIds.includes('student'));
});

test('student history and pending status search are filtered before pagination even beyond one hundred records', async t => {
  const { admin, store } = await fixture(t);
  await store.transact(s => {
    for (let i = 0; i < 130; i++) {
      const id = `bulk-${String(i).padStart(3, '0')}`, active = i < 125;
      s.users.push({ ...s.users.find(u => u.id === 'student'), id, name: `Aluno ${i}`, email: `${id}@example.test` });
      s.enrollments.push({ ...s.enrollments.find(e => e.id === 'e1'), id: `enrollment-${id}`, studentId: id, email: `${id}@example.test`, status: active ? 'active' : 'ended', ...(active ? {} : { endedAt: '2031-06-01T12:00:00Z' }) });
      if (active) s.classes.find(c => c.id === 'c1').studentIds.push(id);
    }
    for (let i = 0; i < 130; i++) s.enrollments.push({ ...s.enrollments.find(e => e.id === 'e-pending'), id: `pending-${i}`, studentId: undefined, email: `wait-${i}@example.test`, status: i % 2 ? 'pending' : 'cancelled' });
  });
  const active = await (await admin.call('/students?classId=c1&page=2&pageSize=100')).json();
  assert.equal(active.total, 127); assert.equal(active.items.length, 27);
  assert.ok(active.items.every(u => u.enrollment?.status === 'active'));
  const history = await admin.call('/students?classId=c1&history=true&page=2&pageSize=100'); assert.equal(history.status, 200);
  assert.equal((await history.json()).total, 132);
  const pending = await admin.call('/enrollments?classId=c1&status=pending,cancelled&q=wait-&page=2&pageSize=100'); assert.equal(pending.status, 200);
  const pendingPage = await pending.json(); assert.equal(pendingPage.total, 130); assert.equal(pendingPage.items.length, 30);
  assert.ok(pendingPage.items.every(e => ['pending', 'cancelled'].includes(e.status)));
});

test('a command uses one transaction timestamp for creation, lifecycle changes and audit even as the clock advances', async t => {
  let time = Date.parse('2031-06-15T12:00:00Z');
  const { admin } = await fixture(t, { now: () => new Date(time++).toISOString() });
  const result = await admin.call('/classes', { name: 'Relógio consistente', code: 'CLOCK', year: 2031, shift: 'Noite' });
  assert.equal(result.status, 201); const dto = await result.json();
  assert.ok(Date.parse(dto.updatedAt) >= Date.parse(dto.createdAt), `${dto.updatedAt} < ${dto.createdAt}`);
});

test('student detail excludes withdrawn records and withdrawn assessment or module parents without deleting stored history', async t => {
  const { admin, store } = await fixture(t);
  let detail = await (await admin.call('/students/student')).json(); assert.equal(detail.attempts.length, 1); assert.equal(detail.submissions.length, 1);
  await store.transact(s => { s.attempts.find(a => a.id === 'attempt-sent').deletedAt = '2031-06-15T12:00:00Z'; s.submissions.find(v => v.id === 'submission-waiting').deletedAt = '2031-06-15T12:00:00Z'; });
  detail = await (await admin.call('/students/student')).json(); assert.equal(detail.attempts.length, 0); assert.equal(detail.submissions.length, 0);
  await store.transact(s => { delete s.attempts.find(a => a.id === 'attempt-sent').deletedAt; delete s.submissions.find(v => v.id === 'submission-waiting').deletedAt; s.assessments.find(a => a.id === 'quiz-closed').deletedAt = '2031-06-15T12:00:00Z'; s.assessments.find(a => a.id === 'work1').deletedAt = '2031-06-15T12:00:00Z'; });
  detail = await (await admin.call('/students/student')).json(); assert.equal(detail.attempts.length, 0); assert.equal(detail.submissions.length, 0);
  await store.transact(s => { delete s.assessments.find(a => a.id === 'quiz-closed').deletedAt; delete s.assessments.find(a => a.id === 'work1').deletedAt; s.modules.find(m => m.id === 'm1').deletedAt = '2031-06-15T12:00:00Z'; });
  detail = await (await admin.call('/students/student')).json(); assert.equal(detail.attempts.length, 0); assert.equal(detail.submissions.length, 0);
  assert.equal((await store.read()).attempts.length, 2); assert.equal((await store.read()).submissions.length, 2);
});

test('undocumented user reactivation stays unavailable and never restores an inactive account', async t => {
  const { admin, store } = await fixture(t);
  const before = await store.read();
  const result = await admin.call('/users/student-inactive/activate', { expectedRevision: 1 });
  assert.equal(result.status, 404);
  assert.deepEqual(await store.read(), before);
});

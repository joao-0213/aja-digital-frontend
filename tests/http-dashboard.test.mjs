import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.mjs';
import { createTransactionStore } from '../server/transaction-store.mjs';
import { openRepository } from '../server/repository.mjs';

const origin = 'http://127.0.0.1:3000';

async function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aja-dashboard-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { filename } = openRepository(directory, { baseDate: '2031-06-15' });
  const store = createTransactionStore({ filename });
  const server = createApp({
    origins: [origin],
    frontendOrigin: origin,
    store,
    now: options.now ?? (() => '2031-06-15T12:00:00.000Z')
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
  const client = () => {
    let cookie = '';
    return {
      async call(route, body, method = body ? 'POST' : 'GET') {
        const response = await fetch(base + route, {
          method,
          headers: {
            Origin: origin,
            ...(body
              ? { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }
              : {}),
            ...(cookie ? { Cookie: cookie } : {})
          },
          ...(body ? { body: JSON.stringify(body) } : {})
        });
        if (response.headers.get('set-cookie'))
          cookie = response.headers.get('set-cookie').split(';')[0];
        return response;
      },
      async login(id, password = `AjaLocal-${id}-2031!`) {
        const response = await fetch(base + '/auth/login', {
          method: 'POST',
          headers: { Origin: origin, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: `${id}@aja.local.test`, password })
        });
        if (response.headers.get('set-cookie'))
          cookie = response.headers.get('set-cookie').split(';')[0];
        return response;
      }
    };
  };
  return { store, client };
}

test('dashboard endpoint returns a scoped student projection with resumable progress and cross-links', async (t) => {
  const { client } = await fixture(t);
  const student = client();
  await student.login('student');
  const response = await student.call('/me/dashboard');
  assert.equal(response.status, 200);
  const dashboard = await response.json();
  assert.equal(dashboard.role, 'student');
  assert.ok(dashboard.subjects.length > 0);
  assert.ok(
    dashboard.resume === null ||
      ['id', 'title', 'moduleId', 'kind'].every((key) => key in dashboard.resume)
  );
  assert.ok(Number.isInteger(dashboard.pendingEnrollmentCount));
  assert.ok(Array.isArray(dashboard.assessments));
  assert.ok(Array.isArray(dashboard.announcements));
  assert.ok(Array.isArray(dashboard.upcoming));
  assert.ok(Array.isArray(dashboard.progress));
  assert.ok(Array.isArray(dashboard.topics));
  assert.equal(JSON.stringify(dashboard).includes('questionIds'), false);
  assert.equal(JSON.stringify(dashboard).includes('student-two'), false);
});

test('dashboard endpoint gives staff only assigned subjects and bounded indicators', async (t) => {
  const { client } = await fixture(t);
  const teacher = client();
  await teacher.login('teacher-a');
  const response = await teacher.call('/me/dashboard');
  assert.equal(response.status, 200);
  const dashboard = await response.json();
  assert.equal(dashboard.role, 'teacher');
  assert.ok(Array.isArray(dashboard.subjects));
  assert.ok(Array.isArray(dashboard.classes));
  assert.ok(Number.isInteger(dashboard.studentCount));
  assert.ok(Number.isInteger(dashboard.pendingFeedbackCount));
  assert.ok(Array.isArray(dashboard.topics));
  assert.equal(
    dashboard.subjects.some((subject) => subject.id === 's2'),
    false
  );
});

test('dashboard returns empty scoped collections for users with no class or teaching assignment', async (t) => {
  const { client, store } = await fixture(t);
  await store.transact((state) => {
    state.subjects = state.subjects.filter((row) => !row.teacherIds.includes('teacher-b'));
    state.classes = state.classes.map((row) => ({
      ...row,
      studentIds: row.studentIds.filter((id) => id !== 'student-two')
    }));
    state.enrollments = state.enrollments.filter((row) => row.studentId !== 'student-two');
  });
  const teacher = client();
  await teacher.login('teacher-b');
  const response = await teacher.call('/me/dashboard');
  assert.equal(response.status, 200);
  const dashboard = await response.json();
  assert.equal(dashboard.role, 'teacher');
  assert.equal(
    dashboard.subjects.some((row) => row.id === 's1'),
    false
  );
  assert.ok(dashboard.subjects.every((row) => row.id !== 's1'));
  assert.equal(dashboard.studentCount, 0);

  const student = client();
  await student.login('student-two');
  const studentResponse = await student.call('/me/dashboard');
  assert.equal(studentResponse.status, 200);
  assert.deepEqual((await studentResponse.json()).subjects, []);
});

test('dashboard request revalidates authorization after a teacher loses assignment', async (t) => {
  const { client, store } = await fixture(t);
  const teacher = client();
  const admin = client();
  await teacher.login('teacher-a');
  await admin.login('admin');
  const listed = await admin.call('/subjects?page=1&pageSize=100');
  const subject = (await listed.json()).items.find((row) => row.id === 's1');
  assert.ok(subject.teacherIds.includes('teacher-a'));
  const update = await admin.call(
    `/subjects/${subject.id}`,
    {
      classId: subject.classId,
      name: subject.name,
      teacherIds: subject.teacherIds.filter((id) => id !== 'teacher-a'),
      color: subject.color,
      icon: subject.icon,
      description: subject.description,
      expectedRevision: subject.revision
    },
    'PATCH'
  );
  assert.equal(update.status, 200);
  const response = await teacher.call('/me/dashboard');
  assert.equal(response.status, 200);
  const dashboard = await response.json();
  assert.equal(
    dashboard.subjects.some((row) => row.id === 's1'),
    false
  );
  assert.ok(dashboard.subjects.every((row) => row.id !== 's1'));
  assert.equal(dashboard.studentCount, 0);
  assert.equal((await teacher.call('/subjects/s1')).status, 404);
  await store.transact((current) => {
    current.users.find((row) => row.id === 'teacher-a').active = false;
  });
  assert.equal((await teacher.call('/me/dashboard')).status, 401);
});

test('a teacher publication appears in a student projection and keeps its origin link', async (t) => {
  const { client } = await fixture(t);
  const teacher = client(),
    student = client();
  await teacher.login('teacher-a');
  await student.login('student');
  const published = await teacher.call('/announcements', {
    classId: 'c1',
    subjectId: 's1',
    title: 'Revisão ao vivo',
    body: 'A sala foi atualizada.',
    notify: false,
    occurrence: { date: '2031-06-20', time: '18:30', allDay: false }
  });
  assert.equal(published.status, 201);
  const notice = await published.json();
  const response = await student.call('/me/dashboard');
  assert.equal(response.status, 200);
  const dashboard = await response.json();
  assert.ok(
    dashboard.announcements.some(
      (item) => item.id === notice.id && item.title === 'Revisão ao vivo'
    )
  );
  assert.ok(
    dashboard.upcoming.some(
      (item) => item.sourceId === notice.id && item.href === `/avisos#aviso-${notice.id}`
    )
  );
  const destination = await student.call(`/announcements/${notice.id}`);
  assert.equal(destination.status, 200);
  assert.equal((await destination.json()).title, 'Revisão ao vivo');
});

test('administrator dashboard uses a bounded projection without roster identifiers', async (t) => {
  const { client } = await fixture(t);
  const admin = client();
  await admin.login('admin');
  const response = await admin.call('/me/dashboard');
  assert.equal(response.status, 200);
  const dashboard = await response.json();
  assert.equal(dashboard.role, 'admin');
  assert.ok(Number.isInteger(dashboard.studentCount));
  assert.ok(
    dashboard.classes.every((row) => Number.isInteger(row.studentCount) && !('studentIds' in row))
  );
  assert.equal(JSON.stringify(dashboard).includes('studentIds'), false);
});

test('student pending assessment count includes every eligible item while the payload stays capped', async (t) => {
  const { client, store } = await fixture(t);
  await store.transact((state) => {
    const original = state.assessments.find((row) => row.id === 'quiz-open');
    for (let index = 1; index <= 3; index += 1)
      state.assessments.push({
        ...structuredClone(original),
        id: `quiz-extra-${index}`,
        revision: 1,
        title: `Quiz extra ${index}`,
        createdAt: `2031-06-15T10:0${index}:00.000Z`,
        updatedAt: `2031-06-15T10:0${index}:00.000Z`
      });
  });
  const student = client();
  await student.login('student');
  const response = await student.call('/me/dashboard');
  assert.equal(response.status, 200);
  const dashboard = await response.json();
  assert.equal(dashboard.pendingAssessmentCount, 5);
  assert.equal(dashboard.assessments.length, 3);
});

test('teacher dashboard enrollment projection matches the canonical pending enrollment scope without personal data', async (t) => {
  const { client } = await fixture(t);
  const teacher = client();
  await teacher.login('teacher-a');
  const canonical = await teacher.call('/enrollments?status=pending');
  const canonicalRows = await canonical.json();
  assert.equal(canonical.status, 200);
  assert.equal(canonicalRows.items.length, 0);
  const response = await teacher.call('/me/dashboard');
  assert.equal(response.status, 200);
  const dashboard = await response.json();
  assert.equal(dashboard.pendingEnrollmentCount, canonicalRows.items.length);
  assert.equal(JSON.stringify(dashboard).includes('student-pending@aja.local.test'), false);
  assert.equal(JSON.stringify(dashboard).includes('e-pending'), false);
  assert.equal('pendingEnrollments' in dashboard, false);
});

test('dashboard OpenAPI exposes summary counts without private enrollment DTOs and preserves shift values', () => {
  const openapi = JSON.parse(
    fs.readFileSync(new URL('../docs/http/openapi.json', import.meta.url), 'utf8')
  );
  assert.deepEqual(openapi.components.schemas.DashboardClass.properties.shift.enum, [
    'Manhã',
    'Tarde',
    'Noite'
  ]);
  for (const schemaName of ['DashboardStudent', 'DashboardStaff']) {
    const schema = openapi.components.schemas[schemaName];
    assert.deepEqual(schema.properties.pendingEnrollmentCount, { type: 'integer', minimum: 0 });
    assert.equal('pendingEnrollments' in schema.properties, false);
  }
  assert.deepEqual(openapi.components.schemas.DashboardStudent.properties.pendingAssessmentCount, {
    type: 'integer',
    minimum: 0
  });
});

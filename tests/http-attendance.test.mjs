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

const origin = 'http://127.0.0.1:3000';

async function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aja-attendance-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { filename } = openRepository(directory, { baseDate: '2031-06-15' });
  const store = createTransactionStore({
    filename,
    persist: async (file, state) => {
      if (options.failWrites?.()) throw new Error('disk full');
      const { atomicPersist } = await import('../server/transaction-store.mjs');
      atomicPersist(file, state);
    }
  });
  const server = createApp({
    origins: [origin],
    frontendOrigin: origin,
    store,
    now: options.now ?? (() => '2031-06-15T12:00:00Z')
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
      async call(route, body, method = body ? 'POST' : 'GET', key = randomUUID()) {
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
      },
      login(id, password = `AjaLocal-${id}-2031!`) {
        return this.call('/auth/login', { email: `${id}@aja.local.test`, password });
      }
    };
  };
  return { store, client };
}

test('staff can create and reopen a uniquely identified lesson across independent sessions', async (t) => {
  const { client } = await fixture(t);
  const first = client(),
    reopened = client();
  await first.login('teacher-a');
  await reopened.login('teacher-b');
  const eligible = await first.call('/attendance/eligible?subjectId=s1&date=2031-06-15&time=19:00');
  assert.equal(eligible.status, 200);
  assert.deepEqual(
    (await eligible.json()).items.map((item) => item.id),
    ['student', 'student-two']
  );
  const profile = await first.call('/students/student');
  assert.equal(profile.status, 200);
  assert.ok(
    (await profile.json()).attendance.some(
      (item) => item.subjectName === 'Matemática' && item.present === true
    )
  );
  const history = await first.call('/attendance?studentId=student');
  assert.equal(history.status, 200);
  assert.ok((await history.json()).items.some((item) => item.present === true));
  const create = await first.call('/attendance', {
    subjectId: 's1',
    date: '2031-06-15',
    time: '19:00',
    records: { student: true, 'student-two': false }
  });
  assert.equal(create.status, 201);
  const lesson = await create.json();
  const current = await reopened.call('/attendance?subjectId=s1&from=2031-06-15&to=2031-06-15');
  assert.equal(current.status, 200);
  assert.equal((await current.json()).items.find((item) => item.time === '19:00').id, lesson.id);
  const detail = await reopened.call(`/attendance/${lesson.id}`);
  assert.equal(detail.status, 200);
  const staffDto = await detail.json();
  assert.deepEqual(Object.keys(staffDto).sort(), [
    'createdAt',
    'date',
    'id',
    'records',
    'revision',
    'subjectId',
    'time',
    'updatedAt',
    'updatedBy'
  ]);
  assert.deepEqual(staffDto.records, { student: true, 'student-two': false });
  const admin = client();
  await admin.login('admin');
  const adminDetail = await admin.call(`/attendance/${lesson.id}`);
  assert.equal(adminDetail.status, 200);
  assert.deepEqual((await adminDetail.json()).records, { student: true, 'student-two': false });
});

test('concurrent first calls for one lesson never create duplicate attendance records', async (t) => {
  const { client, store } = await fixture(t);
  const first = client(),
    second = client();
  await first.login('teacher-a');
  await second.login('teacher-b');
  const fields = {
    subjectId: 's1',
    date: '2031-06-15',
    time: '19:00',
    records: { student: true, 'student-two': true }
  };
  const results = await Promise.all([
    first.call('/attendance', fields),
    second.call('/attendance', fields)
  ]);
  assert.equal(results.filter((response) => response.status === 201).length, 1);
  assert.equal(results.filter((response) => response.status === 409).length, 1);
  assert.equal(
    (await store.read()).attendance.filter(
      (item) => item.subjectId === 's1' && item.date === fields.date && item.time === fields.time
    ).length,
    1
  );
});

test('stale edits return the latest revision and preserve both server and local marks for comparison', async (t) => {
  const { client, store } = await fixture(t);
  const first = client(),
    second = client();
  await first.login('teacher-a');
  await second.login('teacher-b');
  const initial = await first.call('/attendance', {
    subjectId: 's1',
    date: '2031-06-15',
    time: '19:00',
    records: { student: true, 'student-two': false }
  });
  const lesson = await initial.json();
  assert.equal(
    (
      await first.call(
        `/attendance/${lesson.id}`,
        { expectedRevision: lesson.revision, records: { student: false, 'student-two': false } },
        'PATCH'
      )
    ).status,
    200
  );
  const stale = await second.call(
    `/attendance/${lesson.id}`,
    { expectedRevision: lesson.revision, records: { student: true, 'student-two': true } },
    'PATCH'
  );
  assert.equal(stale.status, 409);
  const current = await second.call(`/attendance/${lesson.id}`);
  assert.equal((await current.json()).records.student, false);
  assert.equal(
    (await store.read()).attendance.find((item) => item.id === lesson.id).records.student,
    false
  );
});

test('failed attendance persistence returns an error and keeps the latest saved marks intact', async (t) => {
  let fail = false;
  const { client, store } = await fixture(t, { failWrites: () => fail });
  const teacher = client();
  await teacher.login('teacher-a');
  const created = await teacher.call('/attendance', {
    subjectId: 's1',
    date: '2031-06-15',
    time: '19:00',
    records: { student: true, 'student-two': false }
  });
  assert.equal(created.status, 201);
  const lesson = await created.json();
  const before = await store.read();
  fail = true;
  const failed = await teacher.call(
    `/attendance/${lesson.id}`,
    { expectedRevision: lesson.revision, records: { student: false, 'student-two': false } },
    'PATCH'
  );
  assert.equal(failed.status, 500);
  assert.deepEqual(await store.read(), before);
});

test('attendance eligibility respects dated enrollment and retains dateless historic marks only', async (t) => {
  const { client, store } = await fixture(t);
  const admin = client();
  await admin.login('admin');
  await store.transact((state) => {
    state.enrollments.find((item) => item.id === 'e1').enrolledAt = '2031-06-16T00:00:00-03:00';
    state.enrollments.find((item) => item.id === 'e2').status = 'ended';
    state.enrollments.find((item) => item.id === 'e2').endedAt = '2031-06-14T23:30:00-03:00';
    state.enrollments.push({
      id: 'e-legacy',
      classId: 'c1',
      studentId: 'student-empty',
      email: 'student-empty@aja.local.test',
      status: 'ended',
      legacy: true,
      createdAt: '2030-01-01T12:00:00Z',
      endedAt: '2031-06-14T23:30:00-03:00',
      createdBy: 'admin',
      unassignedAssessmentIds: []
    });
    state.attendance.push({
      id: 'legacy-mark',
      subjectId: 's1',
      date: '2031-06-14',
      time: '18:00',
      records: { 'student-empty': false }
    });
  });
  const teacher = client();
  await teacher.login('teacher-a');
  const beforeEnrollment = await teacher.call(
    '/attendance/eligible?subjectId=s1&date=2031-06-15&time=19:00'
  );
  assert.deepEqual(
    (await beforeEnrollment.json()).items.map((item) => item.id),
    []
  );
  const afterExit = await teacher.call(
    '/attendance/eligible?subjectId=s1&date=2031-06-15&time=19:00'
  );
  assert.equal(
    (await afterExit.json()).items.some((item) => item.id === 'student-two'),
    false
  );
  const historic = await teacher.call(
    '/attendance/eligible?subjectId=s1&date=2031-06-14&time=18:00'
  );
  assert.equal(
    (await historic.json()).items.some((item) => item.id === 'student-empty'),
    true
  );
  const noHistoric = await teacher.call(
    '/attendance/eligible?subjectId=s1&date=2031-06-15&time=18:00'
  );
  assert.equal(
    (await noHistoric.json()).items.some((item) => item.id === 'student-empty'),
    false
  );
  assert.equal(
    (
      await teacher.call('/attendance', {
        subjectId: 's1',
        date: '2031-06-15',
        time: '19:00',
        records: { student: true, 'student-two': false }
      })
    ).status,
    409
  );
  assert.equal(
    (
      await teacher.call('/attendance', {
        subjectId: 's1',
        date: '2031-06-15',
        time: '18:00',
        records: { 'student-empty': true }
      })
    ).status,
    409
  );
});

test('closed classes remain readable to assigned staff but cannot accept new or revised attendance', async (t) => {
  const { client, store } = await fixture(t);
  const admin = client();
  await admin.login('admin');
  const created = await admin.call('/attendance', {
    subjectId: 's1',
    date: '2031-06-14',
    time: '18:00',
    records: { student: true, 'student-two': false }
  });
  assert.equal(created.status, 201);
  await store.transact((state) => {
    const schoolClass = state.classes.find((item) => item.id === 'c1');
    schoolClass.active = false;
    schoolClass.studentIds = [];
    for (const enrollment of state.enrollments.filter(
      (item) => item.classId === 'c1' && item.status === 'active'
    )) {
      enrollment.status = 'ended';
      enrollment.endedAt = '2031-06-14T23:59:00-03:00';
    }
  });
  const teacher = client();
  await teacher.login('teacher-a');
  const historic = await teacher.call('/attendance?subjectId=s1&from=2031-06-14&to=2031-06-14');
  assert.equal(historic.status, 200);
  assert.equal(
    (
      await teacher.call('/attendance', {
        subjectId: 's1',
        date: '2031-06-15',
        time: '19:00',
        records: {}
      })
    ).status,
    404
  );
  const lesson = (await historic.json()).items.find((item) => item.time === '18:00');
  assert.equal(
    (
      await teacher.call(
        `/attendance/${lesson.id}`,
        { expectedRevision: lesson.revision, records: lesson.records },
        'PATCH'
      )
    ).status,
    404
  );
});

test('unassigned teachers cannot read or write another subject attendance', async (t) => {
  const { client } = await fixture(t);
  const outsider = client();
  await outsider.login('teacher-unassigned');
  assert.equal(
    (await outsider.call('/attendance/eligible?subjectId=s1&date=2031-06-15&time=19:00')).status,
    404
  );
  assert.equal(
    (
      await outsider.call('/attendance', {
        subjectId: 's1',
        date: '2031-06-15',
        time: '19:00',
        records: {}
      })
    ).status,
    404
  );
  assert.equal((await outsider.call('/attendance?studentId=student')).status, 404);
  assert.equal((await outsider.call('/attendance?subjectId=s1&studentId=student')).status, 404);
});

test('students can consult only their own attendance history', async (t) => {
  const { client, store } = await fixture(t);
  await store.transact((state) => {
    state.attendance.push({
      id: 'student-history',
      subjectId: 's1',
      date: '2031-06-15',
      time: '19:00',
      records: { student: true },
      revision: 1,
      createdAt: '2031-06-15T12:00:00.000Z',
      updatedAt: '2031-06-15T12:00:00.000Z',
      updatedBy: 'teacher-a'
    });
  });
  const student = client();
  await student.login('student');
  const history = await student.call(
    '/attendance?studentId=student&from=2031-06-15&to=2031-06-15&page=1&pageSize=1&sort=-date'
  );
  assert.equal(history.status, 200);
  const page = await history.json();
  assert.deepEqual(Object.keys(page).sort(), ['items', 'page', 'pageSize', 'total']);
  assert.equal(page.page, 1);
  assert.equal(page.pageSize, 1);
  assert.equal(page.items.length, 1);
  assert.deepEqual(Object.keys(page.items[0]).sort(), [
    'createdAt',
    'date',
    'id',
    'present',
    'revision',
    'subjectId',
    'time',
    'updatedAt',
    'updatedBy'
  ]);
  assert.equal((await student.call('/attendance?studentId=student&pageSize=101')).status, 422);
  assert.equal((await student.call('/attendance?studentId=student-two')).status, 403);
});

test('students can read detail for their own visible attendance without exposing peer marks', async (t) => {
  const { client, store } = await fixture(t);
  await store.transact((state) => {
    state.attendance.push(
      {
        id: 'peer-only',
        subjectId: 's1',
        date: '2031-06-15',
        time: '18:00',
        records: { 'student-two': true },
        revision: 1,
        createdAt: '2031-06-15T12:00:00.000Z',
        updatedAt: '2031-06-15T12:00:00.000Z',
        updatedBy: 'teacher-a'
      },
      {
        id: 'withdrawn-own',
        subjectId: 's1',
        date: '2031-06-15',
        time: '17:00',
        records: { student: true },
        revision: 1,
        createdAt: '2031-06-15T12:00:00.000Z',
        updatedAt: '2031-06-15T12:00:00.000Z',
        updatedBy: 'teacher-a',
        deletedAt: '2031-06-16T12:00:00.000Z'
      },
      {
        id: 'inaccessible-own',
        subjectId: 's-closed',
        date: '2031-06-13',
        time: '19:00',
        records: { student: true },
        revision: 1,
        createdAt: '2031-06-13T12:00:00.000Z',
        updatedAt: '2031-06-13T12:00:00.000Z',
        updatedBy: 'teacher-a'
      }
    );
  });
  const student = client();
  await student.login('student');
  const history = await student.call('/attendance?studentId=student');
  assert.equal(history.status, 200);
  const visible = (await history.json()).items.find((item) => item.id === 'lesson1');
  assert.ok(visible, 'A marcação individual deve aparecer no histórico autorizado.');
  const detail = await student.call(`/attendance/${visible.id}`);
  assert.equal(detail.status, 200);
  const studentDto = await detail.json();
  assert.deepEqual(Object.keys(studentDto).sort(), [
    'createdAt',
    'date',
    'id',
    'present',
    'revision',
    'subjectId',
    'time',
    'updatedAt',
    'updatedBy'
  ]);
  assert.equal(studentDto.present, true);
  assert.equal(Object.hasOwn(studentDto, 'records'), false);
  for (const id of ['peer-only', 'withdrawn-own', 'inaccessible-own'])
    assert.equal(
      (await student.call(`/attendance/${id}`)).status,
      404,
      `${id} must remain hidden from this student's detail route.`
    );
});

test('attendance reads honor OpenAPI date ranges, pagination, sort and staff DTO', async (t) => {
  const { client, store } = await fixture(t);
  await store.transact((state) => {
    state.attendance = [];
    for (const [id, date, time] of [
      ['lesson-early', '2031-06-13', '19:00'],
      ['lesson-mid', '2031-06-14', '18:00'],
      ['lesson-mid-a', '2031-06-14', '20:00'],
      ['lesson-late', '2031-06-15', '19:00']
    ])
      state.attendance.push({
        id,
        subjectId: 's1',
        date,
        time,
        records: { student: true },
        revision: 1,
        createdAt: `${date}T12:00:00.000Z`,
        updatedAt: `${date}T12:00:00.000Z`,
        updatedBy: 'teacher-a'
      });
  });
  const teacher = client();
  await teacher.login('teacher-a');
  const route =
    '/attendance?subjectId=s1&from=2031-06-13&to=2031-06-15&page=1&pageSize=2&sort=-date';
  const first = await teacher.call(route);
  assert.equal(first.status, 200);
  const page = await first.json();
  assert.deepEqual(Object.keys(page).sort(), ['items', 'page', 'pageSize', 'total']);
  assert.equal(page.page, 1);
  assert.equal(page.pageSize, 2);
  assert.equal(page.total, 4);
  assert.deepEqual(
    page.items.map((item) => item.id),
    ['lesson-late', 'lesson-mid']
  );
  assert.deepEqual(Object.keys(page.items[0]).sort(), [
    'createdAt',
    'date',
    'id',
    'records',
    'revision',
    'subjectId',
    'time',
    'updatedAt',
    'updatedBy'
  ]);
  const second = await teacher.call(
    '/attendance?subjectId=s1&from=2031-06-14&to=2031-06-14&page=1&pageSize=20&sort=date'
  );
  assert.deepEqual(
    (await second.json()).items.map((item) => item.id),
    ['lesson-mid', 'lesson-mid-a']
  );
  assert.equal(
    (await teacher.call('/attendance?subjectId=s1&from=2031-06-15&to=2031-06-13')).status,
    422
  );
  assert.equal(
    (await teacher.call('/attendance?subjectId=s1&from=2031-06-13&to=2031-06-15&sort=time')).status,
    422
  );
});

test('eligible attendance follows its paginated OpenAPI DTO', async (t) => {
  const { client } = await fixture(t);
  const teacher = client();
  await teacher.login('teacher-a');
  const response = await teacher.call(
    '/attendance/eligible?subjectId=s1&date=2031-06-15&time=19:00&page=1&pageSize=1'
  );
  assert.equal(response.status, 200);
  const first = await response.json();
  assert.deepEqual(Object.keys(first).sort(), ['items', 'page', 'pageSize', 'total']);
  assert.equal(first.page, 1);
  assert.equal(first.pageSize, 1);
  assert.equal(first.total, 2);
  assert.deepEqual(first.items, [
    { id: 'student', name: 'Alex Aprendiz', eligible: true, reason: null }
  ]);
  const secondResponse = await teacher.call(
    '/attendance/eligible?subjectId=s1&date=2031-06-15&time=19:00&page=2&pageSize=1'
  );
  const second = await secondResponse.json();
  assert.equal(second.items[0].id, 'student-two');
  assert.deepEqual(Object.keys(second.items[0]).sort(), ['eligible', 'id', 'name', 'reason']);
});

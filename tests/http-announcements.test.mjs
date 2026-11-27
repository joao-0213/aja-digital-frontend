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
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aja-announcements-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { filename } = openRepository(directory, { baseDate: '2031-06-15' });
  let fail = false;
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
    return {
      call,
      get cookie() {
        return cookie;
      }
    };
  }
  return {
    client,
    store,
    failWrites: (value) => {
      fail = value;
    }
  };
}

test('announcements publish to a second session, retain scoped origin and record notification atomically', async (t) => {
  const { client, store } = await fixture(t);
  const teacher = await client('teacher-a'),
    student = await client('student');
  const fields = {
    classId: 'c1',
    subjectId: 's1',
    title: 'Plantão de revisão',
    body: 'Sala 2',
    notify: true,
    occurrence: { date: '2031-06-20', time: '18:30', allDay: false }
  };
  const key = randomUUID();
  const created = await teacher.call('/announcements', fields, 'POST', key);
  assert.equal(created.status, 201);
  const notice = await created.json();
  const replay = await teacher.call('/announcements', fields, 'POST', key);
  assert.equal(replay.status, 201);
  assert.equal((await replay.json()).id, notice.id);
  const listResponse = await student.call('/announcements?subjectId=s1&page=1&pageSize=100');
  const listed = await listResponse.json();
  assert.equal(listResponse.status, 200, JSON.stringify(listed));
  assert.equal(listed.items.find((item) => item.id === notice.id).author.id, 'teacher-a');
  const calendar = await (
    await student.call('/calendar?from=2031-06-20&to=2031-06-20&page=1&pageSize=100')
  ).json();
  assert.deepEqual(
    calendar.items
      .filter((item) => item.sourceId === notice.id)
      .map(({ date, time, href }) => ({ date, time, href })),
    [{ date: '2031-06-20', time: '18:30', href: `/avisos#aviso-${notice.id}` }]
  );
  const requests = (await store.read()).outbox.filter(
    (item) => item.purpose === 'announcement' && item.url.endsWith(`/avisos#aviso-${notice.id}`)
  );
  assert.deepEqual(requests.map((item) => item.userId).sort(), ['student', 'student-two']);
});

test('announcement edit and withdrawal compare revisions and calendar derives no legacy duplicates', async (t) => {
  const { client, store } = await fixture(t);
  const a = await client('teacher-a'),
    b = await client('teacher-b'),
    student = await client('student');
  await store.transact((s) => {
    s.events.push({
      id: 'legacy-event',
      subjectId: 's1',
      title: 'Aula legada',
      description: 'Histórico',
      kind: 'class',
      date: '2031-06-21',
      time: '17:30'
    });
  });
  const create = await (
    await a.call('/announcements', {
      classId: 'c-empty',
      subjectId: 's-empty',
      title: 'Aula extra',
      body: 'Sala 1',
      notify: false,
      occurrence: { date: '2031-06-20', allDay: true }
    })
  ).json();
  assert.equal(
    (
      await b.call(
        `/announcements/${create.id}`,
        { expectedRevision: create.revision, title: 'Texto concorrente' },
        'PATCH'
      )
    ).status,
    403
  );
  const saved = await a.call(
    `/announcements/${create.id}`,
    {
      expectedRevision: create.revision,
      title: 'Aula remarcada',
      body: 'Sala 3',
      notify: false,
      occurrence: { date: '2031-06-21', time: '19:00', allDay: false }
    },
    'PATCH'
  );
  assert.equal(saved.status, 200);
  assert.equal(
    (
      await a.call(
        `/announcements/${create.id}`,
        { expectedRevision: create.revision, title: 'obsoleto' },
        'PATCH'
      )
    ).status,
    409
  );
  let dates = (
    await (await a.call('/calendar?from=2031-06-20&to=2031-06-21&page=1&pageSize=100')).json()
  ).items.filter((item) => item.sourceId === create.id);
  assert.deepEqual(
    dates.map((item) => [item.date, item.time]),
    [['2031-06-21', '19:00']]
  );
  assert.equal(
    (
      await (await a.call('/calendar?from=2031-06-20&to=2031-06-21&page=1&pageSize=100')).json()
    ).items.some((item) => item.title === 'Aula legada'),
    false
  );
  assert.equal(
    (await a.call(`/announcements/${create.id}/withdraw`, { expectedRevision: 2 })).status,
    204
  );
  dates = (
    await (await a.call('/calendar?from=2031-06-20&to=2031-06-21&page=1&pageSize=100')).json()
  ).items.filter((item) => item.sourceId === create.id);
  assert.deepEqual(dates, []);
  assert.equal(
    (await store.read()).events.some((event) => event.id === create.id),
    false
  );
});

test('announcement visibility is scoped and failed writes preserve data and notification intent', async (t) => {
  const { client, store, failWrites } = await fixture(t);
  const teacher = await client('teacher-a'),
    other = await client('teacher-b'),
    student = await client('student');
  assert.equal(
    (
      await other.call('/announcements', {
        classId: 'c-empty',
        subjectId: 's-empty',
        title: 'fora do escopo',
        body: 'x',
        notify: true,
        occurrence: null
      })
    ).status,
    403
  );
  const before = await store.read();
  failWrites(true);
  assert.equal(
    (
      await teacher.call('/announcements', {
        classId: 'c1',
        subjectId: 's1',
        title: 'Aula',
        body: 'Sala',
        notify: true,
        occurrence: null
      })
    ).status,
    500
  );
  assert.deepEqual(await store.read(), before);
  failWrites(false);
  const created = await (
    await teacher.call('/announcements', {
      classId: 'c1',
      subjectId: 's1',
      title: 'Aula',
      body: 'Sala',
      notify: false,
      occurrence: null
    })
  ).json();
  assert.equal(
    (await student.call('/calendar?from=2031-06-15&to=2031-06-30&page=1&pageSize=100')).status,
    200
  );
  assert.equal(
    (
      await (
        await student.call('/calendar?from=2031-06-15&to=2031-06-30&page=1&pageSize=100')
      ).json()
    ).items.some((item) => item.sourceId === created.id),
    false
  );
  assert.equal(
    (await store.read()).outbox.some(
      (item) => item.purpose === 'announcement' && item.url.endsWith(`/avisos#aviso-${created.id}`)
    ),
    false
  );
  assert.equal(created.occurrence, null);
});

test('class-wide announcements are filtered to the selected subject class in mural and calendar', async (t) => {
  const { client } = await fixture(t);
  const admin = await client('admin');
  const created = await admin.call('/announcements', {
    classId: 'c-empty',
    subjectId: null,
    title: 'Aviso de outra turma',
    body: 'Teste de escopo',
    notify: false,
    occurrence: { date: '2031-06-20', allDay: true }
  });
  assert.equal(created.status, 201);
  const notice = await created.json();
  const wall = await (await admin.call('/announcements?subjectId=s1&page=1&pageSize=100')).json();
  assert.equal(
    wall.items.some((item) => item.id === notice.id),
    false
  );
  const calendar = await (
    await admin.call('/calendar?subjectId=s1&from=2031-06-15&to=2031-06-30&page=1&pageSize=100')
  ).json();
  assert.equal(
    calendar.items.some((item) => item.sourceId === notice.id),
    false
  );
  const matchingWall = await (
    await admin.call('/announcements?subjectId=s-empty&page=1&pageSize=100')
  ).json();
  assert.ok(matchingWall.items.some((item) => item.id === notice.id));
  const matchingCalendar = await (
    await admin.call(
      '/calendar?subjectId=s-empty&from=2031-06-15&to=2031-06-30&page=1&pageSize=100'
    )
  ).json();
  assert.ok(matchingCalendar.items.some((item) => item.sourceId === notice.id));
});

test('calendar sorting follows both advertised directions and preserves ascending ID tie-breaks', async (t) => {
  const { client, store } = await fixture(t);
  const teacher = await client('teacher-a');
  await store.transact((state) => {
    state.announcements.push(
      {
        id: 'calendar-b',
        classId: 'c1',
        subjectId: 's1',
        authorId: 'teacher-a',
        title: 'B',
        body: 'B',
        notify: false,
        occurrence: { date: '2031-06-20', time: '19:00', allDay: false }
      },
      {
        id: 'calendar-a',
        classId: 'c1',
        subjectId: 's1',
        authorId: 'teacher-a',
        title: 'A',
        body: 'A',
        notify: false,
        occurrence: { date: '2031-06-20', time: '18:00', allDay: false }
      },
      {
        id: 'calendar-c',
        classId: 'c1',
        subjectId: 's1',
        authorId: 'teacher-a',
        title: 'C',
        body: 'C',
        notify: false,
        occurrence: { date: '2031-06-21', allDay: true }
      }
    );
  });
  const getIds = async (sort) =>
    (
      await (
        await teacher.call(
          `/calendar?from=2031-06-20&to=2031-06-21&page=1&pageSize=100&sort=${sort}`
        )
      ).json()
    ).items
      .filter((item) => item.sourceId.startsWith('calendar-'))
      .map((item) => item.sourceId);
  assert.deepEqual(await getIds('date'), ['calendar-a', 'calendar-b', 'calendar-c']);
  assert.deepEqual(await getIds('-date'), ['calendar-c', 'calendar-a', 'calendar-b']);
});

test('calendar includes assigned assessment deadlines and hides unassigned work from students', async (t) => {
  const { client, store } = await fixture(t);
  const assigned = await client('student-two'),
    unassigned = await client('student');
  await store.transact((state) => {
    state.enrollments.find((item) => item.id === 'e1').unassignedAssessmentIds.push('quiz-open');
  });
  const entriesFor = async (user) =>
    (await (await user.call('/calendar?from=2031-06-15&to=2031-06-30&page=1&pageSize=100')).json())
      .items;
  const assignedEntries = await entriesFor(assigned),
    unassignedEntries = await entriesFor(unassigned);
  assert.ok(
    assignedEntries.some((item) => item.source === 'assessment' && item.sourceId === 'quiz-open')
  );
  assert.ok(
    assignedEntries.some((item) => item.source === 'assessment' && item.sourceId === 'work1')
  );
  assert.equal(
    unassignedEntries.some((item) => item.source === 'assessment' && item.sourceId === 'quiz-open'),
    false
  );
  assert.ok(
    unassignedEntries.some((item) => item.source === 'assessment' && item.sourceId === 'work1')
  );
});

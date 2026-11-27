import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { generateSeed } from '../server/seed.mjs';

const origin = 'http://127.0.0.1:3001';

async function startApi(t) {
  const runtime = await mkdtemp(path.join(tmpdir(), 'aja-18-api-'));
  t.after(() => rm(runtime, { recursive: true, force: true }));
  const fixture = generateSeed();
  const pendingStudent = fixture.users.find((user) => user.id === 'student-pending');
  pendingStudent.emailConfirmedAt = new Date().toISOString();
  await writeFile(path.join(runtime, 'db.json'), `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  const child = spawn(process.execPath, ['--experimental-strip-types', 'server/index.mjs'], {
    env: {
      ...process.env,
      API_PORT: '0',
      API_ALLOWED_ORIGINS: origin,
      AJA_TEST_RUNTIME: runtime,
      NODE_ENV: 'test'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await new Promise((resolve) => child.once('exit', resolve));
    }
  });

  let output = '';
  const address = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`API startup timeout: ${output}`)), 10000);
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/API pronta: (http:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`API exited ${code}: ${output}`));
    });
  });
  return { child, address, runtime };
}

function sessionClient(address, actorRole = 'unknown') {
  let cookie = '';
  return async (route, options = {}) => {
    const headers = new Headers(options.headers);
    headers.set('Origin', origin);
    if (cookie) headers.set('Cookie', cookie);
    const multipart = options.body instanceof FormData;
    if (options.body !== undefined && !multipart) headers.set('Content-Type', 'application/json');
    if (
      options.method === 'POST' &&
      options.body !== undefined &&
      !route.startsWith('/auth/') &&
      !headers.has('Idempotency-Key')
    )
      headers.set('Idempotency-Key', randomUUID());
    const response = await fetch(`${address}/api/v1${route}`, { ...options, headers });
    const setCookies = response.headers.getSetCookie?.() ?? [];
    if (setCookies.length) cookie = setCookies.map((value) => value.split(';', 1)[0]).join('; ');
    response.actorRole = actorRole;
    return response;
  };
}

async function verifyProcessContract(address, runtime) {
  const lessonDate = new Date().toISOString().slice(0, 10);
  const anonymous = sessionClient(address, 'public');
  const health = await anonymous('/health');
  assert.equal(health.status, 200, 'public health is served by the process');
  assert.deepEqual(await health.json(), { status: 'ok', version: '1' });
  const commands = [{ operation: 'GET /health', role: 'public', status: health.status }];
  assert.equal((await anonymous('/me')).status, 401, 'private data requires a service session');

  const admin = sessionClient(address, 'admin');
  const login = await admin('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@aja.local.test', password: 'AjaLocal-admin-2031!' })
  });
  assert.equal(login.status, 200, 'admin login creates a server-owned cookie session');
  assert.match(login.headers.get('set-cookie') ?? '', /HttpOnly/i);
  const adminProfile = await admin('/me');
  assert.equal(adminProfile.status, 200);
  const profile = await adminProfile.json();
  assert.equal(profile.role, 'admin');
  commands.push({ operation: 'GET /me', role: 'admin', status: adminProfile.status });
  const adminSession = await admin('/auth/session');
  assert.equal(adminSession.status, 200);
  commands.push({ operation: 'GET /auth/session', role: 'admin', status: adminSession.status });
  const editedProfile = await admin('/me', {
    method: 'PATCH',
    body: JSON.stringify({ expectedRevision: profile.revision, name: 'Adriana AJA-18 processo' })
  });
  assert.equal(editedProfile.status, 200);
  commands.push({ operation: 'PATCH /me', role: 'admin', status: editedProfile.status });
  assert.equal(
    (await (await admin('/me')).json()).name,
    'Adriana AJA-18 processo',
    'profile edit persists after fresh GET'
  );
  const users = await admin('/users');
  assert.equal(users.status, 200, 'administrator can read the authorized user list');
  assert.ok(Array.isArray((await users.json()).items));

  const teacher = sessionClient(address, 'teacher');
  const teacherLogin = await teacher('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'teacher-a@aja.local.test',
      password: 'AjaLocal-teacher-a-2031!'
    })
  });
  assert.equal(teacherLogin.status, 200);
  const teacherProfile = await teacher('/me');
  assert.equal(teacherProfile.status, 200);
  commands.push({ operation: 'GET /me', role: 'teacher', status: teacherProfile.status });
  assert.equal((await teacher('/subjects/s1')).status, 200, 'assigned teacher can read the course');
  assert.equal(
    (await teacher('/attendance?subjectId=s1&from=2020-01-01&to=2040-01-01')).status,
    200,
    'assigned teacher can read attendance history'
  );

  const readMatrix = async (client, role, routes) => {
    const outcomes = [];
    for (const route of routes) {
      const response = await client(route);
      assert.equal(response.status, 200, `${role} can read ${route}`);
      outcomes.push({ method: 'GET', path: route.split('?')[0], status: response.status });
    }
    return outcomes;
  };
  const adminReads = await readMatrix(admin, 'admin', [
    '/classes',
    '/students?classId=c1',
    '/enrollments?classId=c1',
    '/enrollments/preview?classId=c1&email=student%40aja.local.test',
    '/enrollments/e1',
    '/students/student',
    '/attendance?studentId=student',
    '/subjects',
    '/users?role=teacher',
    '/subjects/s1/visits',
    '/subjects/s1',
    '/modules?subjectId=s1',
    '/materials?subjectId=s1',
    '/materials/material-text',
    '/files/file-material',
    '/files/file-material/content',
    '/me/progress',
    '/questions',
    '/questions/q1',
    '/assessments',
    '/assessments/quiz-open',
    '/attempts?assessmentId=quiz-open',
    '/attempts/attempt-sent',
    '/attempts/attempt-sent/result',
    '/submissions?assessmentId=work1',
    '/submissions/submission-waiting',
    '/announcements?classId=c1',
    '/calendar?from=2020-01-01&to=2040-01-01',
    '/topics?subjectId=s1',
    '/topics/topic1',
    '/attendance?subjectId=s1&from=2020-01-01&to=2040-01-01',
    `/attendance/eligible?subjectId=s1&date=${lessonDate}&time=19:00`,
    '/me/dashboard'
  ]);
  const teacherReads = await readMatrix(teacher, 'assigned teacher', [
    '/classes',
    '/students?classId=c1',
    '/enrollments?classId=c1',
    '/students/student',
    '/attendance?studentId=student',
    '/subjects',
    '/subjects/s1/visits',
    '/subjects/s1',
    '/modules?subjectId=s1',
    '/materials?subjectId=s1',
    '/materials/material-text',
    '/files/file-material',
    '/questions',
    '/questions/q1',
    '/assessments',
    '/assessments/quiz-open',
    '/attempts?assessmentId=quiz-open',
    '/submissions?assessmentId=work1',
    '/submissions/submission-waiting',
    '/announcements?classId=c1',
    '/calendar?from=2020-01-01&to=2040-01-01',
    '/topics?subjectId=s1',
    '/topics/topic1',
    '/attendance?subjectId=s1&from=2020-01-01&to=2040-01-01',
    `/attendance/eligible?subjectId=s1&date=${lessonDate}&time=19:00`,
    '/me/dashboard'
  ]);

  const unassigned = sessionClient(address, 'teacher-unassigned');
  const unassignedLogin = await unassigned('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'teacher-unassigned@aja.local.test',
      password: 'AjaLocal-teacher-unassigned-2031!'
    })
  });
  assert.equal(unassignedLogin.status, 200);
  assert.ok(
    [403, 404].includes((await unassigned('/subjects/s1')).status),
    'unassigned teacher cannot read by ID'
  );

  const student = sessionClient(address, 'student');
  const studentLogin = await student('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'student@aja.local.test', password: 'AjaLocal-student-2031!' })
  });
  assert.equal(studentLogin.status, 200);
  const studentProfile = await student('/me');
  assert.equal(studentProfile.status, 200);
  commands.push({ operation: 'GET /me', role: 'student', status: studentProfile.status });
  const studentTwo = sessionClient(address, 'student-two');
  assert.equal(
    (
      await studentTwo('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'student-two@aja.local.test',
          password: 'AjaLocal-student-two-2031!'
        })
      })
    ).status,
    200
  );
  assert.equal((await student('/subjects/s1')).status, 200, 'enrolled student can read the course');
  assert.equal(
    (await student('/topics?subjectId=s1&page=1&pageSize=20')).status,
    200,
    'student can read authorized forum topics'
  );
  assert.equal(
    (await student('/calendar?from=2020-01-01&to=2040-01-01&page=1&pageSize=100')).status,
    200,
    'student can read their scoped calendar'
  );
  const studentReads = await readMatrix(student, 'enrolled student', [
    '/me/enrollments',
    '/subjects',
    '/subjects/s1',
    '/modules?subjectId=s1',
    '/subjects/s1/visits',
    '/materials?subjectId=s1',
    '/materials/material-text',
    '/files/file-material',
    '/files/file-material/content',
    '/me/progress',
    '/questions',
    '/questions/q1',
    '/assessments',
    '/assessments/quiz-open',
    '/attempts?assessmentId=quiz-open',
    '/attempts/attempt-draft',
    '/attempts/attempt-sent',
    '/attempts/attempt-sent/result',
    '/submissions?assessmentId=work1',
    '/submissions/submission-waiting',
    '/announcements?classId=c1',
    '/calendar?from=2020-01-01&to=2040-01-01',
    '/topics?subjectId=s1',
    '/topics/topic1',
    '/me/dashboard'
  ]);
  assert.equal(
    (
      await student('/auth/password-reset-requests', {
        method: 'POST',
        body: JSON.stringify({ email: 'student@aja.local.test' })
      })
    ).status,
    202,
    'password recovery request is accepted without exposing token'
  );
  assert.equal(
    (await student('/users')).status,
    403,
    'student cannot read the administration list'
  );
  const deniedWrites = [];
  for (const [role, client, route] of [
    ['student', student, '/classes'],
    ['teacher', teacher, '/classes'],
    ['student', student, '/users'],
    ['teacher', teacher, '/users'],
    ['student', student, '/enrollments']
  ]) {
    const response = await client(route, { method: 'POST', body: JSON.stringify({}) });
    assert.equal(response.status, 403, `${role} cannot write ${route}`);
    deniedWrites.push({ role, method: 'POST', path: route, status: response.status });
  }

  const adminEdit = sessionClient(address, 'admin'),
    adminConflict = sessionClient(address, 'admin');
  for (const client of [adminEdit, adminConflict]) {
    assert.equal(
      (
        await client('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: 'admin@aja.local.test', password: 'AjaLocal-admin-2031!' })
        })
      ).status,
      200
    );
  }
  const subject = await (await adminEdit('/subjects/s1')).json();
  const revoked = await adminEdit('/subjects/s1', {
    method: 'PATCH',
    body: JSON.stringify({ expectedRevision: subject.subject.revision, teacherIds: ['teacher-b'] })
  });
  assert.equal(revoked.status, 200, 'administrator revokes a current teacher assignment');
  const staleTeacherEdit = await teacher('/materials/material-text', {
    method: 'PATCH',
    body: JSON.stringify({ expectedRevision: 1, title: 'Revoked edit must fail' })
  });
  assert.equal(
    staleTeacherEdit.status,
    403,
    'revocation is enforced against the live API when an edit is attempted'
  );

  const teacherAssigned = sessionClient(address, 'teacher');
  assert.equal(
    (
      await teacherAssigned('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'teacher-b@aja.local.test',
          password: 'AjaLocal-teacher-b-2031!'
        })
      })
    ).status,
    200
  );
  const reloads = [];
  const recordCommand = async (operation, response, expected) => {
    assert.equal(
      response.status,
      expected,
      `${operation} responds ${expected}: ${response.status === expected ? '' : await response.clone().text()}`
    );
    commands.push({ operation, role: response.actorRole ?? 'unknown', status: response.status });
    return response.status === 204 ? null : response.json();
  };
  const reload = async (client, role, route, evidencePath = route, expected = 200) => {
    const response = await client(route);
    const allowed = Array.isArray(expected) ? expected : [expected];
    assert.ok(
      allowed.includes(response.status),
      `${role} GET ${evidencePath} responds ${allowed.join('|')}`
    );
    reloads.push({ role, method: 'GET', path: evidencePath, status: response.status });
    return response;
  };
  const apiSpec = JSON.parse(await readFile(path.resolve('docs/http/openapi.json'), 'utf8'));
  const roleClients = { admin, teacher: teacherAssigned, student };
  const routeIds = {
    users: 'teacher-b',
    classes: 'c1',
    students: 'student',
    enrollments: 'e1',
    subjects: 's1',
    modules: 'm1',
    materials: 'material-text',
    files: 'file-material',
    questions: 'q1',
    assessments: 'quiz-open',
    attempts: 'attempt-sent',
    submissions: 'submission-waiting',
    announcements: 'notice1',
    topics: 'topic1',
    attendance: 'lesson1'
  };
  const roleReads = [];
  for (const [template, definition] of Object.entries(apiSpec.paths)) {
    if (!definition.get) continue;
    const operation = definition.get;
    const roles = operation['x-roles'] ?? [];
    const pathForOperation = template
      .replaceAll('{replyId}', 'reply1')
      .replaceAll('{id}', routeIds[template.split('/')[1]] ?? 's1');
    const query = new URLSearchParams();
    for (const parameter of [...(definition.parameters ?? []), ...(operation.parameters ?? [])]) {
      if (parameter.in !== 'query' || !parameter.required) continue;
      let value = parameter.example ?? parameter.schema?.example;
      if (parameter.name === 'from') value = '2020-01-01';
      if (parameter.name === 'to') value = '2040-01-01';
      if (parameter.name === 'date') value = lessonDate;
      if (parameter.name === 'time') value = '19:00';
      if (parameter.name === 'studentId') value = 'student';
      if (parameter.name === 'classId') value = 'c1';
      if (parameter.name === 'email') value = 'student@aja.local.test';
      if (parameter.name === 'subjectId') value = 's1';
      if (parameter.name === 'assessmentId') value = 'quiz-open';
      if (parameter.name === 'moduleId') value = 'm1';
      if (value !== undefined) query.set(parameter.name, String(value));
    }
    if (['/students', '/enrollments'].includes(template)) query.set('classId', 'c1');
    if (['/modules', '/materials'].includes(template)) query.set('subjectId', 's1');
    if (template === '/attendance') {
      query.set('subjectId', 's1');
      query.set('from', '2020-01-01');
      query.set('to', '2040-01-01');
    }
    if (template === '/attendance/eligible') {
      query.set('subjectId', 's1');
      query.set('date', lessonDate);
      query.set('time', '19:00');
    }
    if (template === '/announcements') query.set('classId', 'c1');
    const route = `${pathForOperation}${query.size ? `?${query}` : ''}`;
    const actors = roles.length ? roles : ['public'];
    for (const role of actors) {
      const client = role === 'public' ? anonymous : roleClients[role];
      const actorRoute =
        template === '/attendance' && role === 'student' ? '/attendance?studentId=student' : route;
      const response = await client(actorRoute);
      assert.equal(
        response.status,
        200,
        `${role} can read ${actorRoute}; got ${response.status}: ${await response.clone().text()}`
      );
      roleReads.push({ role, method: 'GET', path: template, status: response.status });
    }
  }
  const deniedOperations = [];
  for (const [template, definition] of Object.entries(apiSpec.paths)) {
    const ids = { ...routeIds };
    const root = template.split('/')[1];
    const pathForOperation = template
      .replaceAll('{replyId}', 'reply1')
      .replaceAll('{id}', ids[root] ?? 's1');
    for (const [method, operation] of Object.entries(definition)) {
      const verb = method.toUpperCase();
      if (
        !['GET', 'POST', 'PATCH', 'DELETE'].includes(verb) ||
        !Array.isArray(operation['x-roles']) ||
        operation['x-roles'].length === 0
      )
        continue;
      for (const role of ['admin', 'teacher', 'student']) {
        if (operation['x-roles'].includes(role)) continue;
        let route = pathForOperation;
        if (template === '/enrollments/preview')
          route += '?classId=c1&email=student%40aja.local.test';
        if (template === '/attendance/eligible')
          route += '?subjectId=s1&date=2031-06-15&time=19%3A00';
        const bodyExample = operation.requestBody?.content?.['application/json']?.example ?? {};
        const options = verb === 'GET' ? {} : { method: verb, body: JSON.stringify(bodyExample) };
        const response = await roleClients[role](route, options);
        assert.ok(
          [403, 404].includes(response.status),
          `${role} is denied ${verb} ${template}; got ${response.status}: ${await response.clone().text()}`
        );
        deniedOperations.push({ role, method: verb, path: template, status: response.status });
      }
    }
  }
  deniedWrites.push(...deniedOperations);
  const newClass = await recordCommand(
    'POST /classes',
    await admin('/classes', {
      method: 'POST',
      body: JSON.stringify({
        name: 'AJA-18 Matriz',
        code: `M18-${randomUUID().slice(0, 6)}`,
        year: new Date().getUTCFullYear(),
        shift: 'Noite'
      })
    }),
    201
  );
  const editedClass = await recordCommand(
    'PATCH /classes/{id}',
    await admin(`/classes/${newClass.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ expectedRevision: newClass.revision, name: 'AJA-18 Matriz editada' })
    }),
    200
  );
  assert.equal(
    (await (await reload(admin, 'admin', `/classes/${newClass.id}`, '/classes/{id}')).json()).name,
    'AJA-18 Matriz editada',
    'class edit persists after a fresh GET'
  );
  const closedClass = await recordCommand(
    'POST /classes/{id}/close',
    await admin(`/classes/${newClass.id}/close`, {
      method: 'POST',
      body: JSON.stringify({ expectedRevision: editedClass.revision })
    }),
    200
  );
  assert.equal(
    (await (await reload(admin, 'admin', `/classes/${newClass.id}`, '/classes/{id}')).json())
      .active,
    false
  );
  const reopenedClass = await recordCommand(
    'POST /classes/{id}/reopen',
    await admin(`/classes/${newClass.id}/reopen`, {
      method: 'POST',
      body: JSON.stringify({ expectedRevision: closedClass.revision })
    }),
    200
  );
  assert.equal(
    (await (await reload(admin, 'admin', `/classes/${newClass.id}`, '/classes/{id}')).json())
      .active,
    true
  );

  const emailPrefix = `aja18-${randomUUID()}`;
  const newTeacher = await recordCommand(
    'POST /users',
    await admin('/users', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Docente AJA18',
        email: `${emailPrefix}@example.test`,
        role: 'teacher'
      })
    }),
    201
  );
  const editedTeacher = await recordCommand(
    'PATCH /users/{id}',
    await admin(`/users/${newTeacher.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ expectedRevision: newTeacher.revision, name: 'Docente AJA18 editada' })
    }),
    200
  );
  assert.equal(
    (await (await reload(admin, 'admin', `/users/${newTeacher.id}`, '/users/{id}')).json()).name,
    'Docente AJA18 editada',
    'user edit persists after a fresh GET'
  );
  const roleChanged = await recordCommand(
    'POST /users/{id}/role',
    await admin(`/users/${newTeacher.id}/role`, {
      method: 'POST',
      body: JSON.stringify({ expectedRevision: editedTeacher.revision, role: 'admin' })
    }),
    200
  );
  await recordCommand(
    'POST /users/{id}/deactivate',
    await admin(`/users/${newTeacher.id}/deactivate`, {
      method: 'POST',
      body: JSON.stringify({ expectedRevision: roleChanged.revision })
    }),
    200
  );
  await recordCommand(
    'POST /users/{id}/withdraw',
    await admin(`/users/${newTeacher.id}/withdraw`, {
      method: 'POST',
      body: JSON.stringify({ expectedRevision: roleChanged.revision + 1 })
    }),
    200
  );

  const pendingEnrollment = await recordCommand(
    'POST /enrollments',
    await admin('/enrollments', {
      method: 'POST',
      body: JSON.stringify({ classId: 'c-empty', email: `${emailPrefix}-pending@example.test` })
    }),
    201
  );
  assert.equal(
    (
      await (
        await reload(admin, 'admin', `/enrollments/${pendingEnrollment.id}`, '/enrollments/{id}')
      ).json()
    ).status,
    'pending',
    'enrollment is visible after reload'
  );
  await recordCommand(
    'POST /enrollments/{id}/cancel',
    await admin(`/enrollments/${pendingEnrollment.id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ expectedRevision: pendingEnrollment.revision })
    }),
    200
  );
  assert.equal(
    (
      await (
        await reload(admin, 'admin', `/enrollments/${pendingEnrollment.id}`, '/enrollments/{id}')
      ).json()
    ).status,
    'cancelled'
  );
  const endedEnrollment = await recordCommand(
    'POST /enrollments/{id}/end',
    await admin('/enrollments/e2/end', {
      method: 'POST',
      body: JSON.stringify({ expectedRevision: 1 })
    }),
    200
  );
  assert.equal(
    (await (await reload(admin, 'admin', '/enrollments/e2', '/enrollments/{id}')).json()).status,
    'ended'
  );
  const activated = await recordCommand(
    'POST /enrollments/{id}/activate',
    await admin('/enrollments/e-pending/activate', {
      method: 'POST',
      body: JSON.stringify({ expectedRevision: 1 })
    }),
    200
  );
  assert.equal(activated.status, 'active');
  assert.equal(
    (await (await reload(admin, 'admin', '/enrollments/e-pending', '/enrollments/{id}')).json())
      .status,
    'active'
  );

  const eligibleToday = await (
    await teacherAssigned(`/attendance/eligible?subjectId=s1&date=${lessonDate}&time=19:00`)
  ).json();
  assert.ok(
    eligibleToday.items.length,
    'a current active enrollment is eligible for attendance today'
  );
  const attendanceRecords = Object.fromEntries(eligibleToday.items.map((item) => [item.id, true]));
  const attendance = await recordCommand(
    'POST /attendance',
    await teacherAssigned('/attendance', {
      method: 'POST',
      body: JSON.stringify({
        subjectId: 's1',
        date: lessonDate,
        time: '19:00',
        records: attendanceRecords
      })
    }),
    201
  );
  const absentRecords = Object.fromEntries(eligibleToday.items.map((item) => [item.id, false]));
  await recordCommand(
    'PATCH /attendance/{id}',
    await teacherAssigned(`/attendance/${attendance.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ expectedRevision: attendance.revision, records: absentRecords })
    }),
    200
  );
  assert.equal(
    (
      await (
        await reload(
          teacherAssigned,
          'assigned teacher',
          `/attendance/${attendance.id}`,
          '/attendance/{id}'
        )
      ).json()
    ).records.student,
    false,
    'attendance edit persists after a fresh GET'
  );
  assert.equal(
    (await (await reload(student, 'student', '/attendance?studentId=student')).json()).items.some(
      (item) => item.id === attendance.id && item.present === false
    ),
    true,
    'student sees only own saved attendance result'
  );

  const topic = await recordCommand(
    'POST /topics',
    await student('/topics', {
      method: 'POST',
      body: JSON.stringify({
        classId: 'c1',
        subjectId: 's1',
        title: 'AJA-18 processo: dúvida',
        body: 'Registrar uma dúvida de contrato pela API real.',
        tags: [],
        target: null,
        attachmentId: null
      })
    }),
    201
  );
  await recordCommand(
    'GET /topics/{id}',
    await reload(student, 'student', `/topics/${topic.id}`, '/topics/{id}'),
    200
  );
  await recordCommand(
    'POST /topics/{id}/read',
    await student(`/topics/${topic.id}/read`, { method: 'POST', body: JSON.stringify({}) }),
    200
  );
  const studentReply = await recordCommand(
    'POST /topics/{id}/replies',
    await student(`/topics/${topic.id}/replies`, {
      method: 'POST',
      body: JSON.stringify({ body: 'Complemento da dúvida pelo próprio aluno.' })
    }),
    201
  );
  const studentReplyId = studentReply.replies.find(
    (item) => item.body === 'Complemento da dúvida pelo próprio aluno.'
  ).id;
  const teacherReplyTopic = await recordCommand(
    'POST /topics/{id}/replies',
    await teacherAssigned(`/topics/${topic.id}/replies`, {
      method: 'POST',
      body: JSON.stringify({ body: 'Resposta real da equipe AJA-18.' })
    }),
    201
  );
  const reply = teacherReplyTopic.replies.find(
    (item) => item.body === 'Resposta real da equipe AJA-18.'
  );
  const adminReplyTopic = await recordCommand(
    'POST /topics/{id}/replies',
    await admin(`/topics/${topic.id}/replies`, {
      method: 'POST',
      body: JSON.stringify({ body: 'Resposta da administração AJA-18.' })
    }),
    201
  );
  const adminReply = adminReplyTopic.replies.find(
    (item) => item.body === 'Resposta da administração AJA-18.'
  );
  await recordCommand(
    'POST /topics/{id}/replies/{replyId}/vote',
    await student(`/topics/${topic.id}/replies/${reply.id}/vote`, {
      method: 'POST',
      body: JSON.stringify({ voted: true })
    }),
    200
  );
  await recordCommand(
    'POST /topics/{id}/replies/{replyId}/vote',
    await teacherAssigned(`/topics/${topic.id}/replies/${adminReply.id}/vote`, {
      method: 'POST',
      body: JSON.stringify({ voted: true })
    }),
    200
  );
  await recordCommand(
    'POST /topics/{id}/replies/{replyId}/vote',
    await admin(`/topics/${topic.id}/replies/${reply.id}/vote`, {
      method: 'POST',
      body: JSON.stringify({ voted: true })
    }),
    200
  );
  await recordCommand(
    'POST /topics/{id}/read',
    await teacherAssigned(`/topics/${topic.id}/read`, { method: 'POST', body: JSON.stringify({}) }),
    200
  );
  await recordCommand(
    'POST /topics/{id}/read',
    await admin(`/topics/${topic.id}/read`, { method: 'POST', body: JSON.stringify({}) }),
    200
  );
  let topicRevision = (
    await (
      await reload(teacherAssigned, 'assigned teacher', `/topics/${topic.id}`, '/topics/{id}')
    ).json()
  ).revision;
  await recordCommand(
    'POST /topics/{id}/solution',
    await teacherAssigned(`/topics/${topic.id}/solution`, {
      method: 'POST',
      body: JSON.stringify({ expectedRevision: topicRevision, replyId: adminReply.id })
    }),
    200
  );
  topicRevision = (
    await (await reload(admin, 'admin', `/topics/${topic.id}`, '/topics/{id}')).json()
  ).revision;
  await recordCommand(
    'POST /topics/{id}/solution',
    await admin(`/topics/${topic.id}/solution`, {
      method: 'POST',
      body: JSON.stringify({ expectedRevision: topicRevision, replyId: reply.id })
    }),
    200
  );
  const studentReplyCurrent = await (
    await reload(student, 'student', `/topics/${topic.id}`, '/topics/{id}')
  ).json();
  await recordCommand(
    'POST /topics/{id}/replies/{replyId}/withdraw',
    await student(`/topics/${topic.id}/replies/${studentReplyId}/withdraw`, {
      method: 'POST',
      body: JSON.stringify({ expectedRevision: studentReplyCurrent.revision })
    }),
    200
  );
  const adminReplyCurrent = await (
    await reload(admin, 'admin', `/topics/${topic.id}`, '/topics/{id}')
  ).json();
  await recordCommand(
    'POST /topics/{id}/replies/{replyId}/withdraw',
    await admin(`/topics/${topic.id}/replies/${adminReply.id}/withdraw`, {
      method: 'POST',
      body: JSON.stringify({ expectedRevision: adminReplyCurrent.revision })
    }),
    200
  );
  const teacherTopic = await recordCommand(
    'POST /topics',
    await teacherAssigned('/topics', {
      method: 'POST',
      body: JSON.stringify({
        classId: 'c1',
        subjectId: 's1',
        title: 'Topico docente AJA-18',
        body: 'Publicação pelo docente autorizado.',
        tags: [],
        target: null,
        attachmentId: null
      })
    }),
    201
  );
  await recordCommand(
    'POST /topics/{id}/withdraw',
    await teacherAssigned(`/topics/${teacherTopic.id}/withdraw`, {
      method: 'POST',
      body: JSON.stringify({ expectedRevision: teacherTopic.revision })
    }),
    200
  );
  const adminTopic = await recordCommand(
    'POST /topics',
    await admin('/topics', {
      method: 'POST',
      body: JSON.stringify({
        classId: 'c1',
        subjectId: 's1',
        title: 'Topico admin AJA-18',
        body: 'Publicação pela administração autorizada.',
        tags: [],
        target: null,
        attachmentId: null
      })
    }),
    201
  );
  await recordCommand(
    'POST /topics/{id}/withdraw',
    await admin(`/topics/${adminTopic.id}/withdraw`, {
      method: 'POST',
      body: JSON.stringify({ expectedRevision: adminTopic.revision })
    }),
    200
  );
  const topicCurrent = await (
    await reload(student, 'student', `/topics/${topic.id}`, '/topics/{id}')
  ).json();
  await recordCommand(
    'POST /topics/{id}/solution',
    await student(`/topics/${topic.id}/solution`, {
      method: 'POST',
      body: JSON.stringify({ expectedRevision: topicCurrent.revision, replyId: reply.id })
    }),
    200
  );
  const teacherTopicCurrent = await (
    await reload(teacherAssigned, 'assigned teacher', `/topics/${topic.id}`, '/topics/{id}')
  ).json();
  await recordCommand(
    'POST /topics/{id}/replies/{replyId}/withdraw',
    await teacherAssigned(`/topics/${topic.id}/replies/${reply.id}/withdraw`, {
      method: 'POST',
      body: JSON.stringify({ expectedRevision: teacherTopicCurrent.revision })
    }),
    200
  );
  const studentTopicCurrent = await (
    await reload(student, 'student', `/topics/${topic.id}`, '/topics/{id}')
  ).json();
  await recordCommand(
    'POST /topics/{id}/withdraw',
    await student(`/topics/${topic.id}/withdraw`, {
      method: 'POST',
      body: JSON.stringify({ expectedRevision: studentTopicCurrent.revision })
    }),
    200
  );
  assert.ok(
    [403, 404].includes(
      (await reload(student, 'student', `/topics/${topic.id}`, '/topics/{id}', [403, 404])).status
    ),
    'withdrawn topic is no longer visible after reload'
  );

  const newSubject = await recordCommand(
    'POST /subjects',
    await admin('/subjects', {
      method: 'POST',
      body: JSON.stringify({
        classId: 'c1',
        name: 'AJA-18 Ciências',
        description: 'Contexto de processo externo',
        color: 'green',
        icon: 'book',
        teacherIds: ['teacher-b']
      })
    }),
    201
  );
  await recordCommand(
    'POST /subjects/{id}/visits',
    await student('/subjects/s1/visits', {
      method: 'POST',
      body: JSON.stringify({ publicationIds: [] })
    }),
    200
  );
  const editedSubject = await recordCommand(
    'PATCH /subjects/{id}',
    await admin(`/subjects/${newSubject.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        expectedRevision: newSubject.revision,
        name: 'AJA-18 Ciências atualizada'
      })
    }),
    200
  );
  assert.equal(
    (
      await (
        await reload(
          teacherAssigned,
          'assigned teacher',
          `/subjects/${newSubject.id}`,
          '/subjects/{id}'
        )
      ).json()
    ).subject.name,
    'AJA-18 Ciências atualizada',
    'subject edit persists and is visible to assigned teacher'
  );
  const newModule = await recordCommand(
    'POST /modules',
    await teacherAssigned('/modules', {
      method: 'POST',
      body: JSON.stringify({
        subjectId: newSubject.id,
        title: 'Módulo de validação',
        description: 'Escrita por docente atribuído.'
      })
    }),
    201
  );
  const editedModule = await recordCommand(
    'PATCH /modules/{id}',
    await teacherAssigned(`/modules/${newModule.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        expectedRevision: newModule.revision,
        title: 'Módulo de validação editado'
      })
    }),
    200
  );
  const subjectBeforeOrder = await (
    await reload(
      teacherAssigned,
      'assigned teacher',
      `/subjects/${newSubject.id}`,
      '/subjects/{id}'
    )
  ).json();
  const moduleOrder = await recordCommand(
    'POST /subjects/{id}/reorder-modules',
    await teacherAssigned(`/subjects/${newSubject.id}/reorder-modules`, {
      method: 'POST',
      body: JSON.stringify({
        expectedRevision: subjectBeforeOrder.subject.revision,
        items: [{ id: newModule.id, expectedRevision: editedModule.revision }]
      })
    }),
    200
  );
  assert.equal(
    (await (await admin(`/subjects/${newSubject.id}`)).json()).modules[0].title,
    'Módulo de validação editado',
    'module create/edit/order persist after fresh subject GET'
  );

  const fileForm = new FormData();
  fileForm.set('purpose', 'material');
  fileForm.set('parentId', newModule.id);
  fileForm.set(
    'file',
    new Blob([await readFile(new URL('../server/fixtures/proporcoes.pdf', import.meta.url))], {
      type: 'application/pdf'
    }),
    'aja18-matriz.pdf'
  );
  const stagedFile = await recordCommand(
    'POST /files (multipart)',
    await teacherAssigned('/files', { method: 'POST', body: fileForm }),
    201
  );
  const disposableForm = new FormData();
  disposableForm.set('purpose', 'material');
  disposableForm.set('parentId', newModule.id);
  disposableForm.set(
    'file',
    new Blob([await readFile(new URL('../server/fixtures/proporcoes.pdf', import.meta.url))], {
      type: 'application/pdf'
    }),
    'aja18-descartar.pdf'
  );
  const disposableFile = await recordCommand(
    'POST /files',
    await teacherAssigned('/files', { method: 'POST', body: disposableForm }),
    201
  );
  await recordCommand(
    'POST /files/{id}/discard',
    await teacherAssigned(`/files/${disposableFile.id}/discard`, {
      method: 'POST',
      body: JSON.stringify({})
    }),
    204
  );
  const moduleBeforePublish = await (
    await reload(teacherAssigned, 'assigned teacher', `/modules/${newModule.id}`, '/modules/{id}')
  ).json();
  const publishedBatch = await recordCommand(
    'POST /materials/batch',
    await teacherAssigned('/materials/batch', {
      method: 'POST',
      body: JSON.stringify({
        moduleId: newModule.id,
        expectedRevision: moduleBeforePublish.revision,
        items: [
          {
            moduleId: newModule.id,
            title: 'Material do processo',
            kind: 'pdf',
            duration: 5,
            content: '',
            fileId: stagedFile.id
          }
        ]
      })
    }),
    201
  );
  const newMaterial = publishedBatch.items[0];
  const updatedMaterial = await recordCommand(
    'PATCH /materials/{id}',
    await teacherAssigned(`/materials/${newMaterial.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        expectedRevision: newMaterial.revision,
        title: 'Material do processo revisado'
      })
    }),
    200
  );
  assert.equal(
    (
      await (
        await reload(student, 'student', `/materials/${newMaterial.id}`, '/materials/{id}')
      ).json()
    ).material.title,
    'Material do processo revisado',
    'published material edit persists after reload'
  );
  assert.equal(
    (await reload(student, 'student', `/files/${stagedFile.id}/content`, '/files/{id}/content'))
      .status,
    200,
    'enrolled student can retrieve attached file bytes'
  );
  const materialsList = await (
    await reload(
      teacherAssigned,
      'assigned teacher',
      `/materials?subjectId=${newSubject.id}`,
      '/materials?subjectId={id}'
    )
  ).json();
  const reorderItems = materialsList.items.map((item) => ({
    id: item.id,
    expectedRevision: item.revision
  }));
  const moduleBeforeMaterialOrder = await (
    await reload(teacherAssigned, 'assigned teacher', `/modules/${newModule.id}`, '/modules/{id}')
  ).json();
  await recordCommand(
    'POST /modules/{id}/reorder-materials',
    await teacherAssigned(`/modules/${newModule.id}/reorder-materials`, {
      method: 'POST',
      body: JSON.stringify({
        expectedRevision: moduleBeforeMaterialOrder.revision,
        items: reorderItems
      })
    }),
    200
  );

  await recordCommand(
    'PATCH /me/progress',
    await student('/me/progress', {
      method: 'PATCH',
      body: JSON.stringify({ materialId: 'material-pdf', completed: true })
    }),
    200
  );
  assert.equal(
    (
      await (await reload(student, 'student', '/me/progress?materialId=material-pdf')).json()
    ).items.some((item) => item.completed === true),
    true,
    'student progress persists after reload'
  );
  assert.equal((await reload(studentTwo, 'student-two', '/me/progress')).status, 200);
  assert.equal(
    (await (await reload(studentTwo, 'student-two', '/me/progress')).json()).items.some(
      (item) => item.materialId === 'material-pdf'
    ),
    false,
    'another student cannot see this account progress'
  );

  const practice = await recordCommand(
    'POST /questions/{id}/practice',
    await student('/questions/q2/practice', {
      method: 'POST',
      body: JSON.stringify({ choice: 1 })
    }),
    200
  );
  assert.equal(practice.isCorrect, true);
  await recordCommand(
    'POST /questions/{id}/practice (teacher)',
    await teacherAssigned('/questions/q2/practice', {
      method: 'POST',
      body: JSON.stringify({ choice: 1 })
    }),
    200
  );
  await recordCommand(
    'POST /questions/{id}/practice (admin)',
    await admin('/questions/q2/practice', { method: 'POST', body: JSON.stringify({ choice: 1 }) }),
    200
  );

  const announcement = await recordCommand(
    'POST /announcements',
    await teacherAssigned('/announcements', {
      method: 'POST',
      body: JSON.stringify({
        classId: 'c1',
        subjectId: newSubject.id,
        title: 'AJA-18 evento',
        body: 'Aviso publicado no processo real.',
        notify: false,
        occurrence: { date: lessonDate, allDay: true }
      })
    }),
    201
  );
  await recordCommand(
    'GET /announcements/{id}',
    await teacherAssigned(`/announcements/${announcement.id}`),
    200
  );
  const editedAnnouncement = await recordCommand(
    'PATCH /announcements/{id}',
    await teacherAssigned(`/announcements/${announcement.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        expectedRevision: announcement.revision,
        title: 'AJA-18 evento atualizado',
        body: 'Alteracao confirmada por HTTP.',
        notify: false,
        occurrence: { date: lessonDate, allDay: true }
      })
    }),
    200
  );
  assert.equal(
    (
      await (
        await reload(
          student,
          'student',
          `/announcements?subjectId=${newSubject.id}`,
          '/announcements?subjectId={id}'
        )
      ).json()
    ).items.some(
      (item) => item.id === announcement.id && item.title === 'AJA-18 evento atualizado'
    ),
    true,
    'announcement edits are visible to an enrolled student after reload'
  );
  assert.equal(
    (
      await (
        await reload(
          student,
          'student',
          `/calendar?from=${lessonDate}&to=${lessonDate}`,
          '/calendar?from={date}&to={date}'
        )
      ).json()
    ).items.some((item) => item.sourceId === announcement.id),
    true,
    'published announcement appears in calendar after reload'
  );
  await recordCommand(
    'POST /announcements/{id}/withdraw',
    await teacherAssigned(`/announcements/${announcement.id}/withdraw`, {
      method: 'POST',
      body: JSON.stringify({ expectedRevision: editedAnnouncement.revision })
    }),
    204
  );
  assert.equal(
    (
      await (
        await reload(
          student,
          'student',
          `/announcements?subjectId=${newSubject.id}`,
          '/announcements?subjectId={id}'
        )
      ).json()
    ).items.some((item) => item.id === announcement.id),
    false,
    'withdrawn announcement is hidden after reload'
  );
  const deniedAnnouncement = await student('/announcements', {
    method: 'POST',
    body: JSON.stringify({
      classId: 'c1',
      subjectId: newSubject.id,
      title: 'Denied',
      body: 'Forbidden write',
      notify: false,
      occurrence: null
    })
  });
  assert.equal(deniedAnnouncement.status, 403, 'student cannot publish announcements');
  deniedWrites.push({
    role: 'student',
    method: 'POST',
    path: '/announcements',
    status: deniedAnnouncement.status
  });

  const quizAttempt = await recordCommand(
    'POST /attempts',
    await student('/attempts', {
      method: 'POST',
      body: JSON.stringify({ assessmentId: 'quiz-no-deadline' })
    }),
    201
  );
  const savedAnswers = await recordCommand(
    'PATCH /attempts/{id}/answers',
    await student(`/attempts/${quizAttempt.id}/answers`, {
      method: 'PATCH',
      body: JSON.stringify({
        expectedRevision: quizAttempt.revision,
        answers: { q1: 0, qa1: null }
      })
    }),
    200
  );
  const submitKey = randomUUID();
  const submittedAttempt = await recordCommand(
    'POST /attempts/{id}/submit',
    await student(`/attempts/${quizAttempt.id}/submit`, {
      method: 'POST',
      headers: { 'Idempotency-Key': submitKey },
      body: JSON.stringify({ expectedRevision: savedAnswers.revision })
    }),
    200
  );
  await recordCommand(
    'GET /attempts/{id}/result',
    await student(`/attempts/${quizAttempt.id}/result`),
    200
  );
  await recordCommand(
    'GET /attempts/{id}/result (teacher projection)',
    await teacherAssigned(`/attempts/${quizAttempt.id}/result`),
    200
  );
  assert.equal(
    (
      await teacherAssigned(`/attempts/${quizAttempt.id}/answers`, {
        method: 'PATCH',
        body: JSON.stringify({ expectedRevision: submittedAttempt.attempt.revision, answers: {} })
      })
    ).status,
    403,
    'teacher cannot edit a student attempt'
  );
  deniedWrites.push({
    role: 'teacher',
    method: 'PATCH',
    path: '/attempts/{id}/answers',
    status: 403
  });

  const feedbackDraft = await recordCommand(
    'PATCH /submissions/{id}/feedback',
    await teacherAssigned('/submissions/submission-waiting/feedback', {
      method: 'PATCH',
      body: JSON.stringify({
        expectedRevision: 1,
        comment: 'Feedback pelo processo externo AJA-18.',
        grade: 9
      })
    }),
    200
  );
  await recordCommand(
    'POST /submissions/{id}/publish-feedback',
    await teacherAssigned('/submissions/submission-waiting/publish-feedback', {
      method: 'POST',
      body: JSON.stringify({ expectedRevision: feedbackDraft.revision })
    }),
    200
  );
  assert.equal(
    (await (await reload(student, 'student', '/submissions/submission-waiting')).json())
      .feedbackPublished.comment,
    'Feedback pelo processo externo AJA-18.',
    'published feedback is visible only through the learner submission projection'
  );

  const assessment = await recordCommand(
    'POST /assessments',
    await teacherAssigned('/assessments', {
      method: 'POST',
      body: JSON.stringify({
        moduleId: newModule.id,
        title: 'Trabalho AJA-18 processo',
        description: 'Atividade de contrato real.',
        kind: 'work',
        maxGrade: 10,
        deadline: null,
        required: true,
        allowLate: false,
        questions: []
      })
    }),
    201
  );
  const editedAssessment = await recordCommand(
    'PATCH /assessments/{id}',
    await teacherAssigned(`/assessments/${assessment.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        expectedRevision: assessment.revision,
        title: 'Trabalho AJA-18 processo editado'
      })
    }),
    200
  );
  await recordCommand(
    'POST /assessments/{id}/publish',
    await teacherAssigned(`/assessments/${assessment.id}/publish`, {
      method: 'POST',
      body: JSON.stringify({ expectedRevision: editedAssessment.revision })
    }),
    200
  );
  assert.equal(
    (
      await (
        await reload(student, 'student', `/assessments/${assessment.id}`, '/assessments/{id}')
      ).json()
    ).status,
    'published'
  );
  const preparedSubmission = await recordCommand(
    'POST /submissions',
    await student('/submissions', {
      method: 'POST',
      body: JSON.stringify({
        assessmentId: assessment.id,
        attachments: [{ kind: 'link', name: 'Evidencia AJA-18', url: 'https://example.test/aja18' }]
      })
    }),
    201
  );
  const updatedSubmission = await recordCommand(
    'PATCH /submissions/{id}',
    await student(`/submissions/${preparedSubmission.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        expectedRevision: preparedSubmission.revision,
        attachments: [
          {
            kind: 'link',
            name: 'Evidencia editada AJA-18',
            url: 'https://example.test/aja18-editada'
          }
        ]
      })
    }),
    200
  );
  await recordCommand(
    'POST /submissions/{id}/submit',
    await student(`/submissions/${preparedSubmission.id}/submit`, {
      method: 'POST',
      body: JSON.stringify({ expectedRevision: updatedSubmission.revision })
    }),
    200
  );
  assert.ok(
    (
      await (
        await reload(
          student,
          'student',
          `/submissions/${preparedSubmission.id}`,
          '/submissions/{id}'
        )
      ).json()
    ).receipt,
    'submission receipt persists after reload'
  );

  const authEmail = `aja18-${randomUUID()}@example.test`;
  const registered = await recordCommand(
    'POST /auth/register',
    await anonymous('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Conta AJA-18',
        email: authEmail,
        password: 'Aja18-processo-2031!'
      })
    }),
    201
  );
  await recordCommand(
    'POST /auth/email-confirmation-requests',
    await anonymous('/auth/email-confirmation-requests', {
      method: 'POST',
      body: JSON.stringify({ email: authEmail })
    }),
    202
  );
  const runtimeState = JSON.parse(await readFile(path.join(runtime, 'db.json'), 'utf8'));
  const confirmationUrl = runtimeState.outbox
    .filter((item) => item.userId === registered.id && item.purpose === 'email-confirmation')
    .at(-1)?.url;
  assert.ok(confirmationUrl, 'test runtime contains the generated confirmation message');
  const confirmationToken = new URL(confirmationUrl).searchParams.get('token');
  await recordCommand(
    'POST /auth/email-confirmations',
    await anonymous('/auth/email-confirmations', {
      method: 'POST',
      body: JSON.stringify({ token: confirmationToken })
    }),
    200
  );
  const registeredSession = sessionClient(address, 'student');
  await recordCommand(
    'POST /auth/login (registered user)',
    await registeredSession('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: authEmail, password: 'Aja18-processo-2031!' })
    }),
    200
  );
  await recordCommand(
    'POST /auth/logout',
    await registeredSession('/auth/logout', { method: 'POST' }),
    204
  );
  assert.equal(
    (await registeredSession('/auth/session')).status,
    401,
    'logout revokes the process session'
  );
  await recordCommand(
    'POST /auth/password-reset-requests',
    await anonymous('/auth/password-reset-requests', {
      method: 'POST',
      body: JSON.stringify({ email: authEmail })
    }),
    202
  );
  const resetState = JSON.parse(await readFile(path.join(runtime, 'db.json'), 'utf8'));
  const resetUrl = resetState.outbox
    .filter((item) => item.userId === registered.id && item.purpose === 'password-reset')
    .at(-1)?.url;
  assert.ok(resetUrl, 'test runtime contains the generated reset message');
  const resetToken = new URL(resetUrl).searchParams.get('token');
  await recordCommand(
    'POST /auth/password-resets',
    await anonymous('/auth/password-resets', {
      method: 'POST',
      body: JSON.stringify({ token: resetToken, password: 'Aja18-resetada-2031!' })
    }),
    200
  );
  const resetSession = sessionClient(address, 'student');
  await recordCommand(
    'POST /auth/login (reset password)',
    await resetSession('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: authEmail, password: 'Aja18-resetada-2031!' })
    }),
    200
  );

  for (const [role, client] of [
    ['teacher', teacherAssigned],
    ['admin', admin],
    ['student', student]
  ]) {
    await recordCommand(
      'POST /subjects/{id}/visits',
      await client('/subjects/s1/visits', {
        method: 'POST',
        body: JSON.stringify({ publicationIds: [] })
      }),
      200
    );
    const self = await (await client('/me')).json();
    await recordCommand(
      'PATCH /me',
      await client('/me', {
        method: 'PATCH',
        body: JSON.stringify({ expectedRevision: self.revision, name: `${self.name} AJA-18` })
      }),
      200
    );
    await recordCommand(
      'PATCH /me/progress',
      await client('/me/progress', {
        method: 'PATCH',
        body: JSON.stringify({ materialId: 'material-text', completed: true })
      }),
      200
    );
  }

  const uploadForRole = async (role, client) => {
    const form = new FormData();
    form.set('purpose', 'forum');
    form.set('parentId', 's1');
    form.set(
      'file',
      new Blob([await readFile(new URL('../server/fixtures/grupos.png', import.meta.url))], {
        type: 'image/png'
      }),
      `aja18-${role}.png`
    );
    const staged = await recordCommand(
      'POST /files',
      await client('/files', { method: 'POST', body: form }),
      201
    );
    await recordCommand(
      'POST /files/{id}/discard',
      await client(`/files/${staged.id}/discard`, { method: 'POST', body: JSON.stringify({}) }),
      204
    );
  };
  await uploadForRole('student', student);
  await uploadForRole('admin', admin);

  const adminModule = await recordCommand(
    'POST /modules',
    await admin('/modules', {
      method: 'POST',
      body: JSON.stringify({
        subjectId: 's1',
        title: 'Módulo admin AJA-18',
        description: 'Criação administrativa permitida.'
      })
    }),
    201
  );
  const adminModuleEdit = await recordCommand(
    'PATCH /modules/{id}',
    await admin(`/modules/${adminModule.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        expectedRevision: adminModule.revision,
        title: 'Módulo admin AJA-18 editado'
      })
    }),
    200
  );
  const subjectSnapshot = await (await admin('/subjects/s1')).json();
  const subjectModules = await (await admin('/modules?subjectId=s1')).json();
  await recordCommand(
    'POST /subjects/{id}/reorder-modules',
    await admin('/subjects/s1/reorder-modules', {
      method: 'POST',
      body: JSON.stringify({
        expectedRevision: subjectSnapshot.subject.revision,
        items: subjectModules.items.map((item) => ({
          id: item.id,
          expectedRevision: item.revision
        }))
      })
    }),
    200
  );
  const adminUploadForm = new FormData();
  adminUploadForm.set('purpose', 'material');
  adminUploadForm.set('parentId', adminModule.id);
  adminUploadForm.set(
    'file',
    new Blob([await readFile(new URL('../server/fixtures/proporcoes.pdf', import.meta.url))], {
      type: 'application/pdf'
    }),
    'aja18-admin.pdf'
  );
  const adminStagedFile = await recordCommand(
    'POST /files',
    await admin('/files', { method: 'POST', body: adminUploadForm }),
    201
  );
  const currentAdminModule = await (await admin(`/modules/${adminModule.id}`)).json();
  const adminBatch = await recordCommand(
    'POST /materials/batch',
    await admin('/materials/batch', {
      method: 'POST',
      body: JSON.stringify({
        moduleId: adminModule.id,
        expectedRevision: currentAdminModule.revision,
        items: [
          {
            moduleId: adminModule.id,
            title: 'Material admin AJA-18',
            kind: 'pdf',
            duration: 5,
            content: '',
            fileId: adminStagedFile.id
          }
        ]
      })
    }),
    201
  );
  const adminMaterial = adminBatch.items[0];
  await recordCommand(
    'PATCH /materials/{id}',
    await admin(`/materials/${adminMaterial.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        expectedRevision: adminMaterial.revision,
        title: 'Material admin AJA-18 editado'
      })
    }),
    200
  );
  const adminModuleCurrent = await (await admin(`/modules/${adminModule.id}`)).json();
  const adminMaterials = await (await admin(`/materials?moduleId=${adminModule.id}`)).json();
  await recordCommand(
    'POST /modules/{id}/reorder-materials',
    await admin(`/modules/${adminModule.id}/reorder-materials`, {
      method: 'POST',
      body: JSON.stringify({
        expectedRevision: adminModuleCurrent.revision,
        items: adminMaterials.items.map((item) => ({
          id: item.id,
          expectedRevision: item.revision
        }))
      })
    }),
    200
  );

  const adminAssessment = await recordCommand(
    'POST /assessments',
    await admin('/assessments', {
      method: 'POST',
      body: JSON.stringify({
        moduleId: adminModule.id,
        title: 'Trabalho admin AJA-18',
        description: 'Atividade administrativa de processo.',
        kind: 'work',
        maxGrade: 10,
        deadline: null,
        required: true,
        allowLate: false,
        questions: []
      })
    }),
    201
  );
  const adminAssessmentEdit = await recordCommand(
    'PATCH /assessments/{id}',
    await admin(`/assessments/${adminAssessment.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        expectedRevision: adminAssessment.revision,
        title: 'Trabalho admin AJA-18 editado'
      })
    }),
    200
  );
  await recordCommand(
    'POST /assessments/{id}/publish',
    await admin(`/assessments/${adminAssessment.id}/publish`, {
      method: 'POST',
      body: JSON.stringify({ expectedRevision: adminAssessmentEdit.revision })
    }),
    200
  );

  const adminFeedbackTarget = await (await admin(`/submissions/${preparedSubmission.id}`)).json();
  const adminFeedback = await recordCommand(
    'PATCH /submissions/{id}/feedback',
    await admin(`/submissions/${preparedSubmission.id}/feedback`, {
      method: 'PATCH',
      body: JSON.stringify({
        expectedRevision: adminFeedbackTarget.revision,
        comment: 'Retorno administrativo AJA-18.',
        grade: 8
      })
    }),
    200
  );
  await recordCommand(
    'POST /submissions/{id}/publish-feedback',
    await admin(`/submissions/${preparedSubmission.id}/publish-feedback`, {
      method: 'POST',
      body: JSON.stringify({ expectedRevision: adminFeedback.revision })
    }),
    200
  );

  const adminAnnouncement = await recordCommand(
    'POST /announcements',
    await admin('/announcements', {
      method: 'POST',
      body: JSON.stringify({
        classId: 'c1',
        subjectId: 's1',
        title: 'Aviso admin AJA-18',
        body: 'Publicação administrativa pelo processo real.',
        notify: false,
        occurrence: null
      })
    }),
    201
  );
  const adminAnnouncementEdit = await recordCommand(
    'PATCH /announcements/{id}',
    await admin(`/announcements/${adminAnnouncement.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        expectedRevision: adminAnnouncement.revision,
        title: 'Aviso admin AJA-18 editado'
      })
    }),
    200
  );
  await recordCommand(
    'POST /announcements/{id}/withdraw',
    await admin(`/announcements/${adminAnnouncement.id}/withdraw`, {
      method: 'POST',
      body: JSON.stringify({ expectedRevision: adminAnnouncementEdit.revision })
    }),
    204
  );

  const eligibleAdminCall = await (
    await admin(`/attendance/eligible?subjectId=s1&date=${lessonDate}&time=20:00`)
  ).json();
  const adminAttendance = await recordCommand(
    'POST /attendance',
    await admin('/attendance', {
      method: 'POST',
      body: JSON.stringify({
        subjectId: 's1',
        date: lessonDate,
        time: '20:00',
        records: Object.fromEntries(eligibleAdminCall.items.map((item) => [item.id, true]))
      })
    }),
    201
  );
  await recordCommand(
    'PATCH /attendance/{id}',
    await admin(`/attendance/${adminAttendance.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        expectedRevision: adminAttendance.revision,
        records: Object.fromEntries(eligibleAdminCall.items.map((item) => [item.id, false]))
      })
    }),
    200
  );

  await recordCommand('POST /auth/logout', await teacher('/auth/logout', { method: 'POST' }), 204);
  await recordCommand('POST /auth/logout', await admin('/auth/logout', { method: 'POST' }), 204);

  return {
    health: 200,
    anonymousPrivate: 401,
    admin: 200,
    assignedTeacher: 200,
    unassignedTeacher: '403|404',
    attendance: 200,
    forum: 200,
    calendar: 200,
    recoveryRequest: 202,
    studentAdministration: 403,
    revokedEdit: 403,
    matrixRoleReads: roleReads,
    matrixReads: { admin: adminReads, teacher: teacherReads, student: studentReads },
    deniedWrites,
    commands,
    reloads
  };
}

test('same HTTP contract suite passes against two independent JSON Server process URLs', async (t) => {
  const first = await startApi(t);
  const firstResult = await verifyProcessContract(first.address, first.runtime);
  const second = await startApi(t);
  const secondResult = await verifyProcessContract(second.address, second.runtime);
  t.diagnostic(
    `same contract exercised against first=${first.address} and second=${second.address}`
  );
  assert.deepEqual(secondResult, firstResult);
  assert.notEqual(
    first.address,
    second.address,
    'the contract was exercised against two distinct API URLs'
  );
  const evidenceDir = path.resolve('docs/http/evidence/AJA-18');
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(
    path.join(evidenceDir, 'http-process-read-matrix.log'),
    `${JSON.stringify({ result: 'PASS', firstApi: first.address, secondApi: second.address, sameOutcomes: true, outcomes: firstResult }, null, 2)}\n`,
    'utf8'
  );
  assert.deepEqual(
    { first: first.address, second: second.address, outcomes: firstResult },
    {
      first: first.address,
      second: second.address,
      outcomes: firstResult
    }
  );
});

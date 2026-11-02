import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server/app.mjs';
import { openRepository } from '../server/repository.mjs';
import { atomicPersist, createTransactionStore } from '../server/transaction-store.mjs';

const origin = 'http://127.0.0.1:3000';
const openApiSchemas = JSON.parse(fs.readFileSync(new URL('../docs/http/openapi.json', import.meta.url), 'utf8')).components.schemas;

function assertSchemaObject(schemaName, value) {
  const schema = openApiSchemas[schemaName];
  assert.ok(schema, `OpenAPI schema ${schemaName} exists`);
  assert.deepEqual(Object.keys(value).sort(), Object.keys(schema.properties).sort(), `${schemaName} additionalProperties:false`);
  for (const key of schema.required) assert.ok(Object.hasOwn(value, key), `${schemaName}.${key} is required`);
}

async function fixture(t, initialNow = '2031-06-15T12:00:00Z', { injectNow = true } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aja-attempts-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { filename } = openRepository(directory, { baseDate: '2031-06-15' });
  let now = initialNow;
  let failWrites = false;
  const store = createTransactionStore({ filename, persist: (file, state) => {
    if (failWrites) throw new Error('disk full');
    atomicPersist(file, state);
  } });
  const server = createApp({ origins: [origin], frontendOrigin: origin, store, ...(injectNow ? { now: () => now } : {}) }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  async function client(id) {
    let cookie = '';
    const request = async (route, body, method = body ? 'POST' : 'GET', headers = {}) => {
      const response = await fetch(base + route, {
        method,
        headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return response;
    };
    assert.equal((await request('/auth/login', { email: `${id}@aja.local.test`, password: `AjaLocal-${id}-2031!` })).status, 200);
    return request;
  }
  return { store, client, setNow: value => { now = value; }, setFailWrites: value => { failWrites = value; } };
}

const post = (client, route, body, key) => client(route, body, 'POST', key ? { 'Idempotency-Key': key } : {});

async function createPublishedQuiz(teacher, { title = 'Quiz de integração', deadline = null, allowLate = false, questionIds = ['q1', 'q2'] } = {}) {
  const created = await post(teacher, '/assessments', {
    moduleId: 'm1', title, description: 'Leia e responda.', kind: 'quiz', maxGrade: null,
    deadline, required: true, allowLate, questions: questionIds.map(questionId => ({ source: 'bank', questionId }))
  }, `assessment-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-create`);
  assert.equal(created.status, 201, await created.clone().text());
  const draft = await created.json();
  const published = await post(teacher, `/assessments/${draft.id}/publish`, { expectedRevision: draft.revision }, `assessment-${draft.id}-publish`);
  assert.equal(published.status, 200, await published.clone().text());
  return published.json();
}

test('student starts an assigned quiz with a private prompt snapshot and no answer key', async t => {
  const { client, store } = await fixture(t);
  const student = await client('student-two');

  const started = await student('/attempts', { assessmentId: 'quiz-open' });

  assert.equal(started.status, 201, await started.clone().text());
  const attempt = await started.json();
  assertSchemaObject('AttemptStudent', attempt);
  assert.equal(attempt.assessmentId, 'quiz-open');
  assert.equal(attempt.userId, 'student-two');
  assert.deepEqual(attempt.questionOrder, ['q1', 'qa1']);
  assert.deepEqual(attempt.answers, {});
  assert.equal(attempt.questions.length, 2);
  assert.equal(attempt.questions[0].statement, 'Qual é a razão entre 4 e 2?');
  for (const question of attempt.questions) {
    assertSchemaObject('QuestionPrompt', question);
    assert.equal('correct' in question, false);
    assert.equal('explanation' in question, false);
  }
  assert.equal((await store.read()).attempts.filter(row => row.assessmentId === 'quiz-open' && row.userId === 'student-two').length, 1);
  const ownAttempts = await student('/attempts');
  assert.equal(ownAttempts.status, 200, await ownAttempts.clone().text());
  assert.ok((await ownAttempts.json()).items.some(row => row.id === attempt.id), 'unfiltered GET lists the student’s own attempt for the list screen');
});

test('production-style API config starts an attempt with the default request clock', async t => {
  const { client } = await fixture(t, undefined, { injectNow: false });
  const student = await client('student-two');

  assert.equal((await student('/assessments/quiz-no-deadline')).status, 200);
  assert.equal((await student('/assessments?moduleId=m1')).status, 200);
  const started = await post(student, '/attempts', { assessmentId: 'quiz-no-deadline' });

  assert.equal(started.status, 201, await started.clone().text());
  const attempt = await started.json();
  assert.equal(attempt.assessmentId, 'quiz-no-deadline');
  assert.equal(attempt.submittedAt, null);
  assert.ok(Date.parse(attempt.startedAt));

  assert.equal((await post(student, '/questions/q1/practice', { choice: 0 })).status, 409, 'practice stays blocked for questions in the pending snapshot');
  assert.equal((await post(student, '/questions/q2/practice', { choice: 0 })).status, 200, 'unrelated practice remains available');
  const saved = await student(`/attempts/${attempt.id}/answers`, { expectedRevision: attempt.revision, answers: { q1: 0, qa1: null } }, 'PATCH');
  assert.equal(saved.status, 200, await saved.clone().text());
  const submitted = await post(student, `/attempts/${attempt.id}/submit`, { expectedRevision: (await saved.json()).revision }, 'attempt-default-clock-submit-key');
  assert.equal(submitted.status, 200, await submitted.clone().text());
  const receipt = await submitted.json();
  assert.equal(receipt.attempt.answers.qa1, null);
  assert.ok(receipt.receipt.id);
  const result = await student(`/attempts/${attempt.id}/result`);
  assert.equal(result.status, 200, await result.clone().text());
  assert.equal((await student('/attempts?assessmentId=quiz-no-deadline')).status, 200);
});

test('attempt projections identify the authorized student and quiz for the submission list', async t => {
  const { client } = await fixture(t);
  const teacher = await client('teacher-a');
  const firstStudent = await client('student');
  const secondStudent = await client('student-two');
  const assessment = await createPublishedQuiz(teacher, { title: 'Identificação de entregas' });

  const firstStart = await post(firstStudent, '/attempts', { assessmentId: assessment.id });
  assert.equal(firstStart.status, 201, await firstStart.clone().text());
  const firstAttempt = await firstStart.json();
  assertSchemaObject('AttemptStudent', firstAttempt);
  assert.equal(firstAttempt.assessmentTitle, assessment.title, 'the student attempt names its authorized activity');
  assert.equal(firstAttempt.studentName, 'Alex Aprendiz', 'the student attempt names only its owner');
  assert.equal('email' in firstAttempt, false);
  const firstSubmit = await post(firstStudent, `/attempts/${firstAttempt.id}/submit`, { expectedRevision: firstAttempt.revision }, 'attempt-identity-first-submit');
  assert.equal(firstSubmit.status, 200, await firstSubmit.clone().text());

  const secondStart = await post(secondStudent, '/attempts', { assessmentId: assessment.id });
  assert.equal(secondStart.status, 201, await secondStart.clone().text());
  const secondAttempt = await secondStart.json();
  assertSchemaObject('AttemptStudent', secondAttempt);
  assert.equal(secondAttempt.assessmentTitle, assessment.title);
  assert.equal(secondAttempt.studentName, 'Bia Aprendiz');
  assert.equal('email' in secondAttempt, false);
  const secondSubmit = await post(secondStudent, `/attempts/${secondAttempt.id}/submit`, { expectedRevision: secondAttempt.revision }, 'attempt-identity-second-submit');
  assert.equal(secondSubmit.status, 200, await secondSubmit.clone().text());

  const staffList = await teacher(`/attempts?assessmentId=${assessment.id}`);
  assert.equal(staffList.status, 200, await staffList.clone().text());
  const items = (await staffList.json()).items;
  for (const item of items) {
    assertSchemaObject('AttemptStaff', item);
    assert.equal('email' in item, false);
  }
  assert.deepEqual(items.map(item => item.studentName).sort(), ['Alex Aprendiz', 'Bia Aprendiz']);
  assert.ok(items.every(item => item.assessmentTitle === assessment.title));
  for (const attemptId of [firstAttempt.id, secondAttempt.id]) {
    const staffDetail = await teacher(`/attempts/${attemptId}`);
    assert.equal(staffDetail.status, 200, await staffDetail.clone().text());
    const detail = await staffDetail.json();
    assertSchemaObject('AttemptStaff', detail);
    assert.equal(detail.assessmentTitle, assessment.title);
    assert.ok(['Alex Aprendiz', 'Bia Aprendiz'].includes(detail.studentName));
    const result = await teacher(`/attempts/${attemptId}/result`);
    assert.equal(result.status, 200, await result.clone().text());
    const resultDto = await result.json();
    assertSchemaObject('AttemptResult', resultDto);
    assertSchemaObject('AttemptStudent', resultDto.attempt);
    assert.equal(resultDto.attempt.assessmentTitle, assessment.title);
    assert.equal(resultDto.attempt.studentName, detail.studentName);
  }
});

test('assigned staff can read submitted attempt history for a closed class until access is revoked', async t => {
  const { client, store } = await fixture(t);
  const teacher = await client('teacher-a');

  assert.equal((await teacher('/assessments/quiz-closed')).status, 200);
  assert.equal((await teacher('/attempts?assessmentId=quiz-closed')).status, 200);
  assert.equal((await teacher('/attempts/attempt-sent')).status, 200);
  assert.equal((await teacher('/attempts/attempt-sent/result')).status, 200);

  await store.transact(state => { state.classes.find(row => row.id === 'c1').active = false; });
  assert.equal((await teacher('/assessments/quiz-closed')).status, 200, 'the assessment remains available to assigned staff for historical reads');
  const list = await teacher('/attempts?assessmentId=quiz-closed');
  assert.equal(list.status, 200, await list.clone().text());
  assert.ok((await list.json()).items.some(item => item.id === 'attempt-sent'));
  assert.equal((await teacher('/attempts/attempt-sent')).status, 200);
  assert.equal((await teacher('/attempts/attempt-sent/result')).status, 200);

  await store.transact(state => { state.subjects.find(row => row.id === 's1').teacherIds = state.subjects.find(row => row.id === 's1').teacherIds.filter(id => id !== 'teacher-a'); });
  assert.equal((await teacher('/attempts?assessmentId=quiz-closed')).status, 404, 'revocation removes the assignment before list access');
  assert.equal((await teacher('/attempts/attempt-sent')).status, 404);
  assert.equal((await teacher('/attempts/attempt-sent/result')).status, 404);
});

test('question practice cannot reveal a key for a question in the current student attempt snapshot', async t => {
  const { client, store } = await fixture(t);
  const student = await client('student-two');
  const attempt = await post(student, '/attempts', { assessmentId: 'quiz-no-deadline' });
  assert.equal(attempt.status, 201, await attempt.clone().text());
  const started = await attempt.json();
  await store.transact(state => {
    const current = state.questions.find(question => question.id === 'q1');
    current.correct = 1;
    current.explanation = 'Explicação corrente do acervo.';
  });

  const practice = await student('/questions/q1/practice', { choice: 0 });

  assert.equal(practice.status, 409, await practice.clone().text());
  const unrelated = await student('/questions/q2/practice', { choice: 1 });
  assert.equal(unrelated.status, 200, await unrelated.clone().text());
  assert.equal((await unrelated.json()).correct, 1);

  const submitted = await post(student, `/attempts/${started.id}/submit`, { expectedRevision: started.revision }, 'attempt-unlock-practice-key');
  assert.equal(submitted.status, 200, await submitted.clone().text());
  const afterSubmit = await student('/questions/q1/practice', { choice: 1 });
  assert.equal(afterSubmit.status, 200, await afterSubmit.clone().text());
  assert.equal((await afterSubmit.json()).correct, 1, 'independent practice uses the current public bank question');
  const result = await student(`/attempts/${started.id}/result`);
  assert.equal(result.status, 200, await result.clone().text());
  assert.equal((await result.json()).questions[0].correct, 0, 'authorized attempt result keeps its captured snapshot');

  await store.transact(state => { state.questions.find(question => question.id === 'q1').deletedAt = '2031-06-15T12:00:00Z'; });
  assert.equal((await student('/questions/q1/practice', { choice: 1 })).status, 404);
  assert.equal((await student(`/attempts/${started.id}/result`)).status, 200, 'retiring the bank copy does not erase an authorized submitted snapshot');
  await store.transact(state => {
    state.enrollments.find(row => row.id === 'e2').status = 'ended';
    state.enrollments.find(row => row.id === 'e2').endedAt = '2031-06-15T12:01:00Z';
    state.classes.find(row => row.id === 'c1').studentIds = ['student'];
  });
  assert.equal((await student(`/attempts/${started.id}/result`)).status, 404, 'revocation blocks the private attempt snapshot');
});

test('saved answers and blank responses resume from the server in a second session without changing the snapshot', async t => {
  const { client, store } = await fixture(t);
  const firstSession = await client('student-two');
  const started = await post(firstSession, '/attempts', { assessmentId: 'quiz-no-deadline' });
  assert.equal(started.status, 201, await started.clone().text());
  const attempt = await started.json();
  const save = await firstSession(`/attempts/${attempt.id}/answers`, { expectedRevision: attempt.revision, answers: { q1: 1, qa1: null } }, 'PATCH');
  assert.equal(save.status, 200, await save.clone().text());
  const current = await save.json();

  const secondSession = await client('student-two');
  const list = await secondSession('/attempts?assessmentId=quiz-no-deadline');
  assert.equal(list.status, 200, await list.clone().text());
  const resumed = (await list.json()).items.find(row => row.id === attempt.id);
  assert.deepEqual(resumed.answers, { q1: 1, qa1: null });
  assert.deepEqual(resumed.questionOrder, ['q1', 'qa1']);
  assert.equal(resumed.revision, current.revision);
  for (const question of resumed.questions) {
    assert.equal('correct' in question, false);
    assert.equal('explanation' in question, false);
  }

  const reopened = await post(secondSession, '/attempts', { assessmentId: 'quiz-no-deadline' });
  assert.equal(reopened.status, 201, await reopened.clone().text());
  assert.equal((await reopened.json()).id, attempt.id);
  assert.equal((await store.read()).attempts.filter(row => row.assessmentId === 'quiz-no-deadline' && row.userId === 'student-two').length, 1);
});

test('answer saves replace the complete map, reject IDs and indexes outside the snapshot, and preserve revision conflicts', async t => {
  const { client, store } = await fixture(t);
  const student = await client('student-two');
  const attempt = await (await post(student, '/attempts', { assessmentId: 'quiz-no-deadline' })).json();

  const foreign = await student(`/attempts/${attempt.id}/answers`, { expectedRevision: attempt.revision, answers: { 'not-in-snapshot': 0 } }, 'PATCH');
  assert.equal(foreign.status, 422);
  const invalidChoice = await student(`/attempts/${attempt.id}/answers`, { expectedRevision: attempt.revision, answers: { q1: 4 } }, 'PATCH');
  assert.equal(invalidChoice.status, 422);
  assert.deepEqual((await store.read()).attempts.find(row => row.id === attempt.id).answers, {});

  const saved = await student(`/attempts/${attempt.id}/answers`, { expectedRevision: attempt.revision, answers: { q1: 1, qa1: null } }, 'PATCH');
  assert.equal(saved.status, 200, await saved.clone().text());
  const stale = await student(`/attempts/${attempt.id}/answers`, { expectedRevision: attempt.revision, answers: { q1: 0 } }, 'PATCH');
  assert.equal(stale.status, 409, await stale.clone().text());
  assert.equal((await stale.json()).error.code, 'REVISION_CONFLICT');
  assert.deepEqual((await store.read()).attempts.find(row => row.id === attempt.id).answers, { q1: 1, qa1: null });
});

test('submission stores one server receipt and grade, reveals resolution only after delivery, and locks answer edits', async t => {
  const { client, store } = await fixture(t);
  const student = await client('student-two');
  const teacher = await client('teacher-a');
  const outside = await client('student');
  const assessment = await createPublishedQuiz(teacher);
  const attempt = await (await post(student, '/attempts', { assessmentId: assessment.id })).json();
  assert.equal(attempt.questions[1].image.src, '/api/v1/files/file-question/content');
  assert.equal((await student('/files/file-question/content')).status, 200, 'attempt owner can fetch an authenticated prompt image');
  const before = await student(`/attempts/${attempt.id}`);
  assert.equal(before.status, 200, await before.clone().text());
  const prompt = await before.json();
  assert.equal('score' in prompt, false);
  assert.equal(prompt.questions.some(question => 'correct' in question || 'explanation' in question), false);

  const hiddenFromStaff = await teacher(`/attempts?assessmentId=${assessment.id}`);
  assert.equal(hiddenFromStaff.status, 200);
  assert.equal((await hiddenFromStaff.json()).items.some(row => row.id === attempt.id), false);
  assert.equal((await teacher(`/attempts/${attempt.id}`)).status, 404);
  assert.equal((await teacher('/attempts', { assessmentId: assessment.id })).status, 403);

  const saved = await student(`/attempts/${attempt.id}/answers`, { expectedRevision: attempt.revision, answers: { q1: 0, q2: null } }, 'PATCH');
  assert.equal(saved.status, 200, await saved.clone().text());
  const savedAttempt = await saved.json();
  const submitted = await post(student, `/attempts/${attempt.id}/submit`, { expectedRevision: savedAttempt.revision }, 'attempt-submit-student-two-001');
  assert.equal(submitted.status, 200, await submitted.clone().text());
  const result = await submitted.json();
  assertSchemaObject('AttemptResult', result);
  assertSchemaObject('AttemptStudent', result.attempt);
  for (const question of result.questions) assertSchemaObject('QuestionResolved', question);
  assert.equal(result.attempt.answers.q2, null);
  assert.equal(result.score, 1);
  assert.equal(result.maxScore, 2);
  assert.ok(result.receipt.id);
  assert.equal(result.questions[0].correct, 0);
  assert.ok(result.questions[0].explanation);

  const replay = await post(student, `/attempts/${attempt.id}/submit`, { expectedRevision: savedAttempt.revision }, 'attempt-submit-student-two-001');
  assert.equal(replay.status, 200, await replay.clone().text());
  assert.equal((await replay.json()).receipt.id, result.receipt.id);
  const edited = await student(`/attempts/${attempt.id}/answers`, { expectedRevision: result.attempt.revision, answers: {} }, 'PATCH');
  assert.equal(edited.status, 409);
  assert.equal((await student(`/attempts/${attempt.id}/result`)).status, 200);
  assert.equal((await outside(`/attempts/${attempt.id}/result`)).status, 404);
  const staffResult = await teacher(`/attempts/${attempt.id}/result`);
  assert.equal(staffResult.status, 200, await staffResult.clone().text());
  const staffAttemptResponse = await teacher(`/attempts/${attempt.id}`);
  assert.equal(staffAttemptResponse.status, 200, await staffAttemptResponse.clone().text());
  const staffAttempt = await staffAttemptResponse.json();
  assertSchemaObject('AttemptStaff', staffAttempt);
  for (const question of staffAttempt.questions) {
    assertSchemaObject('QuestionPrompt', question);
    assert.equal('correct' in question, false);
    assert.equal('explanation' in question, false);
  }
  const staffAttempts = await (await teacher(`/attempts?assessmentId=${assessment.id}`)).json();
  assert.ok(staffAttempts.items.some(row => row.id === attempt.id));
  assert.equal((await store.read()).attempts.filter(row => row.id === attempt.id && row.receiptId === result.receipt.id).length, 1);
  await store.transact(state => { state.questions.find(question => question.id === 'q2').deletedAt = '2031-06-15T12:01:00Z'; });
  assert.equal((await student('/questions/q2')).status, 404, 'retired bank questions stay hidden from the current bank');
  assert.equal((await student('/files/file-question/content')).status, 200, 'the authorized assessment snapshot retains its image after bank retirement');
  const unassigned = await client('student-empty');
  assert.equal((await unassigned('/files/file-question/content')).status, 404, 'image access does not expand beyond the assigned subject');
});

test('submit revalidates current enrollment before replaying a persisted receipt', async t => {
  const { client, store } = await fixture(t);
  const student = await client('student-two');
  const teacher = await client('teacher-a');
  const attempt = await (await post(student, '/attempts', { assessmentId: 'quiz-no-deadline' })).json();
  const key = 'attempt-replay-after-revocation';
  const result = await post(student, `/attempts/${attempt.id}/submit`, { expectedRevision: attempt.revision }, key);
  assert.equal(result.status, 200, await result.clone().text());
  await store.transact(state => {
    state.enrollments.find(row => row.id === 'e2').status = 'ended';
    state.enrollments.find(row => row.id === 'e2').endedAt = '2031-06-15T12:01:00Z';
    state.classes.find(row => row.id === 'c1').studentIds = ['student'];
  });
  const replay = await post(student, `/attempts/${attempt.id}/submit`, { expectedRevision: attempt.revision }, key);
  assert.equal(replay.status, 404, await replay.clone().text());
  assert.equal((await student(`/attempts/${attempt.id}/result`)).status, 404);
  assert.equal((await teacher(`/attempts/${attempt.id}/result`)).status, 200);
});

test('deadline is exclusive, late policy is enforced, late enrollment is not assigned, and no deadline remains open', async t => {
  const { client, setNow, store } = await fixture(t, '2031-06-22T23:59:58-03:00');
  const student = await client('student-two');
  const beforeDeadline = await post(student, '/attempts', { assessmentId: 'quiz-open' });
  assert.equal(beforeDeadline.status, 201, await beforeDeadline.clone().text());
  const attempt = await beforeDeadline.json();
  setNow('2031-06-22T23:59:59-03:00');
  const atExclusiveBoundary = await post(student, `/attempts/${attempt.id}/submit`, { expectedRevision: attempt.revision });
  assert.equal(atExclusiveBoundary.status, 409, await atExclusiveBoundary.clone().text());

  const teacher = await client('teacher-a');
  const lateAssessment = await createPublishedQuiz(teacher, { title: 'Quiz com atraso', deadline: '2031-06-23T00:00:00-03:00', allowLate: true, questionIds: ['q1'] });
  setNow('2031-06-22T23:59:59-03:00');
  const lateAttempt = await (await post(student, '/attempts', { assessmentId: lateAssessment.id })).json();
  setNow('2031-06-23T00:00:00-03:00');
  const lateSubmit = await post(student, `/attempts/${lateAttempt.id}/submit`, { expectedRevision: lateAttempt.revision });
  assert.equal(lateSubmit.status, 200, await lateSubmit.clone().text());

  await store.transact(state => { state.enrollments.find(row => row.id === 'e2').enrolledAt = '2031-06-23T00:00:01-03:00'; });
  assert.equal((await post(student, '/attempts', { assessmentId: 'quiz-open' })).status, 404);

  setNow('2031-06-23T00:01:00-03:00');
  assert.equal((await post(student, '/attempts', { assessmentId: 'quiz-no-deadline' })).status, 201);
});

test('changing question order resets only the unfinished attempt and publishes a new prompt snapshot', async t => {
  const { client, store } = await fixture(t);
  const student = await client('student-two');
  const teacher = await client('teacher-a');
  const started = await (await post(student, '/attempts', { assessmentId: 'quiz-no-deadline' })).json();
  const saved = await student(`/attempts/${started.id}/answers`, { expectedRevision: started.revision, answers: { q1: 1 } }, 'PATCH');
  assert.equal(saved.status, 200, await saved.clone().text());
  const savedAttempt = await saved.json();

  const edited = await teacher('/assessments/quiz-no-deadline', {
    expectedRevision: 1, questions: [{ source: 'bank', questionId: 'q2' }, { source: 'bank', questionId: 'q1' }], confirmResetDrafts: true
  }, 'PATCH');
  assert.equal(edited.status, 200, await edited.clone().text());
  const after = await student(`/attempts/${started.id}`);
  assert.equal(after.status, 200, await after.clone().text());
  const reset = await after.json();
  assert.deepEqual(reset.answers, {});
  assert.deepEqual(reset.questionOrder, ['q2', 'q1']);
  assert.equal(reset.questionsUpdatedAt, '2031-06-15T12:00:00Z');
  assert.equal(reset.revision, savedAttempt.revision + 1);
  assert.deepEqual((await store.read()).attempts.find(row => row.id === started.id).questions.map(question => question.id), ['q2', 'q1']);
});

test('parallel starts and answer saves serialize without duplicate attempts or silent overwrites', async t => {
  const { client, store } = await fixture(t);
  const [first, second] = await Promise.all([client('student-two'), client('student-two')]);
  const [left, right] = await Promise.all([
    post(first, '/attempts', { assessmentId: 'quiz-no-deadline' }),
    post(second, '/attempts', { assessmentId: 'quiz-no-deadline' })
  ]);
  assert.deepEqual([left.status, right.status], [201, 201]);
  const [a, b] = await Promise.all([left.json(), right.json()]);
  assert.equal(a.id, b.id);
  assert.equal((await store.read()).attempts.filter(row => row.assessmentId === 'quiz-no-deadline' && row.userId === 'student-two').length, 1);

  const [savedA, savedB] = await Promise.all([
    first(`/attempts/${a.id}/answers`, { expectedRevision: a.revision, answers: { q1: 1 } }, 'PATCH'),
    second(`/attempts/${a.id}/answers`, { expectedRevision: b.revision, answers: { qa1: 0 } }, 'PATCH')
  ]);
  assert.deepEqual([savedA.status, savedB.status].sort(), [200, 409]);
  const current = (await store.read()).attempts.find(row => row.id === a.id);
  assert.ok(JSON.stringify(current.answers) === JSON.stringify({ q1: 1 }) || JSON.stringify(current.answers) === JSON.stringify({ qa1: 0 }));
});

test('failed persistence does not report a successful submission and retry keeps one receipt', async t => {
  const { client, store, setFailWrites } = await fixture(t);
  const student = await client('student-two');
  const attempt = await (await post(student, '/attempts', { assessmentId: 'quiz-no-deadline' })).json();
  const before = await store.read();
  const key = 'attempt-submit-after-disk-recovery';
  setFailWrites(true);
  const failed = await post(student, `/attempts/${attempt.id}/submit`, { expectedRevision: attempt.revision }, key);
  assert.equal(failed.status, 500, await failed.clone().text());
  assert.deepEqual(await store.read(), before);

  setFailWrites(false);
  const retry = await post(student, `/attempts/${attempt.id}/submit`, { expectedRevision: attempt.revision }, key);
  assert.equal(retry.status, 200, await retry.clone().text());
  const result = await retry.json();
  assert.equal((await store.read()).attempts.filter(row => row.id === attempt.id && row.receiptId === result.receipt.id).length, 1);
});

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
import { fileBytes } from '../server/file-service.mjs';

const origin = 'http://127.0.0.1:3000';

async function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aja-assessments-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { filename } = openRepository(directory, { baseDate: '2031-06-15' });
  let fail = false;
  const store = createTransactionStore({ filename, persist: (file, state) => { if (fail) throw new Error('disk full'); atomicPersist(file, state); } });
  const server = createApp({ origins: [origin], frontendOrigin: origin, store, now: () => '2031-06-15T12:00:00Z' }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  async function client(id) {
    let cookie = '';
    const request = async (route, body, method = body ? 'POST' : 'GET', key) => {
      const response = await fetch(base + route, {
        method,
        headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return response;
    };
    assert.equal((await request('/auth/login', { email: `${id}@aja.local.test`, password: `AjaLocal-${id}-2031!` })).status, 200);
    return request;
  }
  return { store, client, setFail: value => { fail = value; } };
}

const authored = (clientKey, questionId = null) => ({
  source: 'authored', clientKey, questionId,
  question: { subject: 'Matemática', topic: 'Autoral', difficulty: 'easy', institution: 'AJA', year: 2031, statement: 'Uma questão restrita à atividade.', options: ['A', 'B'], image: null, correct: 1, explanation: 'A segunda alternativa é correta.' }
});
const fields = (questions = [{ source: 'bank', questionId: 'q1' }, authored('new-question')]) => ({
  moduleId: 'm1', title: 'Avaliação HTTP', description: 'Instruções do professor.', kind: 'quiz', maxGrade: null,
  deadline: null, required: true, allowLate: false, questions
});
const post = (client, route, body, key = randomUUID()) => client(route, body, 'POST', key);

test('activity draft captures ordered bank and private author snapshots and publishes only student-safe projections', async t => {
  const { client, store } = await fixture(t);
  const teacher = await client('teacher-a'), student = await client('student');
  const create = await post(teacher, '/assessments', fields(), 'assessment-create-001');
  assert.equal(create.status, 201, await create.clone().text());
  const draft = await create.json();
  assert.equal(draft.status, 'draft');
  assert.deepEqual(draft.questions.map(question => question.statement), ['Qual é a razão entre 4 e 2?', 'Uma questão restrita à atividade.']);
  assert.equal(draft.questions[0].correct, 0);
  assert.equal(draft.questions[1].correct, 1);
  assert.equal(draft.questions[1].origin, 'author');
  assert.equal(draft.questionIds.length, 2);
  assert.deepEqual((await (await teacher('/assessments?subjectId=s1')).json()).items.map(item => item.id).includes(draft.id), true);
  const studentList = await (await student('/assessments?subjectId=s1')).json();
  assert.equal(studentList.items.some(item => item.id === draft.id), false);
  assert.equal((await student(`/assessments/${draft.id}`)).status, 404);

  const bankQuestion = (await store.read()).questions.find(question => question.id === 'q1');
  await store.transact(state => { state.questions.find(question => question.id === 'q1').statement = 'O acervo foi alterado depois da cópia.'; });
  const publish = await post(teacher, `/assessments/${draft.id}/publish`, { expectedRevision: draft.revision });
  assert.equal(publish.status, 200, await publish.clone().text());
  const published = await publish.json();
  assert.equal(published.questions[0].statement, bankQuestion.statement);
  assert.equal((await store.read()).questions.find(question => question.id === 'q1').statement, 'O acervo foi alterado depois da cópia.');
  const visible = await (await student('/assessments?subjectId=s1&status=published')).json();
  const studentActivity = visible.items.find(item => item.id === draft.id);
  assert.ok(studentActivity);
  assert.equal(studentActivity.questionCount, 2);
  assert.equal('questions' in studentActivity, false);
  assert.equal('questionIds' in studentActivity, false);
  assert.equal(JSON.stringify(studentActivity).includes('"correct"'), false);
  const studentDetail = await (await student(`/assessments/${draft.id}`)).json();
  assert.equal(studentDetail.status, 'published');
  assert.equal('questions' in studentDetail, false);
  assert.equal('questionIds' in studentDetail, false);
  assert.equal((await student('/questions/qa1')).status, 404);
});

test('assessment edits preserve current bank snapshots, capture newly included items and reject cross-activity author IDs', async t => {
  const { client, store } = await fixture(t);
  const teacher = await client('teacher-a');
  const first = await (await post(teacher, '/assessments', fields(), 'assessment-create-002')).json();
  const second = await (await post(teacher, '/assessments', { ...fields([]), kind: 'work' }, 'assessment-create-003')).json();
  await store.transact(state => { state.questions.find(question => question.id === 'q1').statement = 'Versão nova do acervo.'; });
  const original = await teacher(`/assessments/${first.id}`);
  assert.equal(original.status, 200, await original.clone().text());
  assert.equal((await original.json()).questions[0].statement, 'Qual é a razão entre 4 e 2?');
  const foreignAuthor = authored('reuse', first.questionIds[1]);
  const invalid = await teacher(`/assessments/${second.id}`, { ...fields([foreignAuthor]), expectedRevision: second.revision }, 'PATCH');
  assert.equal(invalid.status, 422);
});

test('assessment commands validate composition and protect simultaneous teacher edits and revoked assignment', async t => {
  const { client, store } = await fixture(t);
  const teacherA = await client('teacher-a'), teacherB = await client('teacher-b'), unassigned = await client('teacher-unassigned');
  const duplicate = await post(teacherA, '/assessments', fields([{ source: 'bank', questionId: 'q1' }, { source: 'bank', questionId: 'q1' }]), 'assessment-create-004');
  assert.equal(duplicate.status, 422);
  const badAnswer = authored('invalid'); badAnswer.question.correct = 9;
  assert.equal((await post(teacherA, '/assessments', fields([badAnswer]), 'assessment-create-005')).status, 422);
  assert.equal((await teacherA('/assessments?subjectId=s1&status=unexpected')).status, 422);
  assert.equal((await unassigned('/assessments?subjectId=s1')).status, 404);

  const draft = await (await post(teacherA, '/assessments', fields(), 'assessment-create-006')).json();
  const currentA = await (await teacherA(`/assessments/${draft.id}`)).json();
  const currentB = await (await teacherB(`/assessments/${draft.id}`)).json();
  const [saved, stale] = await Promise.all([
    teacherA(`/assessments/${draft.id}`, { expectedRevision: currentA.revision, title: 'Alterada por A' }, 'PATCH'),
    teacherB(`/assessments/${draft.id}`, { expectedRevision: currentB.revision, title: 'Alterada por B' }, 'PATCH')
  ]);
  assert.deepEqual([saved.status, stale.status].sort(), [200, 409]);
  const winner = saved.status === 200 ? 'Alterada por A' : 'Alterada por B';
  assert.equal((await (await teacherA(`/assessments/${draft.id}`)).json()).title, winner);

  await store.transact(state => { state.subjects.find(subject => subject.id === 's1').teacherIds = ['teacher-a']; });
  assert.equal((await teacherB(`/assessments/${draft.id}`, { expectedRevision: currentB.revision, title: 'Acesso revogado' }, 'PATCH')).status, 403);
});

test('first submitted delivery locks structural fields but permits existing deadline edits and preserves failed writes', async t => {
  const { client, store, setFail } = await fixture(t);
  const teacher = await client('teacher-a');
  const draft = await (await post(teacher, '/assessments', { ...fields([]), kind: 'work', deadline: '2031-06-25T20:00:00-03:00' }, 'assessment-create-007')).json();
  assert.equal(draft.deadline, '2031-06-25T23:00:00.000Z');
  await store.transact(state => { state.attempts.push({ id: 'attempt-assessment-lock', assessmentId: draft.id, userId: 'student', startedAt: '2031-06-15T12:00:00Z', answers: {}, questionOrder: [], submittedAt: '2031-06-15T12:30:00Z' }); });
  const allowed = await teacher(`/assessments/${draft.id}`, { expectedRevision: draft.revision, title: 'Apenas campos permitidos', deadline: '2031-06-26T20:00:00-03:00' }, 'PATCH');
  assert.equal(allowed.status, 200);
  const edited = await allowed.json();
  const hiddenTimeChange = await teacher(`/assessments/${draft.id}`, { expectedRevision: edited.revision, deadline: '2031-06-26T20:00:59.999-03:00' }, 'PATCH');
  assert.equal(hiddenTimeChange.status, 409, await hiddenTimeChange.clone().text());
  const removeDeadline = await teacher(`/assessments/${draft.id}`, { expectedRevision: edited.revision, deadline: null }, 'PATCH');
  assert.equal(removeDeadline.status, 409, await removeDeadline.clone().text());
  assert.equal((await teacher(`/assessments/${draft.id}`, { expectedRevision: edited.revision, required: false }, 'PATCH')).status, 409);
  const before = await store.read();
  setFail(true);
  const failed = await teacher(`/assessments/${draft.id}`, { expectedRevision: edited.revision, title: 'Não persistiu' }, 'PATCH');
  assert.equal(failed.status, 500);
  setFail(false);
  assert.deepEqual(await store.read(), before);
});

test('first delivery allows metadata and deadline date with the full unchanged seeded composition', async t => {
  const { client, store } = await fixture(t);
  const teacher = await client('teacher-a');
  const opened = await (await teacher('/assessments/quiz-open')).json();
  assert.equal(opened.hasSubmissions, false);
  const attemptBefore = (await store.read()).attempts.find(row => row.assessmentId === opened.id && row.userId === 'student');
  await store.transact(state => {
    const attempt = state.attempts.find(row => row.assessmentId === opened.id && row.userId === 'student');
    attempt.submittedAt = '2031-06-15T12:30:00Z';
    attempt.receipt = 'first-delivery-before-metadata-edit';
  });
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(opened.deadline)).map(part => [part.type, part.value]));
  const nextDate = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + 1));
  const date = `${nextDate.getUTCFullYear()}-${String(nextDate.getUTCMonth() + 1).padStart(2, '0')}-${String(nextDate.getUTCDate()).padStart(2, '0')}`;
  const milliseconds = String(new Date(opened.deadline).getUTCMilliseconds()).padStart(3, '0');
  const deadline = `${date}T${parts.hour}:${parts.minute}:${parts.second}.${milliseconds}-03:00`;
  const questions = opened.questions.map(question => question.origin === 'author'
    ? { source: 'authored', clientKey: question.id, questionId: question.id, question: Object.fromEntries(Object.entries(question).filter(([key]) => !['id', 'origin'].includes(key))) }
    : { source: 'bank', questionId: question.id });
  const saved = await teacher(`/assessments/${opened.id}`, {
    expectedRevision: opened.revision, moduleId: opened.moduleId, title: 'Título atualizado após a entrega',
    description: 'Orientações atualizadas após a entrega.', kind: opened.kind, maxGrade: opened.maxGrade,
    deadline, required: opened.required, allowLate: opened.allowLate, questions
  }, 'PATCH');
  assert.equal(saved.status, 200, await saved.clone().text());
  const current = await saved.json();
  assert.equal(current.title, 'Título atualizado após a entrega');
  assert.equal(current.description, 'Orientações atualizadas após a entrega.');
  assert.equal(current.deadline, new Date(deadline).toISOString());
  assert.deepEqual(current.questionIds, opened.questionIds);
  assert.deepEqual(current.questions, opened.questions);
  const attemptAfter = (await store.read()).attempts.find(row => row.id === attemptBefore.id);
  assert.deepEqual(attemptAfter.answers, attemptBefore.answers);
  assert.deepEqual(attemptAfter.questionOrder, attemptBefore.questionOrder);
  assert.equal(attemptAfter.receipt, 'first-delivery-before-metadata-edit');
  const changedTime = `${date}T${String((Number(parts.hour) + 1) % 24).padStart(2, '0')}:${parts.minute}:00-03:00`;
  const timeChange = await teacher(`/assessments/${opened.id}`, { expectedRevision: current.revision, deadline: changedTime }, 'PATCH');
  assert.equal(timeChange.status, 409, await timeChange.clone().text());
});

﻿test('assessment composition preserves captured snapshots and resets only unfinished attempts after confirmation', async t => {
  const { client, store } = await fixture(t);
  const teacher = await client('teacher-a');
  const created = await (await post(teacher, '/assessments', fields(), 'assessment-snapshot-update')).json();
  const capturedBank = created.questions[0];
  const authoredQuestion = created.questions.find(question => question.origin === 'author');
  await store.transact(state => {
    state.questions.find(question => question.id === 'q1').statement = 'Question q1 changed after capture.';
    state.questions.find(question => question.id === 'q2').statement = 'Question q2 at selection time.';
    state.attempts.push({ id: 'draft-to-reset', assessmentId: created.id, userId: 'student', revision: 4, updatedAt: '2031-06-15T11:00:00Z', updatedBy: 'student', answers: { q1: 1 }, questionOrder: ['q1'], questions: [capturedBank] });
  });
  const composition = [
    { source: 'authored', clientKey: authoredQuestion.id, questionId: authoredQuestion.id, question: Object.fromEntries(Object.entries(authoredQuestion).filter(([key]) => !['id', 'origin'].includes(key))) },
    { source: 'bank', questionId: 'q2' },
    { source: 'bank', questionId: 'q1' }
  ];
  const unconfirmed = await teacher(`/assessments/${created.id}`, { expectedRevision: created.revision, questions: composition }, 'PATCH');
  assert.equal(unconfirmed.status, 409);
  assert.deepEqual((await store.read()).attempts.find(row => row.id === 'draft-to-reset').answers, { q1: 1 });
  const edited = await teacher(`/assessments/${created.id}`, { expectedRevision: created.revision, questions: composition, confirmResetDrafts: true }, 'PATCH');
  assert.equal(edited.status, 200, await edited.clone().text());
  const assessment = await edited.json();
  assert.deepEqual(assessment.questionIds, [authoredQuestion.id, 'q2', 'q1']);
  assert.equal(assessment.questions[0].statement, authoredQuestion.statement);
  assert.equal(assessment.questions[1].statement, 'Question q2 at selection time.');
  assert.equal(assessment.questions[2].statement, capturedBank.statement);
  let attempt = (await store.read()).attempts.find(row => row.id === 'draft-to-reset');
  assert.deepEqual(attempt.answers, {});
  assert.deepEqual(attempt.questionOrder, [authoredQuestion.id, 'q2', 'q1']);
  assert.deepEqual(attempt.questions.map(question => question.id), assessment.questionIds);
  assert.equal(attempt.revision, 5);
  assert.equal(attempt.updatedAt, '2031-06-15T12:00:00Z');
  assert.equal(attempt.updatedBy, 'teacher-a');
  assert.equal(attempt.questionsUpdatedAt, '2031-06-15T12:00:00Z');
  const published = await post(teacher, `/assessments/${created.id}/publish`, { expectedRevision: assessment.revision }, 'assessment-snapshot-publish');
  assert.equal(published.status, 200);
  const current = await published.json();
  await store.transact(state => {
    state.questions.find(question => question.id === 'q1').statement = 'Question q1 changed after publication.';
    state.attempts.push({ id: 'delivered-to-preserve', assessmentId: created.id, userId: 'student-two', submittedAt: '2031-06-15T12:00:00-03:00', answers: { q1: 2 }, questionOrder: [...current.questionIds], questions: current.questions });
  });
  const structural = await teacher(`/assessments/${created.id}`, { expectedRevision: current.revision, questions: [{ source: 'bank', questionId: 'q1' }] }, 'PATCH');
  assert.equal(structural.status, 409);
  const titleOnly = await teacher(`/assessments/${created.id}`, { expectedRevision: current.revision, title: 'Published title edit' }, 'PATCH');
  assert.equal(titleOnly.status, 200);
  assert.equal((await titleOnly.json()).questions[2].statement, capturedBank.statement);
  attempt = (await store.read()).attempts.find(row => row.id === 'delivered-to-preserve');
  assert.deepEqual(attempt.answers, { q1: 2 });
  assert.deepEqual(attempt.questionOrder, current.questionIds);
});

test('assessment idempotency replay is rejected after the creating teacher loses assignment', async t => {
  const { client, store } = await fixture(t);
  const teacher = await client('teacher-b');
  const key = 'assessment-revoked-replay';
  const created = await post(teacher, '/assessments', fields(), key);
  assert.equal(created.status, 201);
  const createdId = (await created.json()).id;
  await store.transact(state => { state.subjects.find(subject => subject.id === 's1').teacherIds = ['teacher-a']; });
  const replay = await post(teacher, '/assessments', fields(), key);
  assert.equal(replay.status, 403, await replay.clone().text());
  assert.equal((await store.read()).assessments.filter(row => row.id === createdId).length, 1);
});

test('assessment image snapshots remain readable after bank retirement only in an authorized visible activity', async t => {
  const { client, store } = await fixture(t);
  const teacher = await client('teacher-a');
  const student = await client('student');
  const outside = await client('student-empty');
  const unassignedTeacher = await client('teacher-unassigned');
  const created = await (await post(teacher, '/assessments', fields([{ source: 'bank', questionId: 'q2' }]), 'assessment-image-snapshot')).json();
  const file = (await store.read()).files.find(row => row.id === 'file-question');
  const sourceBytes = fileBytes(file);
  assert.equal((await teacher('/questions/q2')).status, 200);
  assert.equal((await student('/files/file-question/content?disposition=inline')).status, 200);
  await store.transact(state => { state.questions.find(question => question.id === 'q2').deletedAt = '2031-06-15T12:00:00Z'; });
  assert.equal((await teacher('/questions/q2')).status, 404);
  assert.equal((await student('/files/file-question/content?disposition=inline')).status, 404);
  const draftOnly = await student('/files/file-question');
  assert.equal(draftOnly.status, 404);
  const published = await post(teacher, `/assessments/${created.id}/publish`, { expectedRevision: created.revision }, 'assessment-image-publish');
  assert.equal(published.status, 200);
  const teacherImage = await teacher('/files/file-question/content?disposition=inline');
  const studentImage = await student('/files/file-question/content?disposition=inline');
  assert.equal(teacherImage.status, 200, await teacherImage.clone().text());
  assert.equal(studentImage.status, 200, await studentImage.clone().text());
  assert.deepEqual(Buffer.from(await studentImage.arrayBuffer()), sourceBytes);
  assert.equal((await teacher('/files/file-question')).status, 200);
  assert.equal((await outside('/files/file-question/content?disposition=inline')).status, 404);
  assert.equal((await unassignedTeacher('/files/file-question/content?disposition=inline')).status, 404);
  const safeStudent = await (await student(`/assessments/${created.id}`)).json();
  assert.equal('questions' in safeStudent, false);
  assert.equal('correct' in safeStudent, false);
});

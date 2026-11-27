import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.mjs';
import { openRepository } from '../server/repository.mjs';
import { atomicPersist, createTransactionStore } from '../server/transaction-store.mjs';

const origin = 'http://127.0.0.1:3000';
const openapi = JSON.parse(fs.readFileSync(new URL('../docs/http/openapi.json', import.meta.url), 'utf8'));
const schemaFields = name => Object.keys(openapi.components.schemas[name].properties).sort();

async function fixture(t, initialNow = '2031-06-15T12:00:00Z') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aja-submissions-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { filename } = openRepository(directory, { baseDate: '2031-06-15' });
  let now = initialNow, failWrites = false;
  const store = createTransactionStore({ filename, persist: (file, state) => {
    if (failWrites) throw new Error('disk full');
    atomicPersist(file, state);
  } });
  const server = createApp({ origins: [origin], frontendOrigin: origin, store, now: () => now }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  async function client(id) {
    let cookie = '';
    const request = async (route, body, method = body ? 'POST' : 'GET', headers = {}) => {
      const multipart = body instanceof FormData;
      const response = await fetch(base + route, {
        method,
        headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body && !multipart ? { 'Content-Type': 'application/json' } : {}), ...headers },
        ...(body ? { body: multipart ? body : JSON.stringify(body) } : {})
      });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return response;
    };
    assert.equal((await request('/auth/login', { email: `${id}@aja.local.test`, password: `AjaLocal-${id}-2031!` })).status, 200);
    return request;
  }
  return { base, store, client, setNow: value => { now = value; }, setFailWrites: value => { failWrites = value; } };
}

const post = (client, route, body, key = randomUUID()) => client(route, body, 'POST', { 'Idempotency-Key': key });
const link = (name = 'Trabalho', url = 'https://example.test/trabalho') => ({ kind: 'link', name, url });

async function createPublishedWork(teacher, { title = 'Trabalho HTTP', deadline = null, allowLate = false, maxGrade = 10 } = {}) {
  const createdResponse = await post(teacher, '/assessments', {
    moduleId: 'm1', title, description: 'Envie uma análise.', kind: 'work', maxGrade,
    deadline, required: true, allowLate, questions: []
  });
  assert.equal(createdResponse.status, 201, await createdResponse.clone().text());
  const draft = await createdResponse.json();
  const publishedResponse = await post(teacher, `/assessments/${draft.id}/publish`, { expectedRevision: draft.revision });
  assert.equal(publishedResponse.status, 200, await publishedResponse.clone().text());
  return publishedResponse.json();
}

test('submission reads require a session and return a student-safe page', async t => {
  const { base, client } = await fixture(t);
  const anonymous = await fetch(`${base}/submissions`);
  assert.equal(anonymous.status, 401, await anonymous.clone().text());
  const student = await client('student');
  const own = await student('/submissions?assessmentId=work1');
  assert.equal(own.status, 200, await own.clone().text());
  const page = await own.json();
  assert.ok(page.items.some(item => item.id === 'submission-waiting'));
  const submission = page.items.find(item => item.id === 'submission-waiting');
  assert.equal(submission.receipt.resourceId, submission.id);
  assert.equal(submission.feedbackPublished, null);
  assert.equal('feedbackDraft' in submission, false);
  assert.equal('feedbackHistory' in submission, false);
  assert.deepEqual(Object.keys(submission).sort(), schemaFields('SubmissionStudent'));
  assert.ok(page.items.every(item => item.userId === 'student'));
  const teacher = await client('teacher-a');
  const staffPage = await (await teacher('/submissions?assessmentId=work1')).json();
  assert.ok(staffPage.items.every(item => item.submittedAt), 'staff lists contain completed deliveries only');
  const staffSubmission = staffPage.items.find(item => item.id === 'submission-waiting');
  assert.ok(staffSubmission);
  assert.equal(typeof staffSubmission.studentName, 'string');
  assert.deepEqual(Object.keys(staffSubmission).sort(), schemaFields('SubmissionStaff'));
});

test('work draft saves one student submission, receipt survives replay and submitted attachments cannot change', async t => {
  const { client, store } = await fixture(t);
  const teacher = await client('teacher-a'), student = await client('student');
  const assessment = await createPublishedWork(teacher);
  const credentialLink = await post(student, '/submissions', { assessmentId: assessment.id, attachments: [link('Credenciais', 'https://aluno:senha@example.test/privado')] }, 'work-prepare-invalid-url-01');
  assert.equal(credentialLink.status, 422);
  const tooMany = await post(student, '/submissions', { assessmentId: assessment.id, attachments: Array.from({ length: 6 }, (_, index) => link(`Link ${index}`, `https://example.test/${index}`)) }, 'work-prepare-too-many-001');
  assert.equal(tooMany.status, 422);
  assert.equal((await store.read()).submissions.filter(row => row.assessmentId === assessment.id && row.userId === 'student').length, 0, 'invalid batches must not create an empty submission');
  const created = await post(student, '/submissions', { assessmentId: assessment.id, attachments: [] }, 'work-prepare-0001');
  assert.equal(created.status, 201, await created.clone().text());
  const draft = await created.json();
  assert.equal(draft.submittedAt, null);
  const emptySend = await post(student, `/submissions/${draft.id}/submit`, { expectedRevision: draft.revision }, 'work-submit-empty-0001');
  assert.equal(emptySend.status, 422);
  assert.equal((await store.read()).submissions.find(row => row.id === draft.id).submittedAt, undefined);
  const savedResponse = await student(`/submissions/${draft.id}`, { expectedRevision: draft.revision, attachments: [link('Revisão', 'https://example.test/revisao')] }, 'PATCH');
  assert.equal(savedResponse.status, 200, await savedResponse.clone().text());
  const saved = await savedResponse.json();
  assert.equal(saved.attachments[0].url, 'https://example.test/revisao');
  const command = { expectedRevision: saved.revision };
  const [sent, duplicate] = await Promise.all([
    post(student, `/submissions/${draft.id}/submit`, command, 'work-submit-0001'),
    post(student, `/submissions/${draft.id}/submit`, command, 'work-submit-0001')
  ]);
  assert.deepEqual([sent.status, duplicate.status], [200, 200]);
  const receipt = await sent.json();
  assert.deepEqual(await duplicate.json(), receipt);
  assert.equal(receipt.receipt.resourceId, draft.id);
  assert.equal(receipt.receipt.submittedAt, receipt.submittedAt);
  assert.equal((await store.read()).submissions.filter(row => row.assessmentId === assessment.id && row.userId === 'student').length, 1);
  const afterReload = await (await student(`/submissions/${draft.id}`)).json();
  assert.deepEqual(afterReload.receipt, receipt.receipt);
  assert.equal((await student(`/submissions/${draft.id}`, { expectedRevision: receipt.revision, attachments: [] }, 'PATCH')).status, 409);
});

test('feedback draft is private; publication and republication retain server authorship and history with zero grades', async t => {
  const { client } = await fixture(t);
  const teacher = await client('teacher-a'), otherTeacher = await client('teacher-b'), student = await client('student');
  const currentResponse = await teacher('/submissions/submission-waiting');
  assert.equal(currentResponse.status, 200, await currentResponse.clone().text());
  const current = await currentResponse.json();
  const draftResponse = await teacher('/submissions/submission-waiting/feedback', { expectedRevision: current.revision, comment: 'Revisão docente', grade: 0 }, 'PATCH');
  const staleResponse = await otherTeacher('/submissions/submission-waiting/feedback', { expectedRevision: current.revision, comment: 'Outra revisão', grade: 9 }, 'PATCH');
  assert.deepEqual([draftResponse.status, staleResponse.status], [200, 409]);
  const draft = await draftResponse.json();
  assert.equal(draft.feedbackDraft.grade, 0);
  assert.equal((await (await student('/submissions/submission-waiting')).json()).feedbackPublished, null);
  const publishedResponse = await post(teacher, '/submissions/submission-waiting/publish-feedback', { expectedRevision: draft.revision }, 'feedback-publish-0001');
  assert.equal(publishedResponse.status, 200, await publishedResponse.clone().text());
  const published = await publishedResponse.json();
  assert.equal(published.feedbackDraft, null);
  assert.equal(published.feedbackPublished.author.id, 'teacher-a');
  assert.equal(published.feedbackPublished.createdAt, '2031-06-15T12:00:00Z');
  const studentView = await (await student('/submissions/submission-waiting')).json();
  assert.equal(studentView.feedbackPublished.grade, 0);
  assert.equal('feedbackDraft' in studentView, false);
  assert.equal('feedbackHistory' in studentView, false);
  const nextDraft = await teacher('/submissions/submission-waiting/feedback', { expectedRevision: published.revision, comment: 'Retorno atualizado', grade: 8 }, 'PATCH');
  assert.equal(nextDraft.status, 200);
  assert.equal((await (await student('/submissions/submission-waiting')).json()).feedbackPublished.comment, 'Revisão docente');
  const republished = await post(teacher, '/submissions/submission-waiting/publish-feedback', { expectedRevision: (await nextDraft.json()).revision }, 'feedback-publish-0002');
  assert.equal(republished.status, 200, await republished.clone().text());
  const history = (await republished.json()).feedbackHistory;
  assert.equal(history.length, 2);
  assert.deepEqual(history.map(entry => entry.author.id), ['teacher-a', 'teacher-a']);
});

test('feedback keeps legacy no-grade behavior when maxGrade is null and refuses an empty publication', async t => {
  const { client } = await fixture(t);
  const teacher = await client('teacher-a'), student = await client('student');
  const assessment = await createPublishedWork(teacher, { title: 'Trabalho sem escala', maxGrade: null });
  const prepared = await post(student, '/submissions', { assessmentId: assessment.id, attachments: [link()] }, 'work-null-grade-0001');
  assert.equal(prepared.status, 201, await prepared.clone().text());
  const draft = await prepared.json();
  const submitted = await post(student, `/submissions/${draft.id}/submit`, { expectedRevision: draft.revision }, 'work-null-grade-submit-0001');
  assert.equal(submitted.status, 200, await submitted.clone().text());
  const teacherView = await (await teacher(`/submissions/${draft.id}`)).json();
  const zero = await teacher(`/submissions/${draft.id}/feedback`, { expectedRevision: teacherView.revision, comment: '', grade: 0 }, 'PATCH');
  assert.equal(zero.status, 422);
  const commentOnly = await teacher(`/submissions/${draft.id}/feedback`, { expectedRevision: teacherView.revision, comment: '', grade: null }, 'PATCH');
  assert.equal(commentOnly.status, 200, await commentOnly.clone().text());
  const saved = await commentOnly.json();
  const empty = await post(teacher, `/submissions/${draft.id}/publish-feedback`, { expectedRevision: saved.revision }, 'work-null-grade-empty-0001');
  assert.equal(empty.status, 422);
  const current = await (await teacher(`/submissions/${draft.id}`)).json();
  const invalid = await teacher(`/submissions/${draft.id}/feedback`, { expectedRevision: current.revision, comment: 'Nota fora do limite legado', grade: 1 }, 'PATCH');
  assert.equal(invalid.status, 422);
});

test('work upload attaches atomically, rejects foreign files, preserves zero-byte files and authorizes bytes by submission', async t => {
  const { client, store } = await fixture(t);
  const teacher = await client('teacher-a');
  const student = await client('student'), other = await client('student-two');
  const assessment = await createPublishedWork(teacher, { title: 'Trabalho com arquivos' });
  const otherAssessment = await createPublishedWork(teacher, { title: 'Outro contexto de trabalho' });
  const createDraft = await post(student, '/submissions', { assessmentId: assessment.id, attachments: [] }, 'work-file-draft-0001');
  assert.equal(createDraft.status, 201, await createDraft.clone().text());
  const draft = await createDraft.json();
  const sameMetadataUpload = async bytes => {
    const form = new FormData(); form.set('purpose', 'work'); form.set('parentId', assessment.id);
    form.set('file', new Blob([bytes], { type: 'application/octet-stream' }), 'same.bin');
    return student('/files', form, 'POST', { 'Idempotency-Key': 'work-upload-byte-fingerprint-01' });
  };
  assert.equal((await sameMetadataUpload(new Uint8Array([65]))).status, 201);
  assert.equal((await sameMetadataUpload(new Uint8Array([66]))).status, 409, 'reusing the upload intent with different bytes must conflict');
  const upload = async (account, key, name, parentId = assessment.id) => {
    const form = new FormData();
    form.set('purpose', 'work'); form.set('parentId', parentId);
    form.set('file', new Blob([], { type: 'application/octet-stream' }), name);
    return account('/files', form, 'POST', { 'Idempotency-Key': key });
  };
  const ownFileResponse = await upload(student, 'work-upload-student-0001', 'vazio.bin');
  assert.equal(ownFileResponse.status, 201, await ownFileResponse.clone().text());
  const ownFile = await ownFileResponse.json();
  const foreignFileResponse = await upload(other, 'work-upload-other-0001', 'alheio.bin');
  assert.equal(foreignFileResponse.status, 201);
  const foreignFile = await foreignFileResponse.json();
  const otherContextResponse = await upload(student, 'work-upload-context-0001', 'outro-contexto.bin', otherAssessment.id);
  const otherContextFile = await otherContextResponse.json();
  assert.equal(otherContextFile.parentId, otherAssessment.id);
  const wrongContext = await student(`/submissions/${draft.id}`, { expectedRevision: draft.revision, attachments: [{ kind: 'file', fileId: otherContextFile.id, name: otherContextFile.name }] }, 'PATCH');
  assert.equal(wrongContext.status, 404);
  assert.equal((await store.read()).files.find(file => file.id === otherContextFile.id).status, 'staged');
  const mixed = await student(`/submissions/${draft.id}`, { expectedRevision: draft.revision, attachments: [{ kind: 'file', fileId: ownFile.id, name: ownFile.name }, { kind: 'file', fileId: foreignFile.id, name: foreignFile.name }] }, 'PATCH');
  assert.equal(mixed.status, 404);
  assert.equal((await store.read()).files.find(file => file.id === ownFile.id).status, 'staged');
  const saved = await student(`/submissions/${draft.id}`, { expectedRevision: draft.revision, attachments: [{ kind: 'file', fileId: ownFile.id, name: ownFile.name }] }, 'PATCH');
  assert.equal(saved.status, 200, await saved.clone().text());
  const submission = await saved.json();
  const sent = await post(student, `/submissions/${draft.id}/submit`, { expectedRevision: submission.revision }, 'work-file-submit-0001');
  assert.equal(sent.status, 200, await sent.clone().text());
  const attached = (await store.read()).files.find(file => file.id === ownFile.id);
  assert.equal(attached.status, 'attached');
  assert.equal((await student(`/files/${ownFile.id}/content`)).status, 200);
  await store.transact(state => { state.classes.find(row => row.id === 'c1').active = false; });
  assert.equal((await teacher(`/files/${ownFile.id}/content`)).status, 200, 'assigned staff retain historical downloads in a closed class');
  await store.transact(state => { state.classes.find(row => row.id === 'c1').active = true; });
  assert.equal((await other(`/files/${ownFile.id}/content`)).status, 404);
  assert.equal((await student(`/files/${foreignFile.id}/content`)).status, 404);
  await store.transact(state => {
    state.enrollments.find(row => row.studentId === 'student' && row.classId === 'c1').status = 'ended';
    state.enrollments.find(row => row.studentId === 'student' && row.classId === 'c1').endedAt = '2031-06-15T12:00:00Z';
    state.classes.find(row => row.id === 'c1').studentIds = ['student-two'];
  });
  assert.equal((await student(`/files/${ownFile.id}/content`)).status, 404, 'revocation also removes download access');
});

test('submit revalidates exclusive deadline and current assignment; replay loses access after revocation', async t => {
  const { client, store, setNow } = await fixture(t, '2031-06-15T11:59:00Z');
  const teacher = await client('teacher-a'), student = await client('student');
  const assessment = await createPublishedWork(teacher, { title: 'Prazo de trabalho', deadline: '2031-06-15T09:00:00-03:00' });
  const created = await post(student, '/submissions', { assessmentId: assessment.id, attachments: [link()] }, 'deadline-prepare-0001');
  assert.equal(created.status, 201, await created.clone().text());
  const draft = await created.json();
  setNow('2031-06-15T12:00:00Z');
  const late = await post(student, `/submissions/${draft.id}/submit`, { expectedRevision: draft.revision }, 'deadline-submit-0001');
  assert.equal(late.status, 409);
  assert.equal((await store.read()).submissions.find(row => row.id === draft.id).submittedAt, undefined);
  const unexpired = await createPublishedWork(teacher, { title: 'Envio revogado depois do commit' });
  const committedDraftResponse = await post(student, '/submissions', { assessmentId: unexpired.id, attachments: [link()] }, 'revoked-replay-prepare-0001');
  assert.equal(committedDraftResponse.status, 201, await committedDraftResponse.clone().text());
  const committedDraft = await committedDraftResponse.json();
  const replayKey = 'revoked-replay-submit-0001';
  const committed = await post(student, `/submissions/${committedDraft.id}/submit`, { expectedRevision: committedDraft.revision }, replayKey);
  assert.equal(committed.status, 200, await committed.clone().text());
  await store.transact(state => {
    state.enrollments.find(row => row.studentId === 'student' && row.classId === 'c1').status = 'ended';
    state.enrollments.find(row => row.studentId === 'student' && row.classId === 'c1').endedAt = '2031-06-15T12:00:00Z';
    state.classes.find(row => row.id === 'c1').studentIds = ['student-two'];
  });
  assert.equal((await student(`/submissions/${draft.id}`)).status, 404);
  assert.equal((await student(`/submissions/${committedDraft.id}`)).status, 404);
  assert.equal((await post(student, `/submissions/${committedDraft.id}/submit`, { expectedRevision: committedDraft.revision }, replayKey)).status, 404, 'replay reauthorizes after enrollment revocation');
});

test('closed classes preserve staff history reads, concurrent feedback conflicts and persistence failures remain retryable', async t => {
  const { client, store, setFailWrites } = await fixture(t);
  const teacher = await client('teacher-a'), second = await client('teacher-b');
  await store.transact(state => { state.classes.find(row => row.id === 'c1').active = false; });
  const historical = await teacher('/submissions/submission-waiting');
  assert.equal(historical.status, 200, await historical.clone().text());
  const stale = await historical.json();
  assert.equal((await teacher('/submissions/submission-waiting/feedback', { expectedRevision: stale.revision, comment: 'Sem escrita', grade: null }, 'PATCH')).status, 403);
  await store.transact(state => { state.classes.find(row => row.id === 'c1').active = true; });
  const current = await (await teacher('/submissions/submission-waiting')).json();
  const commands = await Promise.all([
    teacher('/submissions/submission-waiting/feedback', { expectedRevision: current.revision, comment: 'A', grade: 7 }, 'PATCH'),
    second('/submissions/submission-waiting/feedback', { expectedRevision: current.revision, comment: 'B', grade: 6 }, 'PATCH')
  ]);
  assert.deepEqual(commands.map(response => response.status).sort(), [200, 409]);
  const submitted = await post(teacher, '/submissions/submission-waiting/publish-feedback', { expectedRevision: (await commands.find(response => response.status === 200).json()).revision }, 'feedback-persist-0001');
  assert.equal(submitted.status, 200);
  const sent = await submitted.json();
  await store.transact(state => { const row = state.submissions.find(item => item.id === 'submission-waiting'); delete row.feedbackDraft; });
  const currentRead = await (await teacher('/submissions/submission-waiting')).json();
  const nextDraft = await teacher('/submissions/submission-waiting/feedback', { expectedRevision: currentRead.revision, comment: 'Falha de persistência', grade: 9 }, 'PATCH');
  assert.equal(nextDraft.status, 200);
  const writable = await nextDraft.json();
  const before = await store.read();
  setFailWrites(true);
  const failure = await post(teacher, `/submissions/submission-waiting/publish-feedback`, { expectedRevision: writable.revision }, 'feedback-persist-retry-0001');
  assert.equal(failure.status, 500);
  setFailWrites(false);
  assert.deepEqual(await store.read(), before);
  const retry = await post(teacher, '/submissions/submission-waiting/publish-feedback', { expectedRevision: writable.revision }, 'feedback-persist-retry-0001');
  assert.equal(retry.status, 200, await retry.clone().text());
  assert.equal((await retry.json()).feedbackHistory.length, sent.feedbackHistory.length + 1);
});

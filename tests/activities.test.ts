import test from 'node:test';
import assert from 'node:assert/strict';
import type { MockDatabase } from '../src/models/database.ts';
import { migrateDatabase } from '../src/lib/demo-storage.ts';
import { applyDemoMutation } from '../src/lib/demo-mutations.ts';
import { scopeDatabase } from '../src/lib/access.ts';
import { activityClosed, isLate, saveWork, saveFeedback, validateAttachments } from '../src/lib/activities.ts';
import { beginAttempt, saveAttemptAnswers, submitAttempt } from '../src/lib/assessment-attempts.ts';

const now = '2026-11-02T15:00:00.000Z';
function fixture(): MockDatabase {
  return { version: 1, audit: [], enrollments: [], users: [
    { id: 'a', name: 'Admin', email: 'a@example.org', role: 'admin' },
    { id: 't', name: 'Docente', email: 't@example.org', role: 'teacher' },
    { id: 't2', name: 'Colega', email: 't2@example.org', role: 'teacher' },
    { id: 's', name: 'Aluno', email: 's@example.org', role: 'student' },
    { id: 's2', name: 'Outro', email: 's2@example.org', role: 'student' }
  ], classes: [{ id: 'c', name: 'Turma', code: 'C', year: 2026, shift: 'Noite', active: true, studentIds: ['s', 's2'] }],
  subjects: [{ id: 'd', classId: 'c', name: 'Disciplina', teacherIds: ['t', 't2'], color: 'blue', description: '' }],
  modules: [{ id: 'm', subjectId: 'd', title: 'Módulo', description: '', order: 1 }],
  assessments: [{ id: 'w', kind: 'work', title: 'Trabalho', description: 'Instruções', moduleId: 'm', questionIds: [], deadline: '', required: false, maxGrade: 10, status: 'published' }],
  submissions: [], attempts: [], materials: [], questions: [], topics: [], announcements: [], events: [], attendance: [], progress: [] };
}
const link = { id: 'link', kind: 'link' as const, name: 'Documento', url: 'https://example.org/trabalho' };
function send(db = fixture()) {
  return applyDemoMutation(db, 's', d => saveWork(d, 'w', 's', 'delivery', [link], true, now), {}, now);
}
test('PP06: optional deadlines use São Paulo time and block exactly at expiry', () => {
  const a = fixture().assessments[0];
  assert.equal(activityClosed(a, now), false);
  a.deadline = '2026-11-02T12:00';
  assert.equal(activityClosed(a, now), true);
  assert.equal(isLate(a, now), true);
  a.allowLate = true;
  assert.equal(activityClosed(a, now), false);
});
test('PP06: free formats, five mixed attachments, unsafe URLs and size boundaries', () => {
  const file = { id: 'f', kind: 'file' as const, name: 'planilha.xlsx', size: 10 * 1024 * 1024, mime: 'application/octet-stream' };
  validateAttachments([file, link]);
  assert.throws(() => validateAttachments([{ ...file, size: file.size + 1 }]), /10 MB/);
  assert.throws(() => validateAttachments(Array.from({ length: 6 }, (_, i) => ({ ...link, id: String(i) }))), /5 anexos/);
  for (const url of ['javascript:alert(1)', 'data:text/html,oi', 'ftp://example.org', 'https://user:pass@example.org']) assert.throws(() => validateAttachments([{ ...link, url }]), /link/i);
  assert.throws(() => validateAttachments([link, link]), /repetid/i);
});
test('PP06: work drafts are private, resumable and become one immutable receipt', () => {
  let db = applyDemoMutation(fixture(), 's', d => saveWork(d, 'w', 's', 'delivery', [link], false, now), {}, now);
  assert.equal(scopeDatabase(db, db.users[1]).submissions?.length, 0);
  db = send(db);
  assert.equal(db.submissions?.[0].submittedAt, now);
  assert.throws(() => send(migrateDatabase(db)), /enviad/i);
  assert.throws(() => applyDemoMutation(db, 's', d => { d.submissions![0].attachments = []; }), /enviad|permiss/i);
  assert.equal(db.submissions?.[0].attachments.length, 1);
});
test('PP06: deletion never grants another submission, withdrawn activity disappears', () => {
  const db = send();
  const deleted = applyDemoMutation(db, 't', d => { d.assessments[0].deletedAt = now; }, {}, now);
  assert.equal(scopeDatabase(deleted, deleted.users[3]).submissions?.length, 0);
  assert.throws(() => send(deleted), /indispon|permiss/);
  assert.throws(() => applyDemoMutation(db, 's', d => { d.submissions![0].deletedAt = now; }), /enviad|permiss/);
});
test('PP06: deadlines, late enrollment and revoked access preserve drafts on refusal', () => {
  const db = fixture(); db.assessments[0].deadline = '2026-11-02T12:00';
  assert.throws(() => send(db), /Prazo encerrado/);
  assert.equal(db.submissions?.length, 0);
  db.assessments[0].allowLate = true;
  assert.equal(send(db).submissions?.length, 1);
  db.enrollments = [{ id: 'e', classId: 'c', studentId: 's', email: 's@example.org', status: 'active', createdAt: now, createdBy: 'a', enrolledAt: now, unassignedAssessmentIds: ['w'] }];
  assert.throws(() => send(db), /consulta|matrícula/i);
  db.enrollments = []; db.classes[0].studentIds = [];
  assert.throws(() => send(db), /permiss/);
});
test('PP06: published feedback is private and corrections preserve previous publication', () => {
  let db = send();
  const feedback = (draft: MockDatabase, publish: boolean, comment = 'Primeiro', grade?: number) => saveFeedback(draft, 'delivery', comment, grade, publish, 't', now);
  db = applyDemoMutation(db, 't', d => feedback(d, false, 'Privado', 0), {}, now);
  assert.equal(scopeDatabase(db, db.users[3]).submissions?.[0].feedbackDraft, undefined);
  assert.equal(scopeDatabase(db, db.users[3]).submissions?.[0].feedbackHistory.length, 0);
  db = applyDemoMutation(db, 't', d => feedback(d, true, 'Publicado', 0), {}, now);
  assert.equal(scopeDatabase(db, db.users[3]).submissions?.[0].feedbackPublished?.grade, 0);
  db = applyDemoMutation(db, 't2', d => saveFeedback(d, 'delivery', 'Correção secreta', undefined, false, 't2', now), {}, now);
  assert.equal(scopeDatabase(db, db.users[3]).submissions?.[0].feedbackPublished?.comment, 'Publicado');
  db = applyDemoMutation(db, 't2', d => saveFeedback(d, 'delivery', 'Só comentário', undefined, true, 't2', now), {}, now);
  assert.equal(db.submissions?.[0].feedbackHistory.length, 2);
  assert.equal(db.submissions?.[0].feedbackPublished?.grade, undefined);
  assert.equal(scopeDatabase(db, db.users[4]).submissions?.length, 0);
});
test('PP06: invalid feedback and denied writes preserve published content', () => {
  const db = send();
  for (const grade of [-1, 11, NaN]) assert.throws(() => applyDemoMutation(db, 't', d => saveFeedback(d, 'delivery', 'Comentário', grade, true, 't', now), {}, now), /nota/i);
  assert.throws(() => applyDemoMutation(db, 's', d => saveFeedback(d, 'delivery', 'Falso', 10, true, 's', now), {}, now), /enviad|permiss/i);
  assert.equal(db.submissions?.[0].feedbackPublished, undefined);
});
test('PP06: feedback concurrency requires latest revision and rechecks revocation', () => {
  let db = send(); const revision = db.submissions![0].revision!;
  const options = { expected: [{ collection: 'submissions', id: 'delivery', revision }] };
  db = applyDemoMutation(db, 't', d => saveFeedback(d, 'delivery', 'Colega', undefined, false, 't', now), options, now);
  assert.throws(() => applyDemoMutation(db, 't2', d => saveFeedback(d, 'delivery', 'Local', undefined, true, 't2', now), options, now), /alterad/);
  db.subjects[0].teacherIds = ['t'];
  assert.throws(() => applyDemoMutation(db, 't2', d => saveFeedback(d, 'delivery', 'Local', undefined, true, 't2', now), {}, now), /permiss/);
  assert.equal(db.submissions?.[0].feedbackDraft?.comment, 'Colega');
});
test('PP06: after first work delivery only text and deadline date may change', () => {
  const db = send();
  for (const change of [{ kind: 'quiz' }, { required: true }, { allowLate: true }, { maxGrade: 20 }, { deadline: '2026-12-01T10:00' }]) {
    assert.throws(() => applyDemoMutation(db, 't', d => Object.assign(d.assessments[0], change), {}, now), /entrega|prazo/i);
  }
  const updated = applyDemoMutation(db, 't', d => { d.assessments[0].title = 'Corrigido'; d.assessments[0].description = 'Novo texto'; }, {}, now);
  assert.equal(updated.assessments[0].title, 'Corrigido');
  assert.equal(updated.submissions?.[0].submittedAt, now);
});
test('PP06: extending an existing deadline recalculates lateness without reopening', () => {
  const initial = fixture(); Object.assign(initial.assessments[0], { deadline: '2026-11-01T10:00', allowLate: true });
  const db = send(initial);
  assert.equal(isLate(db.assessments[0], db.submissions![0].submittedAt!), true);
  const extended = applyDemoMutation(db, 't', d => { d.assessments[0].deadline = '2026-12-01T10:00'; }, {}, now);
  assert.equal(isLate(extended.assessments[0], extended.submissions![0].submittedAt!), false);
  assert.equal(extended.submissions![0].submittedAt, now);
  assert.ok(extended.audit.some(a => a.collection === 'assessments'));
  assert.throws(() => send(extended), /enviad/i);
});
test('PP06: migration adds work storage idempotently without changing historical quiz attempts', () => {
  const db = fixture(); delete db.submissions;
  db.attempts.push({ id: 'old', assessmentId: 'legacy', userId: 's', startedAt: now, submittedAt: now, answers: { missing: 0 }, questionOrder: ['missing'] });
  const migrated = migrateDatabase(db);
  assert.deepEqual(migrated.submissions, []);
  assert.deepEqual(migrated.attempts[0].answers, { missing: 0 });
  assert.deepEqual(migrateDatabase(migrated), migrated);
});

test('PP06: expiry during a quiz preserves answers and refuses submission until extension', () => {
  let db = fixture(); Object.assign(db.assessments[0], { kind: 'quiz', deadline: '2026-11-02T12:00' });
  db = applyDemoMutation(db, 's', d => beginAttempt(d, 'w', 's', 'try', '2026-11-02T14:00:00Z'), {}, '2026-11-02T14:00:00Z');
  db = applyDemoMutation(db, 's', d => saveAttemptAnswers(d, 'try', { answer: 0 }), {}, now);
  const preserved = structuredClone(db);
  assert.throws(() => applyDemoMutation(db, 's', d => submitAttempt(d, 'try', { answer: 0 }, now), {}, now), /Prazo encerrado/);
  assert.deepEqual(db, preserved);
  db = applyDemoMutation(db, 't', d => { d.assessments[0].deadline = '2026-11-03T12:00'; }, {}, now);
  db = applyDemoMutation(db, 's', d => submitAttempt(d, 'try', { answer: 0 }, now), {}, now);
  assert.equal(db.attempts[0].submittedAt, now);
  assert.throws(() => applyDemoMutation(db, 's', d => beginAttempt(d, 'w', 's', 'new', now), {}, now), /enviado/);
});
test('PP06: latest-state simultaneous deliveries keep the first receipt and failed recipes are atomic', () => {
  const original = fixture(); const db = send(original);
  assert.throws(() => applyDemoMutation(db, 's', d => saveWork(d, 'w', 's', 'second', [{ ...link, url: 'https://example.org/outro' }], true, now), {}, now), /enviad/);
  assert.equal(db.submissions![0].id, 'delivery');
  assert.equal(original.submissions!.length, 0);
  assert.throws(() => applyDemoMutation(original, 's', d => { saveWork(d, 'w', 's', 'fail', [link], true, now); throw new Error('Falha de gravação simulada'); }, {}, now), /Falha/);
  assert.equal(original.submissions!.length, 0);
});
test('PP06: another discipline and an inactive account cannot read or change work', () => {
  const db = send(); db.subjects[0].teacherIds = ['t'];
  assert.equal(scopeDatabase(db, db.users[2]).submissions?.length, 0);
  assert.throws(() => applyDemoMutation(db, 't2', d => saveFeedback(d, 'delivery', 'Inválido', 1, true, 't2', now), {}, now), /permiss/);
  db.users[3].active = false;
  assert.equal(scopeDatabase(db, db.users[3]).submissions?.length, 0);
  assert.throws(() => send(db), /inativa/);
});

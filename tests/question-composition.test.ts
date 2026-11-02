import test from 'node:test';
import assert from 'node:assert/strict';
import type { MockDatabase } from '../src/models/database.ts';
import { applyDemoMutation } from '../src/lib/demo-mutations.ts';
import { migrateDatabase } from '../src/lib/demo-storage.ts';
import { beginAttempt, submitAttempt } from '../src/lib/assessment-attempts.ts';
import { assessmentQuestions } from '../src/lib/question-composition.ts';
function fixture(): MockDatabase {
  return {
    version: 1, audit: [], enrollments: [],
    users: [
      { id: 'a', name: 'Admin', email: 'admin@exemplo.com', role: 'admin' },
      { id: 't1', name: 'Docente Um', email: 'um@exemplo.com', role: 'teacher' },
      { id: 't2', name: 'Docente Dois', email: 'dois@exemplo.com', role: 'teacher' },
      { id: 's1', name: 'Aluno Um', email: 'aluno@exemplo.com', role: 'student' },
      { id: 's2', name: 'Aluno Dois', email: 'outro@exemplo.com', role: 'student' }
    ],
    classes: [
      { id: 'c1', name: 'Turma', code: 'T1', year: 2026, shift: 'Noite', active: true, studentIds: ['s1'] },
      { id: 'c2', name: 'Outra', code: 'T2', year: 2026, shift: 'Tarde', active: true, studentIds: ['s2'] }
    ],
    subjects: [
      { id: 'd1', classId: 'c1', name: 'Uma', teacherIds: ['t1', 't2'], color: 'blue', description: '' },
      { id: 'd2', classId: 'c2', name: 'Outra', teacherIds: ['t2'], color: 'blue', description: '' }
    ],
    modules: [{ id: 'm1', subjectId: 'd1', title: 'Módulo', description: '', order: 1 }, { id: 'm2', subjectId: 'd2', title: 'Outro', description: '', order: 1 }],
    materials: [{ id: 'p1', moduleId: 'm1', title: 'Texto', content: '', kind: 'lesson', duration: 1, order: 1, authorId: 't1' }],
    assessments: [{ id: 'q1', moduleId: 'm1', title: 'Questões', description: '', questionIds: [], deadline: '2026-12-01', status: 'published' }],
    attempts: [{ id: 'try1', assessmentId: 'q1', userId: 's1', answers: {}, questionOrder: [], startedAt: '2026-11-01' }],
    questions: [], topics: [], announcements: [], events: [], attendance: [], progress: []
  };
}


const question = { id: 'bank', subject: 'Matem?tica', topic: 'Fun??es', difficulty: 'easy' as const, institution: 'AJA', year: 2026, statement: 'Quanto?', options: ['Um', 'Dois'], correct: 0, explanation: 'Um.' };
function prepared() { const db = fixture(); db.questions = [structuredClone(question)]; db.assessments[0].questionIds = ['bank']; db.attempts = []; return db; }

test('review: migration preserves historical questions no longer selected in the activity', () => {
  const db = prepared();
  db.questions.push({ ...question, id: 'question-historical', topic: 'Questão original' });
  db.attempts.push({ id: 'historical', assessmentId: 'q1', userId: 's1', startedAt: '2026-10-01', submittedAt: '2026-10-02', answers: { 'question-historical': 0 }, questionOrder: ['question-historical', 'bank'] });
  const migrated = migrateDatabase(db);
  assert.deepEqual(migrated.attempts[0].questions?.map(q => q.id), ['question-historical', 'bank']);
  assert.equal(migrated.questions.some(q => q.id === 'question-historical'), false);
  assert.deepEqual(migrateDatabase(migrated), migrated);
});

test('review: an incomplete snapshot never borrows later content from the live bank', () => {
  const db = prepared(); db.assessments[0].questions = [];
  assert.deepEqual(assessmentQuestions(db, db.assessments[0]), []);
});

test('PP05: starting and submitting preserves content despite later bank changes', () => {
  const db = prepared(); beginAttempt(db, 'q1', 's1', 'try', '2026-11-02');
  db.questions[0].correct = 1; db.questions[0].explanation = 'Alterada';
  submitAttempt(db, 'try', { bank: 0 }, '2026-11-03');
  assert.equal(db.attempts[0].questions?.[0].correct, 0);
  assert.equal(db.attempts[0].questions?.[0].explanation, 'Um.');
});
test('PP05: teachers cannot publish author questions in the common bank', () => {
  const db = prepared();
  assert.throws(() => applyDemoMutation(db, 't1', d => { d.questions.push({ ...question, id: 'local' }); d.assessments[0].questionIds.push('local'); }), /permiss/);
  assert.equal(db.questions.length, 1);
});
test('PP05: migration isolates legacy originals, preserves attempts and is idempotent', () => {
  const db = prepared(); db.questions.push({ ...question, id: 'question-legacy', topic: 'Quest\u00e3o original' }); db.assessments[0].questionIds.push('question-legacy');
  db.attempts.push({ id: 'old', assessmentId: 'q1', userId: 's1', startedAt: '2026-10-01', submittedAt: '2026-10-02', questionOrder: ['bank', 'question-legacy'], answers: { bank: 0 } });
  const migrated = migrateDatabase(db);
  assert.deepEqual(migrated.questions.map(q => q.id), ['bank']);
  assert.equal(migrated.assessments[0].questions?.length, 2);
  assert.equal(migrated.attempts[0].questions?.length, 2);
  assert.deepEqual(migrateDatabase(migrated), migrated);
  assert.equal(db.questions.length, 2);
});

function mixed() {
  const db = prepared();
  return applyDemoMutation(db, 't1', d => { d.assessments[0].questionIds.push('author'); d.assessments[0].questions = [{ ...question, id: 'author', origin: 'author' }]; });
}
test('PP05: mixed draft publishes, reopens and never leaks originals into the bank', () => {
  const db = mixed(); assert.equal(db.questions.length, 1);
  assert.deepEqual(db.assessments[0].questions?.map(q => q.id), ['bank', 'author']);
  const migrated = migrateDatabase(db); assert.deepEqual(migrated.assessments, db.assessments);
  const sent = applyDemoMutation(db, 's1', d => beginAttempt(d, 'q1', 's1', 'try', '2026-11-02'));
  assert.equal(sent.attempts[0].questions?.[1].origin, 'author');
  assert.equal(sent.questions.some(q => q.id === 'author'), false);
});
test('PP05: stale revision and revoked access refuse mixed content atomically', () => {
  const db = mixed(); const snapshot = structuredClone(db);
  assert.throws(() => applyDemoMutation(db, 't2', d => { d.assessments[0].title = 'stale'; }, { expected: [{ collection: 'assessments', id: 'q1', revision: 0 }] }), /alterad/);
  db.subjects[0].teacherIds = ['t1'];
  assert.throws(() => applyDemoMutation(db, 't2', d => { d.assessments[0].title = 'denied'; }), /permiss/);
  assert.deepEqual(db.assessments, snapshot.assessments);
});
test('PP05: invalid original, missing reference and duplicate ID preserve previous data', () => {
  const db = mixed(); const saved = structuredClone(db);
  for (const correct of [-1, 5, 0.5]) assert.throws(() => applyDemoMutation(db, 't1', d => { d.assessments[0].questions![1].correct = correct; }), /Confira/);
  assert.throws(() => applyDemoMutation(db, 't1', d => { d.assessments[0].questionIds.push('missing'); }), /Confira/);
  assert.throws(() => applyDemoMutation(db, 't1', d => { d.assessments[0].questionIds.push('bank'); }), /Confira/);
  assert.deepEqual(db, saved);
});
test('PP05: same ID author change resets drafts, refuses stale answers and locks after delivery', () => {
  let db = mixed(); db = applyDemoMutation(db, 's1', d => beginAttempt(d, 'q1', 's1', 'try', '2026-11-02'));
  db.attempts[0].answers = { author: 0 };
  db = applyDemoMutation(db, 't2', d => { d.assessments[0].questions![1].statement = 'Updated'; }, {}, '2026-11-02T12:00:00Z');
  assert.deepEqual(db.attempts[0].answers, {}); assert.equal(db.attempts[0].questions?.[1].statement, 'Updated');
  assert.throws(() => submitAttempt(db, 'try', { author: 0 }, '2026-11-02'), /atualizadas/);
  db.attempts[0].submittedAt = '2026-11-02';
  assert.throws(() => applyDemoMutation(db, 't1', d => { d.assessments[0].questions![1].statement = 'Another'; }), /entrega/);
});
test('PP05: bank edit preserves activity snapshots and submitted explanations', () => {
  let db = mixed(); db = applyDemoMutation(db, 's1', d => beginAttempt(d, 'q1', 's1', 'try', '2026-11-02'));
  db = applyDemoMutation(db, 's1', d => submitAttempt(d, 'try', { bank: 0 }, '2026-11-02'));
  db = applyDemoMutation(db, 'a', d => { d.questions[0].explanation = 'New bank'; d.questions[0].correct = 1; });
  assert.equal(db.assessments[0].questions?.[0].correct, 0);
  assert.equal(db.attempts[0].questions?.[0].explanation, 'Um.');
});

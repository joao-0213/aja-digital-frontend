import test from 'node:test';
import assert from 'node:assert/strict';
import type { MockDatabase } from '../src/models/database.ts';
import { applyDemoMutation } from '../src/lib/demo-mutations.ts';
import { migrateDatabase } from '../src/lib/demo-storage.ts';
import { beginAttempt, submitAttempt } from '../src/lib/assessment-attempts.ts';
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

test('PP05: starting and submitting preserves content despite later bank changes', () => {
  const db = prepared(); beginAttempt(db, 'q1', 's1', 'try', '2026-11-02');
  db.questions[0].correct = 1; db.questions[0].explanation = 'Alterada';
  submitAttempt(db, 'try', { bank: 0 }, '2026-11-03');
  assert.equal(db.attempts[0].questions?.[0].correct, 0);
  assert.equal(db.attempts[0].questions?.[0].explanation, 'Um.');
});
test('PP05: teachers cannot publish author questions in the common bank', () => {
  const db = prepared();
  assert.throws(() => applyDemoMutation(db, 't1', d => { d.questions.push({ ...question, id: 'local' }); d.assessments[0].questionIds.push('local'); }), /permiss?o/);
  assert.equal(db.questions.length, 1);
});
test('PP05: migration isolates legacy originals, preserves attempts and is idempotent', () => {
  const db = prepared(); db.questions.push({ ...question, id: 'question-legacy', topic: 'Quest?o original' }); db.assessments[0].questionIds.push('question-legacy');
  db.attempts.push({ id: 'old', assessmentId: 'q1', userId: 's1', startedAt: '2026-10-01', submittedAt: '2026-10-02', questionOrder: ['bank', 'question-legacy'], answers: { bank: 0 } });
  const migrated = migrateDatabase(db);
  assert.deepEqual(migrated.questions.map(q => q.id), ['bank']);
  assert.equal(migrated.assessments[0].questions?.length, 2);
  assert.equal(migrated.attempts[0].questions?.length, 2);
  assert.deepEqual(migrateDatabase(migrated), migrated);
  assert.equal(db.questions.length, 2);
});

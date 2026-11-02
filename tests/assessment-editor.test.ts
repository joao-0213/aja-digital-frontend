import test from 'node:test';
import assert from 'node:assert/strict';
import type { MockDatabase } from '../src/models/database.ts';
import type { Assessment } from '../src/models/assessments.ts';
import type { Question } from '../src/models/questions.ts';
import { needsAssessmentStructureRecovery, restoreAssessmentStructure } from '../src/features/assessments/lib/assessment-editor.ts';
import { applyDemoMutation } from '../src/lib/demo-mutations.ts';

const assessment: Assessment = { id: 'activity', title: 'Publicado', description: 'Orientações publicadas', deadline: '2026-12-10T19:00', moduleId: 'm1', questionIds: ['q1', 'q2'], status: 'published', authorId: 'teacher', revision: 3 };
const original: Question = { id: 'local', statement: 'Questão local', options: ['A', 'B'], correct: 0, explanation: 'Explicação', subject: 'Matemática', topic: 'Tema', difficulty: 'easy', institution: 'AJA', year: 2026 };
const localDraft = () => ({ title: 'Título em edição', description: 'Meu texto preservado', deadline: '2026-12-12T20:00', moduleId: 'm2', questionIds: ['q2'], originals: [original] });
const fixture = (): MockDatabase => ({
  version: 1, audit: [],
  users: [{ id: 'admin', name: 'Admin', email: 'admin@exemplo.com', role: 'admin' }, { id: 'teacher', name: 'Docente', email: 'docente@exemplo.com', role: 'teacher' }, { id: 'student', name: 'Aluno', email: 'aluno@exemplo.com', role: 'student' }],
  classes: [{ id: 'class', name: 'Turma', code: 'T1', year: 2026, shift: 'Noite', active: true, studentIds: ['student'] }],
  subjects: [{ id: 'subject', classId: 'class', name: 'Disciplina', teacherIds: ['teacher'], color: 'blue', description: '' }],
  modules: [{ id: 'm1', subjectId: 'subject', title: 'Original', description: '', order: 1 }, { id: 'm2', subjectId: 'subject', title: 'Destino local', description: '', order: 2 }],
  assessments: [structuredClone(assessment)],
  attempts: [{ id: 'submitted', assessmentId: 'activity', userId: 'student', questionOrder: ['q1', 'q2'], answers: { q1: 0 }, startedAt: '2026-11-01T19:00:00Z', submittedAt: '2026-11-01T19:05:00Z' }],
  materials: [], questions: [], topics: [], announcements: [], events: [], attendance: [], progress: []
});

test('the first submission turns local structural edits into an explicit recovery without losing allowed fields', () => {
  const local = localDraft();
  assert.equal(needsAssessmentStructureRecovery(assessment, local, false), false);
  assert.equal(needsAssessmentStructureRecovery(assessment, local, true), true);
  const recovered = restoreAssessmentStructure(local, assessment);
  assert.equal(needsAssessmentStructureRecovery(assessment, recovered, true), false);
  assert.equal(recovered.title, local.title);
  assert.equal(recovered.description, local.description);
  assert.equal(recovered.deadline, local.deadline);
  assert.equal(recovered.moduleId, assessment.moduleId);
  assert.deepEqual(recovered.questionIds, assessment.questionIds);
  assert.deepEqual(recovered.originals, []);
  assert.deepEqual(local.questionIds, ['q2']);
  assert.deepEqual(local.originals, [original]);
  recovered.questionIds.reverse();
  assert.deepEqual(assessment.questionIds, ['q1', 'q2']);
});

test('question order, module changes and unselected local questions each require recovery after submission', () => {
  const same = { ...localDraft(), moduleId: assessment.moduleId, questionIds: [...assessment.questionIds], originals: [] };
  assert.equal(needsAssessmentStructureRecovery(assessment, same, true), false);
  assert.equal(needsAssessmentStructureRecovery(assessment, { ...same, questionIds: ['q2', 'q1'] }, true), true);
  assert.equal(needsAssessmentStructureRecovery(assessment, { ...same, moduleId: 'm2' }, true), true);
  assert.equal(needsAssessmentStructureRecovery(assessment, { ...same, originals: [original] }, true), true);
  assert.equal(needsAssessmentStructureRecovery(undefined, same, true), false);
});

test('recovered title, instructions and deadline save without changing submitted structure or answers', () => {
  const db = fixture();
  const recovered = restoreAssessmentStructure(localDraft(), db.assessments[0]);
  const saved = applyDemoMutation(db, 'teacher', draft => {
    Object.assign(draft.assessments[0], { title: recovered.title, description: recovered.description, deadline: recovered.deadline, moduleId: recovered.moduleId, questionIds: recovered.questionIds });
  }, { expected: [{ collection: 'assessments', id: 'activity', revision: 3 }] });
  assert.equal(saved.assessments[0].title, recovered.title);
  assert.equal(saved.assessments[0].description, recovered.description);
  assert.equal(saved.assessments[0].deadline, recovered.deadline);
  assert.equal(saved.assessments[0].moduleId, 'm1');
  assert.deepEqual(saved.assessments[0].questionIds, ['q1', 'q2']);
  assert.deepEqual(saved.attempts, db.attempts);
  assert.equal(saved.assessments[0].authorId, 'teacher');
});

test('recovering current structure does not acknowledge a stale revision or bypass revoked access', () => {
  const db = fixture();
  const openedRevision = { expected: [{ collection: 'assessments', id: 'activity', revision: 2 }] };
  const recovered = restoreAssessmentStructure(localDraft(), db.assessments[0]);
  const recipe = (draft: MockDatabase) => { Object.assign(draft.assessments[0], { title: recovered.title, moduleId: recovered.moduleId, questionIds: recovered.questionIds }); };
  assert.throws(() => applyDemoMutation(db, 'teacher', recipe, openedRevision), /alterado|versão/i);
  assert.equal(openedRevision.expected[0].revision, 2);
  const currentRevision = { expected: [{ collection: 'assessments', id: 'activity', revision: 3 }] };
  db.subjects[0].teacherIds = [];
  assert.throws(() => applyDemoMutation(db, 'teacher', recipe, currentRevision), /permiss|atribui/i);
  db.subjects[0].teacherIds = ['teacher'];
  db.assessments[0].deletedAt = '2026-11-02T19:00:00Z';
  assert.throws(() => applyDemoMutation(db, 'teacher', recipe, currentRevision), /retirado|indisponível/i);
});

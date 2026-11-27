import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyStudentActivity,
  deadlineParts,
  groupStudentActivities
} from '../src/features/assessments/lib/activity-list.ts';
import type {
  AssessmentStudent,
  AttemptStudent,
  SubmissionStudent
} from '../src/features/assessments/api.ts';

function studentAssessment(overrides: Partial<AssessmentStudent>): AssessmentStudent {
  return {
    id: 'a1',
    revision: 1,
    createdAt: '2026-11-01T12:00:00Z',
    updatedAt: '2026-11-01T12:00:00Z',
    updatedBy: 'demo-teacher',
    moduleId: 'm1',
    title: 'Atividade',
    description: '',
    kind: 'quiz',
    maxGrade: 10,
    deadline: '2026-12-07T16:15:00Z',
    required: true,
    allowLate: false,
    status: 'published',
    publishedAt: '2026-11-01T12:00:00Z',
    questionCount: 2,
    assigned: true,
    ...overrides
  };
}

test('classifyStudentActivity distinguishes pending, in-progress, awaiting feedback, graded, completed, and readonly', () => {
  const pendingQuiz = studentAssessment({ id: 'q-pending', kind: 'quiz' });
  assert.equal(classifyStudentActivity(pendingQuiz, 'u1', [], []).label, 'Pendente');
  assert.equal(classifyStudentActivity(pendingQuiz, 'u1', [], []).actionKind, 'primary');

  const inProgressAttempt: AttemptStudent = {
    id: 'att-1',
    revision: 1,
    createdAt: '',
    updatedAt: '',
    updatedBy: 'u1',
    assessmentId: 'q-pending',
    assessmentTitle: 'Q',
    userId: 'u1',
    studentName: 'Alex',
    startedAt: '2026-11-20T12:00:00Z',
    submittedAt: null,
    answers: {},
    questionOrder: [],
    questions: [],
    questionsUpdatedAt: null
  };
  assert.equal(
    classifyStudentActivity(pendingQuiz, 'u1', [inProgressAttempt], []).label,
    'Em andamento'
  );
  assert.equal(
    classifyStudentActivity(pendingQuiz, 'u1', [inProgressAttempt], []).actionLabel,
    'Retomar'
  );

  const completedAttempt: AttemptStudent = {
    ...inProgressAttempt,
    submittedAt: '2026-11-20T13:00:00Z'
  };
  const doneQuiz = classifyStudentActivity(pendingQuiz, 'u1', [completedAttempt], []);
  assert.equal(doneQuiz.group, 'completed');
  assert.equal(doneQuiz.actionKind, 'secondary');
  assert.equal(doneQuiz.actionLabel, 'Ver resultado');

  const work = studentAssessment({ id: 'w1', kind: 'work' });
  const pendingSubmission: SubmissionStudent = {
    id: 'sub-1',
    revision: 2,
    createdAt: '',
    updatedAt: '',
    updatedBy: 'u1',
    assessmentId: 'w1',
    userId: 'u1',
    attachments: [],
    submittedAt: '2026-11-23T16:15:00Z',
    receipt: { id: 'r1', resourceId: 'sub-1', submittedAt: '2026-11-23T16:15:00Z' },
    feedbackPublished: null,
    feedbackUpdated: false
  };
  const waiting = classifyStudentActivity(work, 'u1', [], [pendingSubmission]);
  assert.equal(waiting.group, 'awaiting_feedback');
  assert.equal(waiting.label, 'Aguardando correção');
  assert.equal(waiting.actionKind, 'secondary');

  const gradedSubmission: SubmissionStudent = {
    ...pendingSubmission,
    feedbackPublished: {
      comment: 'Ótimo',
      grade: 8.5,
      author: { id: 't1', name: 'Daniela' },
      createdAt: '2026-11-24T12:00:00Z'
    }
  };
  const graded = classifyStudentActivity(work, 'u1', [], [gradedSubmission]);
  assert.equal(graded.group, 'completed');
  assert.equal(graded.label, 'Avaliada · 8,5');
  assert.equal(graded.actionLabel, 'Ver feedback');

  const readonly = studentAssessment({ id: 'q-ro', assigned: false });
  assert.equal(classifyStudentActivity(readonly, 'u1', [], []).group, 'readonly');
});

test('groupStudentActivities orders groups by urgency and sorts items chronologically by deadline', () => {
  const activities = [
    studentAssessment({ id: 'q-late', title: 'Revisão final', deadline: '2026-12-07T16:15:00Z' }),
    studentAssessment({ id: 'q-soon', title: 'Lista urgente', deadline: '2026-11-29T16:15:00Z' }),
    studentAssessment({
      id: 'q-done',
      title: 'Missão proporções',
      deadline: '2026-11-30T16:15:00Z'
    })
  ];
  const attempts: AttemptStudent[] = [
    {
      id: 'att-done',
      revision: 2,
      createdAt: '',
      updatedAt: '',
      updatedBy: 'u1',
      assessmentId: 'q-done',
      assessmentTitle: 'Missão proporções',
      userId: 'u1',
      studentName: 'Alex',
      startedAt: '2026-11-24T15:00:00Z',
      submittedAt: '2026-11-24T16:15:00Z',
      answers: {},
      questionOrder: [],
      questions: [],
      questionsUpdatedAt: null
    }
  ];

  const groups = groupStudentActivities(activities, 'u1', attempts, []);
  assert.deepEqual(
    groups.map((g) => g.key),
    ['pending', 'completed']
  );
  assert.deepEqual(
    groups[0].entries.map((e) => e.activity.id),
    ['q-soon', 'q-late']
  );
  assert.deepEqual(
    groups[1].entries.map((e) => e.activity.id),
    ['q-done']
  );
});

test('deadlineParts formats São Paulo date and time cleanly', () => {
  const parts = deadlineParts('2026-11-30T16:15:00Z');
  assert.equal(parts?.time, '13:15');
  assert.ok(parts?.date.includes('30'));
  assert.equal(deadlineParts(null), null);
});

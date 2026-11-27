import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateAttendanceByStudent,
  formatScore,
  initials,
  moduleDisplayNumber,
  resolveActorDisplayName,
  sortByDeadlineAsc,
} from '../src/lib/utils.ts';
import { summarizeQuizResult } from '../src/features/assessments/lib/result-summary.ts';
import type { AttemptResult } from '../src/features/assessments/api.ts';

test('initials always returns uppercase initials for mixed-case names', () => {
  assert.equal(initials('Teste de entrega AJA'), 'TD');
  assert.equal(initials('alex aluno'), 'AA');
  assert.equal(initials('Daniela Professora'), 'DP');
});

test('resolveActorDisplayName maps known teacher IDs and hides raw technical slugs', () => {
  const teachers = [{ id: 'demo-teacher', name: 'Daniela Professora' }];
  assert.equal(resolveActorDisplayName('demo-teacher', teachers), 'Daniela Professora');
  assert.equal(resolveActorDisplayName('demo-unknown-actor', teachers), 'Equipe docente');
  assert.equal(resolveActorDisplayName('550e8400-e29b-41d4-a716-446655440000', teachers), 'Equipe docente');
  assert.equal(resolveActorDisplayName('Ana Administração', teachers), 'Ana Administração');
  assert.equal(resolveActorDisplayName('', teachers), 'Equipe docente');
});

test('moduleDisplayNumber avoids 0-indexed module labels across zero-based and one-based orders', () => {
  const modules = [
    { id: 'm1', subjectId: 's1', order: 0 },
    { id: 'm2', subjectId: 's1', order: 1 },
    { id: 'm3', subjectId: 's2', order: 0 },
  ];
  assert.equal(moduleDisplayNumber(modules, modules[0]), 1);
  assert.equal(moduleDisplayNumber(modules, modules[1]), 2);
  assert.equal(moduleDisplayNumber(modules, modules[2]), 1);
  assert.equal(moduleDisplayNumber(modules, undefined), null);
});

test('sortByDeadlineAsc sorts soonest deadlines first and places activities without deadline last', () => {
  const items = [
    { id: 'no-date', deadline: null },
    { id: 'dec-07', deadline: '2026-12-07T16:15:00Z' },
    { id: 'nov-30', deadline: '2026-11-30T16:15:00Z' },
    { id: 'dec-05', deadline: '2026-12-05T16:15:00Z' },
  ];
  assert.deepEqual(
    sortByDeadlineAsc(items).map(item => item.id),
    ['nov-30', 'dec-05', 'dec-07', 'no-date'],
  );
});

test('summarizeQuizResult distinguishes question count from weighted grade scale', () => {
  const result: AttemptResult = {
    attempt: {
      id: 'att-1',
      revision: 2,
      createdAt: '2026-11-24T16:15:00Z',
      updatedAt: '2026-11-24T16:15:00Z',
      updatedBy: 'demo-student',
      assessmentId: 'demo-quiz',
      assessmentTitle: 'Missão proporções',
      userId: 'demo-student',
      studentName: 'Alex Aluno',
      startedAt: '2026-11-24T16:00:00Z',
      submittedAt: '2026-11-24T16:15:00Z',
      answers: { q1: 1, q2: 2 },
      questionOrder: ['q1', 'q2'],
      questions: [],
      questionsUpdatedAt: null,
    },
    receipt: { id: 'r1', resourceId: 'att-1', submittedAt: '2026-11-24T16:15:00Z' },
    score: 10,
    maxScore: 10,
    questions: [
      { id: 'q1', subject: 'Matemática', topic: 'Proporções', difficulty: 'easy', institution: 'AJA', year: 2026, statement: 'Q1', options: ['a', 'b'], correct: 1, explanation: 'ok' },
      { id: 'q2', subject: 'Matemática', topic: 'Escalas', difficulty: 'easy', institution: 'AJA', year: 2026, statement: 'Q2', options: ['a', 'b', 'c'], correct: 2, explanation: 'ok' },
    ],
  };

  const summary = summarizeQuizResult(result);
  assert.equal(summary.percentage, 100);
  assert.equal(summary.correctQuestions, 2);
  assert.equal(summary.totalQuestions, 2);
  assert.equal(summary.hasQuestionBreakdown, true);
  assert.equal(summary.showGradeDetail, true);
  assert.equal(formatScore(8.5), '8,5');
  assert.equal(formatScore(10), '10');
});

test('summarizeQuizResult falls back cleanly when historical question content is unavailable', () => {
  const result: AttemptResult = {
    attempt: {
      id: 'att-2',
      revision: 2,
      createdAt: '2026-11-24T16:15:00Z',
      updatedAt: '2026-11-24T16:15:00Z',
      updatedBy: 'demo-student',
      assessmentId: 'demo-quiz',
      assessmentTitle: 'Missão proporções',
      userId: 'demo-student',
      studentName: 'Alex Aluno',
      startedAt: '2026-11-24T16:00:00Z',
      submittedAt: '2026-11-24T16:15:00Z',
      answers: { q1: 1 },
      questionOrder: ['q1', 'q2'],
      questions: [],
      questionsUpdatedAt: null,
    },
    receipt: { id: 'r2', resourceId: 'att-2', submittedAt: '2026-11-24T16:15:00Z' },
    score: 5,
    maxScore: 10,
    questions: [],
  };

  const summary = summarizeQuizResult(result);
  assert.equal(summary.percentage, 50);
  assert.equal(summary.hasQuestionBreakdown, false);
  assert.equal(summary.showGradeDetail, false);
});

test('aggregateAttendanceByStudent tallies present and total marks per student across lessons', () => {
  const summary = aggregateAttendanceByStudent([
    { records: { s1: false, s2: true } },
    { records: { s1: true, s2: true } },
    { records: { s1: true } },
  ]);
  assert.deepEqual(summary.get('s1'), { present: 2, total: 3 });
  assert.deepEqual(summary.get('s2'), { present: 2, total: 2 });
  assert.equal(summary.get('s3'), undefined);
});

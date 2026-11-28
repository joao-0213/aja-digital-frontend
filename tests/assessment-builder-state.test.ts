import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssessmentStaff } from '@/features/assessments/api';
import {
  assessmentBuilderReducer,
  createInitialAssessmentBuilderState,
  isAmbiguousBuilderError,
  resolveBuilderSaveRequest
} from '@/features/assessments/hooks/assessment-builder-state';
import { HttpError } from '@/lib/http-client';

const baseRecord: AssessmentStaff = {
  id: 'a1',
  revision: 2,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  updatedBy: 't1',
  moduleId: 'm1',
  title: 'Prova 1',
  description: 'Descrição',
  kind: 'quiz',
  maxGrade: null,
  deadline: null,
  required: true,
  allowLate: false,
  status: 'draft',
  publishedAt: null,
  questionIds: ['q1'],
  questions: [],
  hasSubmissions: false
};

test('assessmentBuilderReducer handles reset confirmation, inspection, business conflict, and adoption', () => {
  let state = createInitialAssessmentBuilderState(baseRecord, null, null);
  assert.equal(state.activeRecord?.id, 'a1');

  state = assessmentBuilderReducer(state, { type: 'OPEN_RESET_CONFIRM', action: 'publish' });
  assert.equal(state.dialog, 'reset');
  assert.equal(state.pendingAction, 'publish');

  state = assessmentBuilderReducer(state, {
    type: 'CONFIRM_RESET',
    signature: '["q2"]',
    nextAction: 'publish'
  });
  assert.equal(state.resetConfirmedFor, '["q2"]');
  assert.equal(state.dialog, 'review');

  state = assessmentBuilderReducer(state, { type: 'BUSINESS_CONFLICT' });
  assert.equal(state.businessConflict, true);
  assert.equal(state.latestRecord, null);

  state = assessmentBuilderReducer(state, { type: 'INSPECT_START' });
  assert.equal(state.latestLoading, true);
  state = assessmentBuilderReducer(state, {
    type: 'INSPECT_ERROR',
    message: 'Falha ao consultar.'
  });
  assert.equal(state.latestLoading, false);
  assert.equal(state.latestError, 'Falha ao consultar.');

  const updated = { ...baseRecord, revision: 3, hasSubmissions: true };
  state = assessmentBuilderReducer(state, { type: 'INSPECT_SUCCESS', record: updated });
  assert.equal(state.latestRecord?.revision, 3);

  state = assessmentBuilderReducer(state, { type: 'ADOPT_CURRENT', record: updated });
  assert.equal(state.activeRecord?.revision, 3);
  assert.equal(state.businessConflict, false);
  assert.equal(state.latestRecord, null);
});

test('isAmbiguousBuilderError classifies transport/5xx errors as ambiguous and 4xx conflicts as deterministic', () => {
  assert.equal(isAmbiguousBuilderError(new HttpError('timeout', 'Timeout')), true);
  assert.equal(isAmbiguousBuilderError(new HttpError('unavailable', 'Offline')), true);
  assert.equal(isAmbiguousBuilderError(new HttpError('http', 'Erro', { status: 503 })), true);
  assert.equal(
    isAmbiguousBuilderError(new HttpError('conflict', 'Conflito', { status: 409 })),
    false
  );
  assert.equal(isAmbiguousBuilderError(new Error('Generic')), false);
});

test('resolveBuilderSaveRequest enforces recovery, structural lock, reset confirmation, and publish review', () => {
  assert.deepEqual(
    resolveBuilderSaveRequest({
      action: 'draft',
      uncertain: true,
      pendingCreateAction: 'publish',
      conflicted: false,
      blocked: false,
      needsStructureRecovery: false,
      structuralLocked: false,
      questionStructureChanged: false,
      resetConfirmed: false,
      validationMessage: ''
    }),
    { kind: 'retry_uncertain', action: 'publish' }
  );

  assert.equal(
    resolveBuilderSaveRequest({
      action: 'publish',
      uncertain: false,
      conflicted: false,
      blocked: false,
      needsStructureRecovery: true,
      structuralLocked: true,
      questionStructureChanged: false,
      resetConfirmed: false,
      validationMessage: ''
    }).kind,
    'needs_recovery'
  );

  assert.equal(
    resolveBuilderSaveRequest({
      action: 'publish',
      uncertain: false,
      conflicted: false,
      blocked: false,
      needsStructureRecovery: false,
      structuralLocked: true,
      questionStructureChanged: true,
      resetConfirmed: false,
      validationMessage: ''
    }).kind,
    'structural_locked'
  );

  assert.deepEqual(
    resolveBuilderSaveRequest({
      action: 'publish',
      uncertain: false,
      conflicted: false,
      blocked: false,
      needsStructureRecovery: false,
      structuralLocked: false,
      questionStructureChanged: true,
      resetConfirmed: false,
      validationMessage: ''
    }),
    { kind: 'confirm_reset', action: 'publish' }
  );

  assert.deepEqual(
    resolveBuilderSaveRequest({
      action: 'publish',
      uncertain: false,
      conflicted: false,
      blocked: false,
      needsStructureRecovery: false,
      structuralLocked: false,
      questionStructureChanged: true,
      resetConfirmed: true,
      validationMessage: ''
    }),
    { kind: 'open_review' }
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';
import type { AttemptStudent, SubmissionStudent } from '@/features/assessments/api';
import {
  completeQuizAnswers,
  countQuizAnswered,
  displayQuizChoice,
  hasAttemptSnapshotChanged,
  resolveQuizRecoveryNotice,
  shouldScheduleQuizAutosave
} from '@/features/assessments/hooks/quiz-session-state';
import {
  isLocalWorkRecovery,
  isWorkSubmissionDirty,
  resolveInitialWorkRecovery,
  workOwnerKey,
  workRevisionStorageKey
} from '@/features/assessments/hooks/work-submission-state';

const baseSubmission: SubmissionStudent = {
  id: 'sub1',
  revision: 2,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  updatedBy: 'u1',
  assessmentId: 'a1',
  userId: 'u1',
  attachments: [{ kind: 'link', name: 'Link do trabalho', url: 'https://example.test' }],
  submittedAt: null,
  receipt: null,
  feedbackPublished: null,
  feedbackUpdated: false
};

test('work-submission-state preserves aja-work-v1 keys, validates recovery schema, and detects dirty uploads', () => {
  const ownerKey = workOwnerKey('u:1', 's:1', 'a:1');
  assert.equal(ownerKey, 'aja-work-v1:u%3A1:s%3A1:a%3A1');
  assert.equal(workRevisionStorageKey(ownerKey, 2), 'aja-work-v1:u%3A1:s%3A1:a%3A1:revision:2');

  assert.equal(isLocalWorkRecovery(null), false);
  assert.equal(isLocalWorkRecovery({ revision: '2', attachments: [], uploads: {} }), false);
  assert.equal(
    isLocalWorkRecovery({
      revision: 2,
      attachments: [],
      uploads: {},
      submit: { revision: 2, key: 'k1' }
    }),
    true
  );

  const matched = resolveInitialWorkRecovery(
    {
      revision: 2,
      attachments: [
        ...baseSubmission.attachments,
        { kind: 'file', fileId: 'local:1', name: 'doc.pdf' }
      ],
      uploads: {
        'local:1': {
          key: 'u-key',
          name: 'doc.pdf',
          size: 10,
          type: 'application/pdf',
          digest: 'abc'
        }
      },
      submit: { revision: 2, key: 'submit-key' }
    },
    baseSubmission
  );
  assert.equal(matched.matches, true);
  assert.equal(matched.items.length, 2);
  assert.deepEqual(matched.submitIntent, { revision: 2, key: 'submit-key' });
  assert.equal(matched.notice, '');

  const stale = resolveInitialWorkRecovery(
    { revision: 1, attachments: [], uploads: {} },
    baseSubmission
  );
  assert.equal(stale.matches, false);
  assert.match(stale.notice, /outra revisão/);
  assert.deepEqual(stale.items, baseSubmission.attachments);

  assert.equal(isWorkSubmissionDirty(baseSubmission, baseSubmission.attachments, {}), false);
  assert.equal(
    isWorkSubmissionDirty(baseSubmission, baseSubmission.attachments, {
      'local:1': { key: 'k', name: 'f.pdf', size: 1, type: 'application/pdf', digest: 'd' }
    }),
    true
  );
});

const baseAttempt: AttemptStudent = {
  id: 'att1',
  revision: 3,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  updatedBy: 'u1',
  assessmentId: 'a1',
  assessmentTitle: 'Simulado',
  userId: 'u1',
  studentName: 'Aluno',
  startedAt: '2026-01-01T00:00:00Z',
  submittedAt: null,
  answers: { q1: 0, q2: null },
  questionOrder: ['q1', 'q2'],
  questions: [
    {
      id: 'q1',
      subject: 'Mat',
      topic: 'Álgebra',
      difficulty: 'easy',
      institution: 'ENEM',
      year: 2025,
      statement: 'Q1',
      options: ['A', 'B']
    },
    {
      id: 'q2',
      subject: 'Mat',
      topic: 'Geometria',
      difficulty: 'medium',
      institution: 'ENEM',
      year: 2025,
      statement: 'Q2',
      options: ['C', 'D']
    }
  ],
  questionsUpdatedAt: '2026-01-01T00:00:00Z'
};

test('quiz-session-state handles autosave scheduling, snapshot order changes, and choice labels', () => {
  assert.deepEqual(completeQuizAnswers(['q1', 'q2'], { q1: 1 }), { q1: 1, q2: null });
  assert.equal(countQuizAnswered({ q1: 1, q2: null }), 1);
  assert.equal(displayQuizChoice(baseAttempt, 'q1', 1), 'B');
  assert.equal(displayQuizChoice(baseAttempt, 'q2', null), 'Em branco');

  assert.equal(hasAttemptSnapshotChanged(baseAttempt, { ...baseAttempt }), false);
  assert.equal(
    hasAttemptSnapshotChanged(baseAttempt, { ...baseAttempt, questionOrder: ['q2', 'q1'] }),
    true
  );
  assert.equal(
    hasAttemptSnapshotChanged(baseAttempt, {
      ...baseAttempt,
      questionsUpdatedAt: '2026-01-02T00:00:00Z'
    }),
    true
  );

  assert.match(resolveQuizRecoveryNotice('stale'), /revisão anterior/);
  assert.match(resolveQuizRecoveryNotice('incompatible'), /descartado/);
  assert.equal(resolveQuizRecoveryNotice('restored'), '');

  assert.equal(
    shouldScheduleQuizAutosave({
      dirty: true,
      hasConflict: false,
      submitBusy: false,
      hasFrozenIntent: false,
      authenticated: true
    }),
    true
  );
  assert.equal(
    shouldScheduleQuizAutosave({
      dirty: true,
      hasConflict: true,
      submitBusy: false,
      hasFrozenIntent: false,
      authenticated: true
    }),
    false
  );
  assert.equal(
    shouldScheduleQuizAutosave({
      dirty: true,
      hasConflict: false,
      submitBusy: false,
      hasFrozenIntent: true,
      authenticated: true
    }),
    false
  );
});

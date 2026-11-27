import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attemptRecoveryStorageKey,
  readAttemptRecovery
} from '../src/features/assessments/lib/attempt-recovery.ts';
import * as attemptsLib from '../src/features/assessments/lib/attempt-recovery.ts';

const owner = {
  userId: 'student-two',
  sessionId: 'server-session-7',
  attemptId: 'attempt:1',
  openedRevision: 4
};
const questionOrder = ['q1', 'q2'];
const questions = [
  { id: 'q1', options: ['A', 'B'] },
  { id: 'q2', options: ['A', 'B', 'C'] }
];

test('attempt recovery key is scoped to the user, verified session, attempt, and opened revision', () => {
  const key = attemptRecoveryStorageKey(owner);
  assert.match(key, /^aja-attempt-recovery:/);
  assert.notEqual(attemptRecoveryStorageKey({ ...owner, userId: 'student' }), key);
  assert.notEqual(attemptRecoveryStorageKey({ ...owner, sessionId: 'server-session-8' }), key);
  assert.notEqual(attemptRecoveryStorageKey({ ...owner, attemptId: 'attempt:2' }), key);
  assert.notEqual(attemptRecoveryStorageKey({ ...owner, openedRevision: 5 }), key);
});

test('attempt recovery preserves explicit blank answers and drops indexes outside the captured snapshot', () => {
  const stored = JSON.stringify({
    owner,
    questionOrder,
    answers: { q1: 1, q2: null, 'not-in-snapshot': 0 }
  });
  assert.deepEqual(readAttemptRecovery(stored, owner, questionOrder, questions), {
    q1: 1,
    q2: null
  });
});

test('attempt recovery is discarded when owner, revision, or ordered snapshot no longer matches', () => {
  const stored = JSON.stringify({ owner, questionOrder, answers: { q1: 1 } });
  assert.equal(
    readAttemptRecovery(
      stored,
      { ...owner, sessionId: 'another-session' },
      questionOrder,
      questions
    ),
    null
  );
  assert.equal(
    readAttemptRecovery(stored, { ...owner, openedRevision: 5 }, questionOrder, questions),
    null
  );
  assert.equal(readAttemptRecovery(stored, owner, ['q2', 'q1'], questions), null);
});

test('attempt recovery owner uses the actual attempt revision and keeps the opening revision across server autosaves', () => {
  type AttemptShape = { id: string; revision: number; questionsUpdatedAt: string | null };
  type Identity = { userId: string; sessionId: string };
  type RecoveryOwner = {
    userId: string;
    sessionId: string;
    attemptId: string;
    openedRevision: number;
    questionsUpdatedAt: string | null;
  };
  type OwnerResolver = (
    attempt: AttemptShape,
    identity: Identity,
    openedRevision?: number
  ) => RecoveryOwner;
  const resolveOwner = (attemptsLib as unknown as { attemptRecoveryOwnerFor?: OwnerResolver })
    .attemptRecoveryOwnerFor;
  assert.equal(
    typeof resolveOwner,
    'function',
    'the attempt screen must derive recovery ownership from its API attempt revision'
  );
  if (!resolveOwner) return;

  const opened = resolveOwner(
    { id: 'attempt:1', revision: 1, questionsUpdatedAt: null },
    { userId: 'student-two', sessionId: 'server-session-7' }
  );
  const afterAutosave = resolveOwner(
    { id: 'attempt:1', revision: 2, questionsUpdatedAt: null },
    { userId: 'student-two', sessionId: 'server-session-7' },
    opened.openedRevision
  );
  assert.equal(opened.openedRevision, 1);
  assert.deepEqual(afterAutosave, opened);
  assert.equal(attemptRecoveryStorageKey(afterAutosave), attemptRecoveryStorageKey(opened));
});

test('attempt recovery will not reapply a local map saved against an older server revision after another browser update', () => {
  type AttemptShape = {
    id: string;
    revision: number;
    answers: Record<string, number | null>;
    questionOrder: string[];
    questionsUpdatedAt: string | null;
    questions: typeof questions;
  };
  type Identity = { userId: string; sessionId: string };
  type RecoveryOwner = {
    userId: string;
    sessionId: string;
    attemptId: string;
    openedRevision: number;
    questionsUpdatedAt: string | null;
  };
  type Resolution = {
    owner: RecoveryOwner;
    answers: Record<string, number | null>;
    status: 'fresh' | 'restored' | 'stale' | 'incompatible';
  };
  type Resolver = (attempt: AttemptShape, identity: Identity, stored: string | null) => Resolution;
  const resolveRecovery = (attemptsLib as unknown as { resolveAttemptRecovery?: Resolver })
    .resolveAttemptRecovery;
  assert.equal(
    typeof resolveRecovery,
    'function',
    'attempt recovery must compare server revisions before restoring local answers'
  );
  if (!resolveRecovery) return;

  const openedAttempt: AttemptShape = {
    id: 'attempt:1',
    revision: 1,
    answers: { q1: 1 },
    questionOrder,
    questionsUpdatedAt: null,
    questions
  };
  const identity = { userId: 'student-two', sessionId: 'server-session-7' };
  const oldOwner = { ...resolveOwnerForTest(openedAttempt, identity), openedRevision: 1 };
  const stored = JSON.stringify({
    owner: oldOwner,
    serverRevision: 1,
    questionOrder,
    questionsUpdatedAt: null,
    answers: { q1: 0 }
  });
  const currentAttempt = { ...openedAttempt, revision: 2, answers: { q1: 1 } };
  const recovered = resolveRecovery(currentAttempt, identity, stored);
  assert.equal(recovered.status, 'stale');
  assert.deepEqual(
    recovered.answers,
    { q1: 1 },
    'current server answers remain loaded while stale local data is not applied'
  );
  assert.equal(
    recovered.owner.openedRevision,
    2,
    'a stale recovery starts a new revision-scoped key'
  );
});

test('quiz inputs stay locked while the final answer save is preparing a submission', () => {
  type InputLock = (state: {
    authenticated: boolean;
    submitBusy: boolean;
    hasFrozenIntent: boolean;
  }) => boolean;
  const inputLock = (attemptsLib as unknown as { shouldLockAttemptInputs?: InputLock })
    .shouldLockAttemptInputs;
  assert.equal(
    typeof inputLock,
    'function',
    'QuizSession must derive answer controls from submit preparation state'
  );
  if (!inputLock) return;

  assert.equal(inputLock({ authenticated: true, submitBusy: true, hasFrozenIntent: false }), true);
  assert.equal(
    inputLock({ authenticated: true, submitBusy: false, hasFrozenIntent: false }),
    false
  );
  assert.equal(inputLock({ authenticated: true, submitBusy: false, hasFrozenIntent: true }), true);
  assert.equal(
    inputLock({ authenticated: false, submitBusy: false, hasFrozenIntent: false }),
    true
  );
});

function resolveOwnerForTest(
  attempt: { id: string; revision: number; questionsUpdatedAt: string | null },
  identity: { userId: string; sessionId: string }
) {
  const resolver = (
    attemptsLib as unknown as {
      attemptRecoveryOwnerFor?: (
        attempt: { id: string; revision: number; questionsUpdatedAt: string | null },
        identity: { userId: string; sessionId: string }
      ) => {
        userId: string;
        sessionId: string;
        attemptId: string;
        openedRevision: number;
        questionsUpdatedAt: string | null;
      };
    }
  ).attemptRecoveryOwnerFor;
  return (
    resolver?.(attempt, identity) ?? {
      userId: identity.userId,
      sessionId: identity.sessionId,
      attemptId: attempt.id,
      openedRevision: attempt.revision,
      questionsUpdatedAt: attempt.questionsUpdatedAt
    }
  );
}

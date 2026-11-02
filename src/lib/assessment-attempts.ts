import type { MockDatabase } from '@/models';
import { assessmentQuestions } from './question-composition.ts';

export function beginAttempt(db: MockDatabase, assessmentId: string, userId: string, id: string, startedAt: string) {
  const assessment = db.assessments.find(a => a.id === assessmentId && a.status === 'published');
  if (!assessment || assessment.kind === 'work') throw new Error('Questionário indisponível.');
  const previous = db.attempts.filter(t => t.assessmentId === assessmentId && t.userId === userId);
  if (previous.some(t => t.submittedAt)) throw new Error('Este questionário já foi enviado.');
  if (previous.some(t => !t.submittedAt)) return;
  db.attempts.push({ id, assessmentId, userId, startedAt, answers: {}, questionOrder: [...assessment.questionIds], questions: structuredClone(assessmentQuestions(db, assessment)) });
}

/** Draft autosaves may overlap; only a changed question set invalidates their answers. */
export function saveAttemptAnswers(db: MockDatabase, id: string, answers: Record<string, number>, questionsUpdatedAt?: string) {
  const attempt = db.attempts.find(t => t.id === id);
  if (!attempt) throw new Error('Tentativa indisponível.');
  if (attempt.submittedAt) return;
  if (attempt.questionsUpdatedAt !== questionsUpdatedAt) throw new Error('As questões foram atualizadas. Retome o questionário para conferir o rascunho reiniciado.');
  attempt.answers = { ...answers };
}

export function submitAttempt(db: MockDatabase, id: string, answers: Record<string, number>, submittedAt: string, questionsUpdatedAt?: string) {
  const attempt = db.attempts.find(t => t.id === id);
  if (!attempt) throw new Error('Tentativa não encontrada.');
  if (db.attempts.some(t => t.assessmentId === attempt.assessmentId && t.userId === attempt.userId && t.submittedAt)) {
    throw new Error('Este questionário já foi enviado.');
  }
  if (attempt.questionsUpdatedAt !== questionsUpdatedAt) throw new Error('As questões foram atualizadas. Revise o rascunho reiniciado antes de enviar.');
  attempt.answers = { ...answers };
  attempt.submittedAt = submittedAt;
}

export interface AttemptRecoveryOwner {
  userId: string;
  sessionId: string;
  attemptId: string;
  openedRevision: number;
  questionsUpdatedAt?: string | null;
}

export interface AttemptRecoveryIdentity {
  userId: string;
  sessionId: string;
  attemptId: string;
}

export interface AttemptRecoveryAttempt {
  id: string;
  revision: number;
  answers: Record<string, number | null>;
  questionOrder: string[];
  questionsUpdatedAt: string | null;
  questions: AttemptRecoveryQuestion[];
}

export interface AttemptRecoveryResolution {
  owner: AttemptRecoveryOwner;
  answers: Record<string, number | null>;
  status: 'fresh' | 'restored' | 'stale' | 'incompatible';
}

export interface AttemptRecoveryQuestion {
  id: string;
  options: string[];
}

/** The quiz screen uses this to disable answer controls from click through receipt. */
export function shouldLockAttemptInputs(state: { authenticated: boolean; submitBusy: boolean; hasFrozenIntent: boolean }) {
  return !state.authenticated || state.submitBusy || state.hasFrozenIntent;
}

/** Non-secret pointer lets reload find a tab's stable opening revision after server autosaves. */
export function attemptRecoveryPointerKey(identity: AttemptRecoveryIdentity) {
  return `aja-attempt-recovery-owner:${encodeURIComponent(JSON.stringify([identity.userId, identity.sessionId, identity.attemptId]))}`;
}

/** The opened revision is captured from the server response, never inferred from timestamps. */
export function attemptRecoveryOwnerFor(
  attempt: Pick<AttemptRecoveryAttempt, 'id' | 'revision' | 'questionsUpdatedAt'>,
  identity: Pick<AttemptRecoveryIdentity, 'userId' | 'sessionId'>,
  openedRevision = attempt.revision
): AttemptRecoveryOwner {
  return { ...identity, attemptId: attempt.id, openedRevision, questionsUpdatedAt: attempt.questionsUpdatedAt };
}

/** SessionStorage survives reload in one verified browser session and never crosses account or attempt owners. */
export function attemptRecoveryStorageKey(owner: AttemptRecoveryOwner) {
  return `aja-attempt-recovery:${encodeURIComponent(JSON.stringify([owner.userId, owner.sessionId, owner.attemptId, owner.openedRevision]))}`;
}

/** Restore only data tied to this authenticated owner, prompt snapshot, and latest known server revision. */
export function resolveAttemptRecovery(
  attempt: AttemptRecoveryAttempt,
  identity: AttemptRecoveryIdentity,
  stored: string | null | undefined
): AttemptRecoveryResolution {
  const currentOwner = attemptRecoveryOwnerFor(attempt, identity);
  const serverAnswers = structuredClone(attempt.answers);
  if (!stored) return { owner: currentOwner, answers: serverAnswers, status: 'fresh' };
  try {
    const value: unknown = JSON.parse(stored);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { owner: currentOwner, answers: serverAnswers, status: 'incompatible' };
    const record = value as Record<string, unknown>;
    const rawOwner = record.owner;
    if (!rawOwner || typeof rawOwner !== 'object' || Array.isArray(rawOwner)) return { owner: currentOwner, answers: serverAnswers, status: 'incompatible' };
    const savedOwner = rawOwner as Record<string, unknown>;
    if (savedOwner.userId !== identity.userId || savedOwner.sessionId !== identity.sessionId || savedOwner.attemptId !== attempt.id) {
      return { owner: currentOwner, answers: serverAnswers, status: 'fresh' };
    }
    const openedRevision = savedOwner.openedRevision;
    const savedQuestionsUpdatedAt = savedOwner.questionsUpdatedAt ?? null;
    const validRevision = Number.isSafeInteger(openedRevision) && (openedRevision as number) > 0;
    const savedOrder = record.questionOrder;
    const sameSnapshot = savedQuestionsUpdatedAt === attempt.questionsUpdatedAt
      && Array.isArray(savedOrder)
      && savedOrder.length === attempt.questionOrder.length
      && savedOrder.every((id, index) => id === attempt.questionOrder[index]);
    const owner = validRevision
      ? { userId: identity.userId, sessionId: identity.sessionId, attemptId: attempt.id, openedRevision: openedRevision as number, questionsUpdatedAt: attempt.questionsUpdatedAt }
      : currentOwner;
    if (!validRevision || !sameSnapshot || !Number.isSafeInteger(record.serverRevision)) {
      return { owner: currentOwner, answers: serverAnswers, status: 'incompatible' };
    }
    if (record.serverRevision !== attempt.revision) return { owner: currentOwner, answers: serverAnswers, status: 'stale' };
    const answers = readAttemptRecovery(stored, owner, attempt.questionOrder, attempt.questions);
    if (!answers) return { owner: currentOwner, answers: serverAnswers, status: 'incompatible' };
    return { owner, answers: { ...serverAnswers, ...answers }, status: 'restored' };
  } catch {
    return { owner: currentOwner, answers: serverAnswers, status: 'incompatible' };
  }
}

/** Ignore stale snapshots and filter malformed local values before restoring answers. */
export function readAttemptRecovery(
  stored: string | null | undefined,
  owner: AttemptRecoveryOwner,
  questionOrder: string[],
  questions: AttemptRecoveryQuestion[]
): Record<string, number | null> | null {
  if (!stored) return null;
  try {
    const value: unknown = JSON.parse(stored);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    const savedOwner = record.owner;
    if (!savedOwner || typeof savedOwner !== 'object' || Array.isArray(savedOwner)) return null;
    const sameOwner = Object.keys(owner).every(key => (savedOwner as Record<string, unknown>)[key] === owner[key as keyof AttemptRecoveryOwner]);
    if (!sameOwner || !Array.isArray(record.questionOrder) || record.questionOrder.length !== questionOrder.length
      || record.questionOrder.some((id, index) => id !== questionOrder[index])) return null;
    const rawAnswers = record.answers;
    if (!rawAnswers || typeof rawAnswers !== 'object' || Array.isArray(rawAnswers)) return null;
    const questionById = new Map(questions.map(question => [question.id, question]));
    const answers: Record<string, number | null> = {};
    for (const [id, value] of Object.entries(rawAnswers)) {
      const question = questionById.get(id);
      if (!question || !questionOrder.includes(id)) continue;
      if (value === null) { answers[id] = null; continue; }
      if (Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) < question.options.length) answers[id] = value as number;
    }
    return answers;
  } catch {
    return null;
  }
}

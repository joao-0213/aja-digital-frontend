import type { MockDatabase } from '@/models';
import { assessmentQuestions } from './question-composition.ts';

export function beginAttempt(db: MockDatabase, assessmentId: string, userId: string, id: string, startedAt: string) {
  const assessment = db.assessments.find(a => a.id === assessmentId && a.status === 'published');
  if (!assessment) throw new Error('Questionário indisponível.');
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

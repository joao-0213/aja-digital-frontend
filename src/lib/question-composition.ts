import type { Assessment, Attempt, MockDatabase, Question } from '@/models';

/** Resolve old records only when no snapshot exists. Never replace a saved snapshot. */
export function assessmentQuestions(db: MockDatabase, assessment: Assessment): Question[] {
  return assessment.questionIds.map(id => assessment.questions?.find(q => q.id === id) ?? db.questions.find(q => q.id === id)).filter((q): q is Question => !!q);
}

export function attemptQuestions(db: MockDatabase, attempt: Attempt): Question[] {
  if (attempt.questions) return attempt.questions;
  const assessment = db.assessments.find(a => a.id === attempt.assessmentId);
  const source = assessment ? assessmentQuestions(db, assessment) : db.questions;
  return attempt.questionOrder.map(id => source.find(q => q.id === id)).filter((q): q is Question => !!q);
}

export function validateComposition(questions: Question[], ids: string[]) {
  if (new Set(ids).size !== ids.length || questions.length !== ids.length || questions.some((q, i) => q.id !== ids[i] || !q.statement.trim() || !q.explanation.trim() || q.options.length < 2 || q.options.some(o => !o.trim()) || !Number.isInteger(q.correct) || q.correct < 0 || q.correct >= q.options.length)) throw new Error('Confira as questões, alternativas e gabaritos antes de salvar.');
}

import type { AttemptStudent } from '../api';
import type { AttemptRecoveryResolution } from '../lib/attempt-recovery';

export type QuizAnswers = Record<string, number | null>;
export type QuizSaveStatus = 'saved' | 'saving' | 'error' | 'conflict';

export function completeQuizAnswers(order: string[], answers: QuizAnswers): QuizAnswers {
  return Object.fromEntries(order.map((id) => [id, answers[id] ?? null]));
}

export function displayQuizChoice(
  attempt: AttemptStudent,
  id: string,
  answer: number | null | undefined
): string {
  if (answer === null || answer === undefined) return 'Em branco';
  const question = attempt.questions.find((item) => item.id === id);
  return question?.options[answer] ?? 'Alternativa indisponível';
}

export function hasAttemptSnapshotChanged(
  current: Pick<AttemptStudent, 'questionsUpdatedAt' | 'questionOrder'>,
  incoming: Pick<AttemptStudent, 'questionsUpdatedAt' | 'questionOrder'>
): boolean {
  return (
    incoming.questionsUpdatedAt !== current.questionsUpdatedAt ||
    incoming.questionOrder.join('\u0000') !== current.questionOrder.join('\u0000')
  );
}

export function resolveQuizRecoveryNotice(status: AttemptRecoveryResolution['status']): string {
  if (status === 'stale') {
    return 'O rascunho local pertencia a uma revisão anterior e não foi reaplicado. As respostas salvas mais recentes foram carregadas.';
  }
  if (status === 'incompatible') {
    return 'O rascunho local não correspondia a esta revisão ou ordem de questões e foi descartado.';
  }
  return '';
}

export function shouldScheduleQuizAutosave(state: {
  dirty: boolean;
  hasConflict: boolean;
  submitBusy: boolean;
  hasFrozenIntent: boolean;
  authenticated: boolean;
}): boolean {
  return (
    state.dirty &&
    !state.hasConflict &&
    !state.submitBusy &&
    !state.hasFrozenIntent &&
    state.authenticated
  );
}

export function countQuizAnswered(answers: QuizAnswers): number {
  return Object.values(answers).filter((value) => value !== null && value !== undefined).length;
}

import { percent } from '../../../lib/utils.ts';
import type { AttemptResult } from '../api.ts';

export interface QuizResultSummary {
  percentage: number;
  correctQuestions: number;
  totalQuestions: number;
  hasQuestionBreakdown: boolean;
  showGradeDetail: boolean;
}

export function summarizeQuizResult(result: AttemptResult): QuizResultSummary {
  const questionById = new Map(result.questions.map(question => [question.id, question]));
  const totalQuestions = result.attempt.questionOrder.length;
  let resolvedQuestions = 0;
  let correctQuestions = 0;

  for (const questionId of result.attempt.questionOrder) {
    const question = questionById.get(questionId);
    if (!question) continue;
    resolvedQuestions += 1;
    const answer = result.attempt.answers[questionId];
    if (answer !== null && answer !== undefined && answer === question.correct) {
      correctQuestions += 1;
    }
  }

  const hasQuestionBreakdown = totalQuestions > 0 && resolvedQuestions === totalQuestions;
  const percentage = result.maxScore > 0
    ? percent(result.score, result.maxScore)
    : hasQuestionBreakdown
      ? percent(correctQuestions, totalQuestions)
      : 0;
  const showGradeDetail = hasQuestionBreakdown && result.maxScore > 0 && result.maxScore !== totalQuestions;

  return {
    percentage,
    correctQuestions,
    totalQuestions,
    hasQuestionBreakdown,
    showGradeDetail,
  };
}

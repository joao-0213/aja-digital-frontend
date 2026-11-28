import type { PaginatedResponse } from '@/models';
import type { AssessmentSnapshot } from './assessment-contracts';

export type AttemptQuestionPrompt = Omit<AssessmentSnapshot, 'correct' | 'explanation' | 'origin'>;
export type AttemptQuestionResult = Omit<AssessmentSnapshot, 'origin'>;

export interface AttemptStudent {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  assessmentId: string;
  assessmentTitle: string;
  userId: string;
  studentName: string;
  startedAt: string;
  submittedAt: string | null;
  answers: Record<string, number | null>;
  questionOrder: string[];
  questions: AttemptQuestionPrompt[];
  questionsUpdatedAt: string | null;
}

export interface AttemptStaff extends Omit<AttemptStudent, 'questions'> {
  questions: AttemptQuestionPrompt[];
}

export type AttemptRead = AttemptStudent | AttemptStaff;
export type AttemptPage = PaginatedResponse<AttemptRead>;

export interface AttemptResult {
  attempt: AttemptStudent;
  receipt: { id: string; resourceId: string; submittedAt: string };
  score: number;
  maxScore: number;
  questions: AttemptQuestionResult[];
}

export function isStudentAttempt(value: AttemptRead | undefined | null): value is AttemptStudent {
  return Boolean(value && 'questionsUpdatedAt' in value && Array.isArray(value.questions));
}

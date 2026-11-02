import type { RecordMeta } from './audit';
import type { Question } from './questions';

export interface Assessment extends RecordMeta {
  authorId?: string;
  id: string;
  publishedAt?: string;
  moduleId: string;
  title: string;
  description: string;
  questionIds: string[];
  questions?: Question[];
  deadline: string;
  required?: boolean;
  allowLate?: boolean;
  status: 'draft' | 'published';
}

export interface Attempt extends RecordMeta {
  questionsUpdatedAt?: string;
  id: string;
  assessmentId: string;
  userId: string;
  startedAt: string;
  submittedAt?: string;
  answers: Record<string, number>;
  questionOrder: string[];
  questions?: Question[];
}

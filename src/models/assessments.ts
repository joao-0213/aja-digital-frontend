import type { RecordMeta } from './audit';

export interface Assessment extends RecordMeta {
  authorId?: string;
  id: string;
  publishedAt?: string;
  moduleId: string;
  title: string;
  description: string;
  questionIds: string[];
  deadline: string;
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
}

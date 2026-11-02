import type { RecordMeta } from './audit';
import type { Question } from './questions';

export interface Assessment extends RecordMeta {
  kind?: 'quiz' | 'work';
  maxGrade?: number;
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

export type WorkAttachment =
  | { id: string; kind: 'file'; name: string; size: number; mime: string }
  | { id: string; kind: 'link'; name: string; url: string };

export interface FeedbackPublication {
  comment: string;
  grade?: number;
  authorId: string;
  createdAt: string;
}

export interface WorkSubmission extends RecordMeta {
  feedbackUpdated?: boolean;
  id: string;
  assessmentId: string;
  userId: string;
  attachments: WorkAttachment[];
  submittedAt?: string;
  feedbackDraft?: FeedbackPublication;
  feedbackPublished?: FeedbackPublication;
  feedbackHistory: FeedbackPublication[];
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

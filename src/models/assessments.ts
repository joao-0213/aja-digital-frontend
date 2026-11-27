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

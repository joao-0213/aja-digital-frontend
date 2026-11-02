import type { RecordMeta } from './audit';

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Question extends RecordMeta {
  id: string;
  subject: string;
  topic: string;
  difficulty: Difficulty;
  institution: string;
  year: number;
  statement: string;
  options: string[];
  correct: number;
  explanation: string;
}

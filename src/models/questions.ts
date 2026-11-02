import type { RecordMeta } from './audit';

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Question extends RecordMeta {
  origin?: 'bank' | 'author';
  image?: { src: string; alt: string };
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

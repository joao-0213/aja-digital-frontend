import type { Question } from '@/models';
import { textMatch } from '@/lib/utils';

export interface QuestionFilterValue {
  search: string;
  subject: string;
  topic: string;
  difficulty: string;
  institution: string;
  year?: string;
}

export const emptyQuestionFilters: Required<QuestionFilterValue> = {
  search: '',
  subject: 'all',
  topic: 'all',
  difficulty: 'all',
  institution: 'all',
  year: 'all'
};

export function filterQuestions(questions: Question[], filters: QuestionFilterValue) {
  const year = filters.year ?? 'all';
  return questions.filter(
    (q) =>
      q.origin !== 'author' &&
      !q.deletedAt &&
      (filters.subject === 'all' || q.subject === filters.subject) &&
      (filters.topic === 'all' || q.topic === filters.topic) &&
      (filters.difficulty === 'all' || q.difficulty === filters.difficulty) &&
      (filters.institution === 'all' || q.institution === filters.institution) &&
      (year === 'all' || String(q.year) === year) &&
      textMatch(`${q.statement} ${q.subject} ${q.topic}`, filters.search)
  );
}

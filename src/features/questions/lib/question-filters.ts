import type { Question } from '@/models';
import { textMatch } from '@/lib/utils';

export const emptyQuestionFilters = { search: '', subject: 'all', topic: 'all', difficulty: 'all', institution: 'all' };
export type QuestionFilterValue = typeof emptyQuestionFilters;
export function filterQuestions(questions: Question[], filters: QuestionFilterValue) {
  return questions.filter(q => q.origin !== 'author' && !q.deletedAt && (filters.subject === 'all' || q.subject === filters.subject) && (filters.topic === 'all' || q.topic === filters.topic) && (filters.difficulty === 'all' || q.difficulty === filters.difficulty) && (filters.institution === 'all' || q.institution === filters.institution) && textMatch(`${q.statement} ${q.topic}`, filters.search));
}

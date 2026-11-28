import type { SessionClient } from '@/providers/session-client';
import { collectAllPages } from '@/lib/http-pagination';
import type { PaginatedResponse } from '@/models';
import type { Difficulty } from '@/models/questions';
import { emptyQuestionFilters, type QuestionFilterValue } from './lib/question-filters';

export interface BankQuestion {
  id: string;
  subject: string;
  topic: string;
  difficulty: Difficulty;
  institution: string;
  year: number;
  statement: string;
  options: string[];
  image?: { src: string; alt: string };
}
export type QuestionPage = PaginatedResponse<BankQuestion>;
export interface PracticeResult {
  questionId: string;
  choice: number;
  correct: number;
  isCorrect: boolean;
  explanation: string;
}

export function createQuestionsApi(client: Pick<SessionClient, 'request'>) {
  const list = (filters: QuestionFilterValue, page: number, signal?: AbortSignal, pageSize = 5) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (filters.search.trim()) params.set('q', filters.search.trim());
    for (const field of ['subject', 'topic', 'difficulty', 'institution'] as const)
      if (filters[field] !== 'all') params.set(field, filters[field]);
    if (filters.year && filters.year !== 'all') params.set('year', filters.year);
    return client.request<QuestionPage>(`/questions?${params}`, { signal });
  };
  return {
    list,
    listOptions: (signal?: AbortSignal, isCurrent?: () => boolean) =>
      collectAllPages((page, pageSignal) => list(emptyQuestionFilters, page, pageSignal, 100), {
        signal,
        isCurrent
      }),
    read: (id: string, signal?: AbortSignal) =>
      client.request<BankQuestion>(`/questions/${encodeURIComponent(id)}`, { signal }),
    practice: (id: string, choice: number) =>
      client.request<PracticeResult>(`/questions/${encodeURIComponent(id)}/practice`, {
        method: 'POST',
        json: { choice }
      })
  };
}

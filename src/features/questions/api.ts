import type { SessionClient } from '../../providers/session-client.ts';
import type { Difficulty } from '../../models/questions.ts';
import type { QuestionFilterValue } from './lib/question-filters.ts';

export interface BankQuestion { id: string; subject: string; topic: string; difficulty: Difficulty; institution: string; year: number; statement: string; options: string[]; image?: { src: string; alt: string } }
export interface QuestionPage { items: BankQuestion[]; page: number; pageSize: number; total: number }
export interface PracticeResult { questionId: string; choice: number; correct: number; isCorrect: boolean; explanation: string }

export function createQuestionsApi(client: Pick<SessionClient, 'request'>) {
  return {
    list: (filters: QuestionFilterValue, page: number, signal?: AbortSignal, pageSize = 5) => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (filters.search.trim()) params.set('q', filters.search.trim());
      for (const field of ['subject', 'topic', 'difficulty', 'institution'] as const) if (filters[field] !== 'all') params.set(field, filters[field]);
      if (filters.year && filters.year !== 'all') params.set('year', filters.year);
      return client.request<QuestionPage>(`/questions?${params}`, { signal });
    },
    read: (id: string, signal?: AbortSignal) => client.request<BankQuestion>(`/questions/${encodeURIComponent(id)}`, { signal }),
    practice: (id: string, choice: number) => client.request<PracticeResult>(`/questions/${encodeURIComponent(id)}/practice`, { method: 'POST', json: { choice } })
  };
}

'use client';

import { useMemo } from 'react';
import { useSessionClient } from '@/providers/app-context';
import { createFilesApi } from '@/lib/http-files';
import { createQuestionsApi } from '../api';
import type { QuestionFilterValue } from '../lib/question-filters';

export const questionKeys = {
  all: ['questions'] as const,
  list: (filters: QuestionFilterValue, page: number) =>
    ['questions', 'list', filters, page] as const,
  options: ['questions', 'options'] as const,
  detail: (id: string | null) => ['questions', 'detail', id] as const
};

export function useQuestionsApi() {
  const client = useSessionClient();
  return useMemo(() => createQuestionsApi(client), [client]);
}

export function useQuestionFilesApi() {
  const client = useSessionClient();
  return useMemo(() => createFilesApi(client), [client]);
}

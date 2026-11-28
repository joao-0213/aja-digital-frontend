'use client';

import { useMemo } from 'react';
import { useSessionClient } from '@/providers/app-context';
import { createForumApi, type ForumFilter } from '../api';

export const forumKeys = {
  all: ['forum'] as const,
  options: ['forum', 'options'] as const,
  list: (filters: ForumFilter, page: number) => ['forum', 'list', filters, page] as const,
  detail: (id: string) => ['forum', 'detail', id] as const
};

export function useForumApi() {
  const client = useSessionClient();
  return useMemo(() => createForumApi(client), [client]);
}

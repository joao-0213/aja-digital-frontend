'use client';

import { useMemo } from 'react';
import { useSessionClient } from '@/providers/app-context';
import { createClassesApi } from '../api';

export const classKeys = {
  all: ['classes'] as const,
  list: (search: string, showInactive: boolean, page: number) =>
    ['classes', 'list', search, showInactive, page] as const
};

export function useClassesApi() {
  const client = useSessionClient();
  return useMemo(() => createClassesApi(client), [client]);
}

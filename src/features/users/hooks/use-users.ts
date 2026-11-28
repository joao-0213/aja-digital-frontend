'use client';

import { useMemo } from 'react';
import { useSessionClient } from '@/providers/app-context';
import { createUsersApi } from '../api';

export const userKeys = {
  all: ['users'] as const,
  list: (search: string, role: string, showInactive: boolean, page: number) =>
    ['users', 'list', search, role, showInactive, page] as const
};

export function useUsersApi() {
  const client = useSessionClient();
  return useMemo(() => createUsersApi(client), [client]);
}

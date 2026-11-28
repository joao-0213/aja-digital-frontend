'use client';

import { useMemo } from 'react';
import { useSessionClient } from '@/providers/app-context';
import { createSubjectsApi } from '../api';

export const subjectKeys = {
  all: ['subjects'] as const,
  list: (classId: string, search: string, page: number) =>
    ['subjects', 'list', classId, search, page] as const,
  classOptions: ['subjects', 'class-options'] as const,
  detail: (id: string) => ['subjects', 'detail', id] as const,
  materials: (id: string) => ['subjects', 'materials', id] as const,
  assessments: (id: string) => ['subjects', 'assessments', id] as const,
  attempts: (id: string) => ['subjects', 'attempts', id] as const,
  submissions: (id: string) => ['subjects', 'submissions', id] as const,
  wall: (id: string) => ['subjects', 'wall', id] as const
};

export function useSubjectsApi() {
  const client = useSessionClient();
  return useMemo(() => createSubjectsApi(client), [client]);
}

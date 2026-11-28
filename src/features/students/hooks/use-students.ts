'use client';

import { useMemo } from 'react';
import { useSessionClient } from '@/providers/app-context';
import { createStudentsApi } from '../api';

export const studentKeys = {
  all: ['students'] as const,
  classOptions: ['students', 'class-options'] as const,
  list: (classId: string, search: string, history: boolean, page: number) =>
    ['students', 'list', classId, search, history, page] as const,
  enrollments: (classId: string, search: string, history: boolean, page: number) =>
    ['students', 'enrollments', classId, search, history, page] as const,
  attendance: (classId: string) => ['students', 'attendance', classId] as const,
  detail: (id: string) => ['students', 'detail', id] as const,
  detailAttendance: (id: string, subjectId: string) =>
    ['students', 'detail-attendance', id, subjectId] as const
};

export function useStudentsApi() {
  const client = useSessionClient();
  return useMemo(() => createStudentsApi(client), [client]);
}

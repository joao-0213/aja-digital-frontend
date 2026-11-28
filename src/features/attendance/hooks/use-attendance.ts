'use client';

import { useMemo } from 'react';
import { useSessionClient } from '@/providers/app-context';
import { createAttendanceApi } from '../api';

export const attendanceKeys = {
  all: ['attendance'] as const,
  subjects: ['attendance', 'subjects'] as const,
  recent: (subjectId: string) => ['attendance', 'recent', subjectId] as const
};

export function useAttendanceApi() {
  const client = useSessionClient();
  return useMemo(() => createAttendanceApi(client), [client]);
}

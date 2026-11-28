'use client';

import { useMemo } from 'react';
import { useSessionClient } from '@/providers/app-context';
import { createDashboardApi } from '../api';

export const dashboardKeys = {
  all: ['dashboard'] as const,
  staff: ['dashboard', 'staff'] as const,
  student: ['dashboard', 'student'] as const,
  studentMaterials: ['dashboard', 'student-materials'] as const,
  studentAttempts: ['dashboard', 'student-attempts'] as const,
  studentSubmissions: ['dashboard', 'student-submissions'] as const
};

export function useDashboardApi() {
  const client = useSessionClient();
  return useMemo(() => createDashboardApi(client), [client]);
}

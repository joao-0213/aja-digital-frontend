'use client';

import { useMemo } from 'react';
import { useSessionClient } from '@/providers/app-context';
import { createFilesApi } from '@/lib/http-files';
import { createAssessmentsApi } from '../api';

export const assessmentKeys = {
  all: ['assessments'] as const,
  list: (staffFilter: string) => ['assessments', 'list', staffFilter] as const,
  detail: (id: string) => ['assessments', 'detail', id] as const,
  attempts: ['assessments', 'attempts'] as const,
  submissions: ['assessments', 'submissions'] as const,
  builder: (id: string) => ['assessments', 'builder', id] as const,
  builderSubjects: ['assessments', 'builder-subjects'] as const,
  builderModules: (subjectId: string) => ['assessments', 'builder-modules', subjectId] as const,
  result: (id: string) => ['assessments', 'result', id] as const,
  answer: (id: string) => ['assessments', 'answer', id] as const
};

export function useAssessmentsApi() {
  const client = useSessionClient();
  return useMemo(() => createAssessmentsApi(client), [client]);
}

export function useAssessmentFilesApi() {
  const client = useSessionClient();
  return useMemo(() => createFilesApi(client), [client]);
}

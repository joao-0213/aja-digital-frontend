'use client';

import { useMemo } from 'react';
import { useSessionClient } from '@/providers/app-context';
import { createMaterialsApi } from '../api';

export const materialKeys = {
  all: ['materials'] as const,
  list: (subjectId: string, search: string, type: string) =>
    ['materials', 'list', subjectId, search, type] as const,
  subjects: ['materials', 'subjects'] as const,
  detail: (id: string) => ['materials', 'detail', id] as const,
  navigation: (subjectId: string) => ['materials', 'navigation', subjectId] as const,
  outline: (subjectId: string) => ['materials', 'outline', subjectId] as const,
  progress: (id: string) => ['materials', 'progress', id] as const,
  file: (fileId: string) => ['materials', 'file', fileId] as const,
  moduleList: (moduleId: string) => ['materials', 'module', moduleId] as const,
  composerOutline: (subjectId: string) => ['materials', 'composer-outline', subjectId] as const
};

export function useMaterialsApi() {
  const client = useSessionClient();
  return useMemo(() => createMaterialsApi(client), [client]);
}

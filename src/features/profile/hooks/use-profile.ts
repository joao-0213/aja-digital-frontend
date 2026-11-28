'use client';

import { useCallback, useMemo } from 'react';
import { useSessionClient, useSession } from '@/providers/app-context';
import { useHttpQuery } from '@/hooks/use-http-query';
import { createProfileApi } from '../api';

export const profileKeys = {
  enrollments: (emailConfirmedAt?: string | null) =>
    ['profile', 'enrollments', emailConfirmedAt ?? ''] as const,
  subjects: ['profile', 'subjects'] as const
};

export function useProfileApi() {
  const client = useSessionClient();
  return useMemo(() => createProfileApi(client), [client]);
}

export function useProfileEnrollments(emailConfirmedAt?: string | null, enabled = true) {
  const { sessionKey } = useSession();
  const api = useProfileApi();
  return useHttpQuery(
    { sessionKey, key: profileKeys.enrollments(emailConfirmedAt) },
    useCallback((signal) => api.enrollments(signal), [api]),
    enabled
  );
}

export function useProfileSubjects(enabled = true) {
  const { sessionKey } = useSession();
  const api = useProfileApi();
  return useHttpQuery(
    { sessionKey, key: profileKeys.subjects },
    useCallback((signal) => api.assignedSubjects(signal), [api]),
    enabled
  );
}

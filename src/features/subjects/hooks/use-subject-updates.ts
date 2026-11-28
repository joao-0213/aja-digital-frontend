'use client';

import { useCallback, useMemo } from 'react';
import { useSession } from '@/providers/app-context';
import { useHttpQuery } from '@/hooks/use-http-query';
import type { SubjectSummary } from '../api';
import { useSubjectsApi } from './use-subjects';

/** A visit is only acknowledged after the API commits the observed snapshot. */
export function useSubjectVisit(subject: SubjectSummary | undefined) {
  const { sessionKey } = useSession();
  const api = useSubjectsApi();
  const id = subject?.id ?? '';
  const signature = JSON.stringify(subject?.publicationIds ?? []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new idempotency intent is intentionally generated for each session, subject and publication set
  const intent = useMemo(() => crypto.randomUUID(), [sessionKey, id, signature]);
  const visit = useHttpQuery(
    { sessionKey, key: ['subjects', 'visit', id, signature] },
    useCallback(
      (signal) => api.markVisit(id, JSON.parse(signature) as string[], intent, signal),
      [api, id, signature, intent]
    ),
    !!subject
  );
  return {
    ...visit,
    hasUpdates:
      visit.status === 'success' && visit.data
        ? visit.data.hasUpdates
        : (subject?.hasUpdates ?? false)
  };
}

import type { SessionClient } from '@/providers/session-client';
import { collectAllPages } from '@/lib/http-pagination';
import type { PaginatedResponse } from '@/models';
import type { SubjectSummary } from '@/features/subjects';

export function createProfileApi(client: Pick<SessionClient, 'readEnrollments' | 'request'>) {
  return {
    enrollments: (signal?: AbortSignal) => client.readEnrollments(signal),
    assignedSubjects: (signal?: AbortSignal) =>
      collectAllPages(
        (page, pageSignal) => {
          const search = new URLSearchParams({ page: String(page), pageSize: '20' });
          return client.request<PaginatedResponse<SubjectSummary>>(`/subjects?${search}`, {
            signal: pageSignal
          });
        },
        { signal }
      )
  };
}

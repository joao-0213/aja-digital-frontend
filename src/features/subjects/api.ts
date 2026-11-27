import type { SessionClient } from '@/providers/session-client';
import type { Subject, TrailModule } from '@/models/academic';
import type { User } from '@/models/user';

export interface SubjectSummary extends Subject {
  className: string;
  teachers: { id: string; name: string }[];
  canManageContent: boolean;
  hasUpdates: boolean;
  publicationIds: string[];
}
export interface SubjectDetail {
  subject: SubjectSummary;
  modules: TrailModule[];
  projections: {
    materials: { count: number };
    assessments: { count: number };
    announcements: { count: number };
  };
}
export interface SubjectPage {
  items: SubjectSummary[];
  page: number;
  pageSize: number;
  total: number;
}
export interface VisitDto {
  subjectId: string;
  seenAt: string | null;
  seenPublicationIds: string[];
  publicationIds: string[];
  hasUpdates: boolean;
}
export type SubjectFields = Pick<
  Subject,
  'classId' | 'name' | 'description' | 'teacherIds' | 'color' | 'icon'
>;
export type ModuleFields = Pick<TrailModule, 'title' | 'description'>;
export interface ModuleOrderCommand {
  expectedRevision: number;
  items: { id: string; expectedRevision: number }[];
}

export function createSubjectsApi(client: Pick<SessionClient, 'request'>) {
  return {
    list: (q: string, classId: string, page: number, signal?: AbortSignal) => {
      const search = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (q.trim()) search.set('q', q.trim());
      if (classId && classId !== 'all') search.set('classId', classId);
      return client.request<SubjectPage>(`/subjects?${search}`, { signal });
    },
    read: (id: string, signal?: AbortSignal) =>
      client.request<SubjectDetail>(`/subjects/${encodeURIComponent(id)}`, { signal }),
    readSubject: async (id: string) =>
      (await client.request<SubjectDetail>(`/subjects/${encodeURIComponent(id)}`)).subject,
    saveSubject: (
      fields: SubjectFields,
      revision: number,
      id: string | undefined,
      intent: string
    ) =>
      client.request<Subject>(id ? `/subjects/${encodeURIComponent(id)}` : '/subjects', {
        method: id ? 'PATCH' : 'POST',
        json: id ? { ...fields, expectedRevision: revision } : fields,
        headers: id ? undefined : { 'Idempotency-Key': intent }
      }),
    teachers: async (signal?: AbortSignal) => {
      const items: User[] = [];
      for (let page = 1; ; page++) {
        const result = await client.request<{ items: User[]; total: number }>(
          `/users?role=teacher&active=true&page=${page}&pageSize=100`,
          { signal }
        );
        items.push(...result.items);
        if (items.length >= result.total || !result.items.length) return items;
      }
    },
    readModule: (id: string) => client.request<TrailModule>(`/modules/${encodeURIComponent(id)}`),
    saveModule: (
      fields: ModuleFields,
      revision: number,
      subjectId: string,
      id: string | undefined,
      intent: string
    ) =>
      client.request<TrailModule>(id ? `/modules/${encodeURIComponent(id)}` : '/modules', {
        method: id ? 'PATCH' : 'POST',
        json: id ? { ...fields, expectedRevision: revision } : { ...fields, subjectId },
        headers: id ? undefined : { 'Idempotency-Key': intent }
      }),
    reorderModules: (id: string, command: ModuleOrderCommand) =>
      client.request<{ items: TrailModule[]; total: number }>(
        `/subjects/${encodeURIComponent(id)}/reorder-modules`,
        { method: 'POST', json: command }
      ),
    readVisit: (id: string, signal?: AbortSignal) =>
      client.request<VisitDto>(`/subjects/${encodeURIComponent(id)}/visits`, { signal }),
    markVisit: (
      id: string,
      publicationIds: readonly string[],
      intent = crypto.randomUUID(),
      signal?: AbortSignal
    ) =>
      client.request<VisitDto>(`/subjects/${encodeURIComponent(id)}/visits`, {
        method: 'POST',
        json: { publicationIds: [...publicationIds] },
        headers: { 'Idempotency-Key': intent },
        signal
      })
  };
}

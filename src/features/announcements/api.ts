import type { SessionClient } from '@/providers/session-client';
import type { PaginatedResponse } from '@/models';
import { collectAllPages } from '@/lib/http-pagination';

export const announcementsPath = '/avisos';

export interface AnnouncementDto {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  classId: string;
  subjectId: string | null;
  title: string;
  body: string;
  notify: boolean;
  occurrence: { date: string; time?: string; allDay: boolean } | null;
  author: { id: string; name: string };
}
export type AnnouncementPage = PaginatedResponse<AnnouncementDto>;
export interface AnnouncementFields {
  classId: string;
  subjectId: string | null;
  title: string;
  body: string;
  notify: boolean;
  occurrence: { date: string; time?: string; allDay: boolean } | null;
}
export interface AnnouncementFilter {
  classId?: string;
  subjectId?: string;
  q?: string;
}
export interface AnnouncementOptions {
  classes: { id: string; name: string; active: boolean; deletedAt?: string }[];
  subjects: { id: string; classId: string; name: string; canManageContent: boolean }[];
}

export function createAnnouncementsApi(client: Pick<SessionClient, 'request'>) {
  return {
    options: async (signal?: AbortSignal): Promise<AnnouncementOptions> => {
      const load = <T>(path: string) =>
        collectAllPages<T>(
          (page, pageSignal) =>
            client.request<{ items: T[]; total: number }>(`${path}?page=${page}&pageSize=100`, {
              signal: pageSignal
            }),
          { signal }
        );
      const [classes, subjects] = await Promise.all([
        load<AnnouncementOptions['classes'][number]>('/classes'),
        load<AnnouncementOptions['subjects'][number]>('/subjects')
      ]);
      return { classes, subjects };
    },
    list: (filters: AnnouncementFilter, page: number, signal?: AbortSignal) => {
      const search = new URLSearchParams({
        page: String(page),
        pageSize: '100',
        sort: '-createdAt'
      });
      for (const key of ['classId', 'subjectId', 'q'] as const)
        if (filters[key]) search.set(key, filters[key]!);
      return client.request<AnnouncementPage>(`/announcements?${search}`, { signal });
    },
    all: (filters: AnnouncementFilter, signal?: AbortSignal) =>
      collectAllPages(
        (page, pageSignal) =>
          client.request<AnnouncementPage>(
            `/announcements?${new URLSearchParams({ page: String(page), pageSize: '100', sort: '-createdAt', ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)) })}`,
            { signal: pageSignal }
          ),
        { signal }
      ),
    read: (id: string, signal?: AbortSignal) =>
      client.request<AnnouncementDto>(`/announcements/${encodeURIComponent(id)}`, { signal }),
    create: (fields: AnnouncementFields, key: string) =>
      client.request<AnnouncementDto>('/announcements', {
        method: 'POST',
        json: fields,
        headers: { 'Idempotency-Key': key }
      }),
    edit: (id: string, fields: AnnouncementFields, expectedRevision: number) =>
      client.request<AnnouncementDto>(`/announcements/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        json: { ...fields, expectedRevision }
      }),
    withdraw: (id: string, expectedRevision: number) =>
      client.request<void>(`/announcements/${encodeURIComponent(id)}/withdraw`, {
        method: 'POST',
        json: { expectedRevision }
      })
  };
}

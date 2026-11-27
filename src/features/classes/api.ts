import type { SessionClient } from '@/providers/session-client';
import type { SchoolClass } from '@/models/academic';

export interface ClassPageDto {
  items: SchoolClass[];
  page: number;
  pageSize: number;
  total: number;
}
export type ClassFields = Pick<SchoolClass, 'name' | 'code' | 'year' | 'shift'>;

export function createClassesApi(client: Pick<SessionClient, 'request'>) {
  return {
    list: (q: string, inactive: boolean, page: number, signal?: AbortSignal) => {
      const search = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (q.trim()) search.set('q', q.trim());
      if (!inactive) search.set('active', 'true');
      return client.request<ClassPageDto>(`/classes?${search}`, { signal });
    },
    read: (id: string) => client.request<SchoolClass>(`/classes/${encodeURIComponent(id)}`),
    options: async (signal?: AbortSignal) => {
      const items: SchoolClass[] = [];
      for (let page = 1; ; page++) {
        const result = await client.request<ClassPageDto>(`/classes?page=${page}&pageSize=100`, {
          signal
        });
        items.push(...result.items);
        if (items.length >= result.total || !result.items.length) return items;
      }
    },
    save: (fields: ClassFields, revision: number, id: string | undefined, key: string) =>
      client.request<SchoolClass>(id ? `/classes/${encodeURIComponent(id)}` : '/classes', {
        method: id ? 'PATCH' : 'POST',
        json: id ? { ...fields, expectedRevision: revision } : fields,
        headers: id ? undefined : { 'Idempotency-Key': key }
      }),
    command: (id: string, action: 'close' | 'reopen', expectedRevision: number, key: string) =>
      client.request<SchoolClass>(`/classes/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
        json: { expectedRevision },
        headers: { 'Idempotency-Key': key }
      })
  };
}

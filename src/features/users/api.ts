import type { SessionClient } from '@/providers/session-client';
import type { User, Role } from '@/models/user';

export interface UsersPageDto {
  items: User[];
  page: number;
  pageSize: number;
  total: number;
}
export type UserFields = { name: string; email: string };

export function createUsersApi(client: Pick<SessionClient, 'request'>) {
  return {
    list: (q: string, role: string, page: number, signal?: AbortSignal) => {
      const search = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (q.trim()) search.set('q', q.trim());
      if (role !== 'all') search.set('role', role);
      return client.request<UsersPageDto>(`/users?${search}`, { signal });
    },
    read: (id: string) => client.request<User>(`/users/${encodeURIComponent(id)}`),
    save: (fields: UserFields, revision: number, id: string | undefined, key: string) =>
      client.request<User>(id ? `/users/${encodeURIComponent(id)}` : '/users', {
        method: id ? 'PATCH' : 'POST',
        json: id ? { ...fields, expectedRevision: revision } : { ...fields, role: 'teacher' },
        headers: id ? undefined : { 'Idempotency-Key': key }
      }),
    command: (
      id: string,
      action: 'role' | 'deactivate' | 'withdraw',
      expectedRevision: number,
      role?: Role
    ) => {
      if (!['role', 'deactivate', 'withdraw'].includes(action))
        throw new TypeError('Operação de usuário indisponível.');
      return client.request<User>(`/users/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
        json: { expectedRevision, ...(action === 'role' ? { role } : {}) }
      });
    }
  };
}

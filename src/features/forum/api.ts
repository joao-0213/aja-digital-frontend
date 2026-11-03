import type { SessionClient } from '@/providers/session-client';

export interface ForumAuthor { id: string; name: string }
export interface ForumReplyDto { id: string; revision: number; createdAt: string; updatedAt: string; updatedBy: string; author: ForumAuthor; body: string; voteCount: number; votedByMe: boolean; accepted: boolean }
export interface ForumAttachmentDto { id: string; name: string; size: number; mime: string; purpose: 'forum'; parentId: string; status: 'staged' | 'attached'; downloadUrl: string }
export interface ForumReferenceDto { title: string; preview: string; href: string }
export interface ForumTopicDto { id: string; revision: number; createdAt: string; updatedAt: string; updatedBy: string; classId: string; subjectId: string; title: string; body: string; tags: string[]; target: { type: 'question' | 'material'; id: string } | null; attachmentId: string | null; author: ForumAuthor; replies: ForumReplyDto[]; read: boolean; attachment: ForumAttachmentDto | null; legacyReference: string | null; legacyAttachmentName: string | null; reference?: ForumReferenceDto | null }
export interface ForumPageDto { items: ForumTopicDto[]; page: number; pageSize: number; total: number }
export interface ForumOptions { classes: { id: string; name: string; active: boolean }[]; subjects: { id: string; classId: string; name: string; canManageContent: boolean }[] }
export interface ForumFilter { classId?: string; subjectId?: string; q?: string; unread?: boolean; solved?: boolean; sort?: 'createdAt' | '-createdAt' }
export interface ForumTopicFields { classId: string; subjectId: string; title: string; body: string; tags: string[]; target: ForumTopicDto['target']; attachmentId: string | null }

export function createForumApi(client: Pick<SessionClient, 'request'>) {
  return {
    options: async (signal?: AbortSignal): Promise<ForumOptions> => {
      const load = async <T,>(path: string) => {
        const items: T[] = [];
        for (let page = 1; ; page++) {
          const result = await client.request<{ items: T[]; total: number }>(`${path}?page=${page}&pageSize=100`, { signal });
          items.push(...result.items); if (items.length >= result.total || !result.items.length) return items;
        }
      };
      const [classes, subjects] = await Promise.all([load<ForumOptions['classes'][number]>('/classes'), load<ForumOptions['subjects'][number]>('/subjects')]);
      return { classes, subjects };
    },
    list: (filters: ForumFilter, page: number, signal?: AbortSignal) => {
      const params = new URLSearchParams({ page: String(page), pageSize: '100', sort: filters.sort ?? '-createdAt' });
      for (const key of ['classId', 'subjectId', 'q', 'unread', 'solved'] as const) {
        const value = filters[key]; if (value !== undefined && value !== '') params.set(key, String(value));
      }
      return client.request<ForumPageDto>(`/topics?${params}`, { signal });
    },
    all: async (filters: ForumFilter, signal?: AbortSignal) => {
      const items: ForumTopicDto[] = [];
      for (let page = 1; ; page++) {
        const result = await client.request<ForumPageDto>(`/topics?${new URLSearchParams({ page: String(page), pageSize: '100', sort: filters.sort ?? '-createdAt', ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined && value !== '')) })}`, { signal });
        items.push(...result.items); if (items.length >= result.total || !result.items.length) return items;
      }
    },
    read: (id: string, signal?: AbortSignal) => client.request<ForumTopicDto>(`/topics/${encodeURIComponent(id)}`, { signal }),
    create: (fields: ForumTopicFields, key: string) => client.request<ForumTopicDto>('/topics', { method: 'POST', json: fields, headers: { 'Idempotency-Key': key } }),
    upload: (subjectId: string, file: File, key: string) => {
      const body = new FormData(); body.set('purpose', 'forum'); body.set('parentId', subjectId); body.set('file', file);
      return client.request<ForumAttachmentDto>('/files', { method: 'POST', body, headers: { 'Idempotency-Key': key } });
    },
    readFile: (id: string, signal?: AbortSignal) => client.request<ForumAttachmentDto>(`/files/${encodeURIComponent(id)}`, { signal }),
    readFileContent: (id: string, inline: boolean) => client.request<Blob>(`/files/${encodeURIComponent(id)}/content?disposition=${inline ? 'inline' : 'attachment'}`, { responseType: 'blob' }),
    discardFile: (id: string) => client.request<void>(`/files/${encodeURIComponent(id)}/discard`, { method: 'POST', json: {} }),
    markRead: (id: string) => client.request<ForumTopicDto>(`/topics/${encodeURIComponent(id)}/read`, { method: 'POST', json: {} }),
    reply: (id: string, body: string, key: string) => client.request<ForumTopicDto>(`/topics/${encodeURIComponent(id)}/replies`, { method: 'POST', json: { body }, headers: { 'Idempotency-Key': key } }),
    vote: (id: string, replyId: string, voted: boolean) => client.request<ForumTopicDto>(`/topics/${encodeURIComponent(id)}/replies/${encodeURIComponent(replyId)}/vote`, { method: 'POST', json: { voted } }),
    solution: (id: string, replyId: string | null, expectedRevision: number) => client.request<ForumTopicDto>(`/topics/${encodeURIComponent(id)}/solution`, { method: 'POST', json: { replyId, expectedRevision } }),
    withdrawTopic: (id: string, expectedRevision: number) => client.request<ForumTopicDto>(`/topics/${encodeURIComponent(id)}/withdraw`, { method: 'POST', json: { expectedRevision } }),
    withdrawReply: (id: string, replyId: string, expectedRevision: number) => client.request<ForumTopicDto>(`/topics/${encodeURIComponent(id)}/replies/${encodeURIComponent(replyId)}/withdraw`, { method: 'POST', json: { expectedRevision } })
  };
}

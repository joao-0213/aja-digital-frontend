import type { SessionClient } from '../../providers/session-client.ts';
import { createFilesApi, type HttpFile } from '../../lib/http-files.ts';
import type { SubjectSummary, SubjectDetail } from '@/features/subjects';
import type { TrailModule } from '../../models/academic.ts';
import type { MaterialKind } from '../../models/materials.ts';
import { HttpError } from '../../lib/http-client.ts';

export interface MaterialDto {
  id: string; revision: number; moduleId: string; title: string; kind: MaterialKind;
  duration: number; content: string; fileId: string | null; videoUrl: string | null;
  file: HttpFile | null; author: { id: string; name: string }; order: number;
  createdAt: string; updatedAt: string; updatedBy: string;
}
export interface MaterialDetail { material: MaterialDto; module: TrailModule; subject: SubjectSummary; canManageContent: boolean }
export interface MaterialPage { items: MaterialDto[]; page: number; pageSize: number; total: number }
export interface ProgressDto { id: string; revision: number; userId: string; materialId: string; completed: boolean; lastAccess: string }
export interface MaterialCreate { moduleId: string; title: string; kind: MaterialKind; duration: number; content: string; fileId: string | null; videoUrl: string | null }
export interface MaterialBatch { moduleId: string; expectedRevision: number; items: MaterialCreate[] }
export interface MaterialEdit { title: string; duration: number; content: string; videoUrl?: string }

export function createMaterialsApi(client: Pick<SessionClient, 'request'> & Partial<Pick<SessionClient, 'getSnapshot'>>) {
  const files = createFilesApi(client);
  const fence = (signal?: AbortSignal) => {
    const original = client.getSnapshot?.().sessionKey;
    return () => {
      const current = client.getSnapshot?.();
      if (signal?.aborted || current && (current.status !== 'authenticated' || current.sessionKey !== original)) throw new HttpError('cancelled', 'A sessão desta consulta mudou ou a consulta foi cancelada.');
    };
  };
  const list = (filters: { subjectId?: string; moduleId?: string }, page: number, signal?: AbortSignal) => {
    const search = new URLSearchParams({ page: String(page), pageSize: '100', sort: 'order' });
    if (filters.subjectId) search.set('subjectId', filters.subjectId);
    if (filters.moduleId) search.set('moduleId', filters.moduleId);
    return client.request<MaterialPage>(`/materials?${search}`, { signal });
  };
  const progressPage = (page: number, signal?: AbortSignal, subjectId?: string) => {
    const search = new URLSearchParams({ page: String(page), pageSize: '100' });
    if (subjectId) search.set('subjectId', subjectId);
    return client.request<{ items: ProgressDto[]; total: number }>(`/me/progress?${search}`, { signal });
  };
  return {
    files, list, progressPage,
    all: async (filters: { subjectId?: string; moduleId?: string }, signal?: AbortSignal) => {
      const items: MaterialDto[] = [];
      const guard = fence(signal);
      for (let page = 1; ; page++) {
        guard(); const result = await list(filters, page, signal); guard();
        items.push(...result.items);
        if (items.length >= result.total || !result.items.length) return items;
      }
    },
    read: (id: string, signal?: AbortSignal) => client.request<MaterialDetail>(`/materials/${encodeURIComponent(id)}`, { signal }),
    outline: (subjectId: string, signal?: AbortSignal) => client.request<SubjectDetail>(`/subjects/${encodeURIComponent(subjectId)}`, { signal }),
    context: async (moduleId: string, signal?: AbortSignal) => {
      const guard = fence(signal);
      guard(); const module = await client.request<TrailModule>(`/modules/${encodeURIComponent(moduleId)}`, { signal }); guard();
      const detail = await client.request<SubjectDetail>(`/subjects/${encodeURIComponent(module.subjectId)}`, { signal }); guard();
      return { module, subject: detail.subject };
    },
    edit: (id: string, fields: MaterialEdit, expectedRevision: number) => client.request<MaterialDto>(`/materials/${encodeURIComponent(id)}`, { method: 'PATCH', json: { ...fields, expectedRevision } }),
    batch: (command: MaterialBatch, intent: string, signal?: AbortSignal) => client.request<MaterialPage>('/materials/batch', { method: 'POST', json: command, headers: { 'Idempotency-Key': intent }, signal }),
    reorder: (id: string, command: { expectedRevision: number; items: { id: string; expectedRevision: number }[] }) => client.request<MaterialPage>(`/modules/${encodeURIComponent(id)}/reorder-materials`, { method: 'POST', json: command }),
    progress: (materialId: string, completed?: true, signal?: AbortSignal) => client.request<ProgressDto>('/me/progress', { method: 'PATCH', json: { materialId, ...(completed ? { completed } : {}) }, signal }),
    allProgress: async (subjectId?: string, signal?: AbortSignal) => {
      const items: ProgressDto[] = [];
      const guard = fence(signal);
      for (let page = 1; ; page++) {
        guard(); const result = await progressPage(page, signal, subjectId); guard();
        items.push(...result.items);
        if (items.length >= result.total || !result.items.length) return items;
      }
    }
  };
}

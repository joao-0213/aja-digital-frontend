import type { HttpRequestOptions } from './http-client.ts';

export interface HttpFile {
  id: string; name: string; size: number; mime: string;
  purpose: 'material' | 'work' | 'forum' | 'question'; parentId: string;
  status: 'staged' | 'attached'; downloadUrl: string;
}

interface Transport { request<T>(path: string, options?: HttpRequestOptions): Promise<T> }

/** Shared file transport; domain rules remain on the authenticated service. */
export function createFilesApi(client: Transport) {
  return {
    upload: (purpose: Exclude<HttpFile['purpose'], 'question'>, parentId: string, file: File, intent: string, signal?: AbortSignal) => {
      const body = new FormData();
      body.set('purpose', purpose);
      body.set('parentId', parentId);
      body.set('file', file, file.name);
      return client.request<HttpFile>('/files', { method: 'POST', body, headers: { 'Idempotency-Key': intent }, signal });
    },
    metadata: (id: string, signal?: AbortSignal) => client.request<HttpFile>(`/files/${encodeURIComponent(id)}`, { signal }),
    download: (id: string, disposition: 'inline' | 'attachment' = 'attachment', signal?: AbortSignal) => client.request<Blob>(`/files/${encodeURIComponent(id)}/content?disposition=${disposition}`, { responseType: 'blob', signal }),
    discard: (id: string, signal?: AbortSignal) => client.request<void>(`/files/${encodeURIComponent(id)}/discard`, { method: 'POST', json: {}, signal })
  };
}

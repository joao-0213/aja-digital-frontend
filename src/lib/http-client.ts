export type HttpErrorKind = 'session' | 'forbidden' | 'not-found' | 'conflict' | 'validation' | 'unavailable' | 'timeout' | 'cancelled' | 'invalid-response' | 'http';

export class HttpError extends Error {
  readonly kind: HttpErrorKind;
  readonly status?: number;
  readonly code?: string;
  readonly requestId?: string;
  readonly details?: unknown;

  constructor(kind: HttpErrorKind, message: string, info: { status?: number; code?: string; requestId?: string; details?: unknown } = {}) {
    super(message);
    this.name = 'HttpError';
    this.kind = kind;
    this.status = info.status;
    this.code = info.code;
    this.requestId = info.requestId;
    this.details = info.details;
  }
}

export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  json?: unknown;
  body?: BodyInit;
  headers?: HeadersInit;
  signal?: AbortSignal;
  timeoutMs?: number;
  responseType?: 'json' | 'blob';
}

function errorKind(status: number): HttpErrorKind {
  if (status === 401) return 'session';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  if (status === 409) return 'conflict';
  if (status === 422) return 'validation';
  if (status === 503) return 'unavailable';
  return 'http';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createHttpClient(config: { baseUrl?: string; fetch?: typeof fetch; timeoutMs?: number } = {}) {
  // Literal env access lets Next.js inline the public URL in the static export.
  const base = new URL(config.baseUrl ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3002/api/v1');
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new TypeError('URL da API inválida.');
  base.pathname = base.pathname.replace(/\/$/, '');
  const fetchRequest = config.fetch ?? globalThis.fetch;

  async function request<T = unknown>(path: string, options: HttpRequestOptions = {}): Promise<T> {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || path.includes('#')) throw new TypeError('Use um caminho relativo à API.');
    const url = new URL(base.href + path);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname + '/')) throw new TypeError('Caminho fora da API.');
    if (options.json !== undefined && options.body !== undefined) throw new TypeError('Informe JSON ou corpo binário, não ambos.');
    const timeoutMs = options.timeoutMs ?? config.timeoutMs ?? 15000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('Tempo limite inválido.');
    const controller = new AbortController();
    let timedOut = false;
    const cancel = () => controller.abort();
    if (options.signal?.aborted) cancel();
    else options.signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const headers = new Headers(options.headers);
    headers.set('Accept', options.responseType === 'blob' ? 'application/octet-stream' : 'application/json');
    if (options.json !== undefined) headers.set('Content-Type', 'application/json');
    try {
      const response = await fetchRequest(url, {
        method: options.method ?? 'GET',
        headers,
        body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
        signal: controller.signal,
        credentials: 'include',
        cache: 'no-store',
        redirect: 'error'
      });
      if (!response.ok) {
        let payload: unknown;
        try { payload = await response.json(); } catch { /* A proxy may return a non-JSON error page. */ }
        const error = isRecord(payload) && isRecord(payload.error) ? payload.error : {};
        throw new HttpError(errorKind(response.status), typeof error.message === 'string' ? error.message : 'Não foi possível concluir a operação.', {
          status: response.status,
          code: typeof error.code === 'string' ? error.code : undefined,
          requestId: typeof error.requestId === 'string' ? error.requestId : undefined,
          details: error.details
        });
      }
      if (response.status === 204 || response.status === 205) return undefined as T;
      if (options.responseType === 'blob') return await response.blob() as T;
      const body = await response.text();
      if (!body.trim()) return undefined as T;
      try { return JSON.parse(body) as T; }
      catch { throw new HttpError('invalid-response', 'O serviço retornou uma resposta inválida.', { status: response.status }); }
    } catch (error: unknown) {
      if (options.signal?.aborted) throw new HttpError('cancelled', 'Consulta cancelada.');
      if (timedOut) throw new HttpError('timeout', 'O serviço demorou para responder. Tente novamente.');
      if (error instanceof HttpError) throw error;
      throw new HttpError('unavailable', 'Serviço indisponível. Tente novamente.');
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
    }
  }

  return { request };
}

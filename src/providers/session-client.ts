import type { User } from '../models/user.ts';
import { HttpError, type HttpRequestOptions } from '../lib/http-client.ts';

export interface SessionState {
  status: 'loading' | 'authenticated' | 'anonymous' | 'error';
  user: User | null;
  expiresAt: string | null;
  sessionKey: string;
  resourceEpoch: number;
  error?: Error;
}

interface SessionDto { user: User; expiresAt: string; sessionId: string }
interface Transport { request<T>(path: string, options?: HttpRequestOptions): Promise<T> }
interface ProfileDraft { name: string; revision: number }

/** Memory-only identity. The HTTP cookie is the sole source of session truth. */
export function createSessionClient(http: Transport) {
  let version = 0;
  let state: SessionState = { status: 'loading', user: null, expiresAt: null, sessionKey: 'session-0', resourceEpoch: 0 };
  let pending: AbortController | undefined;
  let sessionId: string | undefined;
  // Unpublished profile text stays in memory during a transient outage, hidden
  // until exactly the same verified session returns. No password is buffered.
  let draftOwner: string | undefined;
  let profileDraft: ProfileDraft | undefined;
  const compositions = new Map<string, unknown>();
  const discardDraft = () => { draftOwner = undefined; profileDraft = undefined; compositions.clear(); };
  const listeners = new Set<() => void>();
  const publish = (next: Omit<SessionState, 'resourceEpoch'> & { resourceEpoch?: number }) => { state = { ...next, resourceEpoch: next.resourceEpoch ?? state.resourceEpoch }; listeners.forEach(listener => listener()); };
  const begin = (status: SessionState['status']) => {
    pending?.abort();
    pending = new AbortController();
    const current = ++version;
    sessionId = undefined;
    discardDraft();
    publish({ status, user: null, expiresAt: null, sessionKey: `session-${current}` });
    return { current, signal: pending.signal };
  };
  const save = (session: SessionDto, current: number, preserveKey?: string) => {
    if (current === version) {
      const owner = JSON.stringify([session.sessionId, session.user.id, session.user.role, 'profile']);
      if (owner !== draftOwner) { profileDraft = undefined; compositions.clear(); }
      draftOwner = owner;
      sessionId = session.sessionId;
      publish({ status: 'authenticated', user: session.user, expiresAt: session.expiresAt, sessionKey: preserveKey ?? `session-${current}`, resourceEpoch: state.resourceEpoch + 1 });
    }
  };
  async function refresh() {
    const previous = state;
    pending?.abort();
    pending = new AbortController();
    const current = ++version;
    if (!previous.user) publish({ status: 'loading', user: null, expiresAt: null, sessionKey: `session-${current}` });
    try {
      const session = await http.request<SessionDto>('/auth/session', { signal: pending.signal });
      const sameSession = !!sessionId && sessionId === session.sessionId && previous.user?.id === session.user.id && previous.user.role === session.user.role && previous.expiresAt === session.expiresAt;
      save(session, current, sameSession ? previous.sessionKey : undefined);
    }
    catch (error: unknown) {
      if (current !== version) return;
      sessionId = undefined;
      if (error instanceof HttpError && (error.kind === 'session' || error.kind === 'forbidden')) discardDraft();
      publish({ user: null, expiresAt: null, sessionKey: `session-${current}`, status: error instanceof HttpError && error.kind === 'session' ? 'anonymous' : 'error', error: error instanceof Error ? error : new Error('Não foi possível consultar a sessão.') });
    }
  }
  async function login(email: string, password: string) {
    const { current, signal } = begin('loading');
    try { save(await http.request<SessionDto>('/auth/login', { method: 'POST', json: { email, password }, signal }), current); }
    catch (error: unknown) {
      if (current === version) publish({ ...state, status: 'anonymous', error: error instanceof Error ? error : new Error('Não foi possível entrar.') });
      throw error;
    }
  }
  async function logout() {
    begin('anonymous');
    await http.request('/auth/logout', { method: 'POST' });
  }
  async function updateProfile(name: string, expectedRevision: number) {
    const current = version;
    try {
      const user = await http.request<User>('/me', { method: 'PATCH', json: { name, expectedRevision } });
      if (current === version && state.user) {
        profileDraft = undefined;
        if (state.user.id !== user.id || state.user.role !== user.role) {
          discardDraft();
          pending?.abort();
          version++;
          publish({ ...state, user, sessionKey: `session-${version}` });
        } else publish({ ...state, user });
      }
      return user;
    } catch (error: unknown) {
      if (current === version && error instanceof HttpError && error.kind === 'session') begin('anonymous');
      throw error;
    }
  }
  async function protectedRequest<T>(path: string, options?: HttpRequestOptions) {
    const current = version;
    try { return await http.request<T>(path, options); }
    catch (error: unknown) {
      if (current === version && error instanceof HttpError && error.kind === 'session') begin('anonymous');
      throw error;
    }
  }
  return {
    getSnapshot: () => state,
    readProfileDraft: () => state.status === 'authenticated' && sessionId && profileDraft ? { ...profileDraft } : undefined,
    saveProfileDraft: (draft: ProfileDraft) => {
      if (state.status === 'authenticated' && sessionId && draftOwner) profileDraft = { ...draft };
    },
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    refresh, login, logout, updateProfile,
    register: (name: string, email: string, password: string) => http.request<User>('/auth/register', { method: 'POST', json: { name, email, password } }),
    requestConfirmation: (email: string) => http.request<{ message: string }>('/auth/email-confirmation-requests', { method: 'POST', json: { email } }),
    confirmEmail: (token: string) => http.request<User>('/auth/email-confirmations', { method: 'POST', json: { token } }),
    requestRecovery: (email: string) => http.request<{ message: string }>('/auth/password-reset-requests', { method: 'POST', json: { email } }),
    resetPassword: (token: string, password: string) => http.request<{ message: string }>('/auth/password-resets', { method: 'POST', json: { token, password } }),
    request: protectedRequest,
    readDraft: <T>(context: string): T | undefined => state.status === 'authenticated' && sessionId ? structuredClone(compositions.get(context)) as T | undefined : undefined,
    saveDraft: <T>(context: string, value: T, expectedSessionKey: string) => {
      if (state.status === 'authenticated' && sessionId && state.sessionKey === expectedSessionKey) compositions.set(context, structuredClone(value));
    },
    clearDraft: (context: string, expectedSessionKey: string) => { if (state.sessionKey === expectedSessionKey) compositions.delete(context); },
    readProfile: () => protectedRequest<User>('/me'),
    readEnrollments: (signal?: AbortSignal) => protectedRequest<{ items: { id: string; classId: string; className: string | null; status: string; enrolledAt: string | null }[] }>('/me/enrollments', { signal }),
    dispose: () => { version++; pending?.abort(); discardDraft(); listeners.clear(); }
  };
}

export type SessionClient = ReturnType<typeof createSessionClient>;

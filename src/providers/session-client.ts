import type { User } from '@/models/user';
import { HttpError, type HttpRequestOptions } from '@/lib/http-client';
import { createHttpQueryCache, type QueryKey } from '@/lib/http-query';
import { createMemoryDraftStore } from './memory-draft-store';

export interface SessionState {
  status: 'loading' | 'authenticated' | 'anonymous' | 'error';
  user: User | null;
  sessionId: string | null;
  expiresAt: string | null;
  sessionKey: string;
  resourceEpoch: number;
  error?: Error;
}

interface SessionDto {
  user: User;
  expiresAt: string;
  sessionId: string;
}
interface Transport {
  request<T>(path: string, options?: HttpRequestOptions): Promise<T>;
}

/** Memory-only identity. The HTTP cookie is the sole source of session truth. */
export function createSessionClient(http: Transport) {
  let version = 0;
  let state: SessionState = {
    status: 'loading',
    user: null,
    sessionId: null,
    expiresAt: null,
    sessionKey: 'session-0',
    resourceEpoch: 0
  };
  let pending: AbortController | undefined;
  let sessionId: string | undefined;
  const draftStore = createMemoryDraftStore();
  const discardDraft = () => {
    draftStore.clearAll();
  };
  const queryCache = createHttpQueryCache();
  queryCache.setSessionKey(state.sessionKey);
  const listeners = new Set<() => void>();
  const publish = (next: Omit<SessionState, 'resourceEpoch'> & { resourceEpoch?: number }) => {
    state = { ...next, resourceEpoch: next.resourceEpoch ?? state.resourceEpoch };
    queryCache.setSessionKey(state.sessionKey);
    listeners.forEach((listener) => listener());
  };
  const begin = (status: SessionState['status']) => {
    pending?.abort();
    pending = new AbortController();
    const current = ++version;
    sessionId = undefined;
    discardDraft();
    publish({
      status,
      user: null,
      sessionId: null,
      expiresAt: null,
      sessionKey: `session-${current}`
    });
    return { current, signal: pending.signal };
  };
  const save = (session: SessionDto, current: number, preserveKey?: string) => {
    if (current === version) {
      const owner = JSON.stringify([
        session.sessionId,
        session.user.id,
        session.user.role,
        'profile'
      ]);
      draftStore.setOwner(owner);
      sessionId = session.sessionId;
      publish({
        status: 'authenticated',
        user: session.user,
        sessionId: session.sessionId,
        expiresAt: session.expiresAt,
        sessionKey: preserveKey ?? `session-${current}`,
        resourceEpoch: state.resourceEpoch + 1
      });
    }
  };
  async function refresh() {
    const previous = state;
    pending?.abort();
    pending = new AbortController();
    const current = ++version;
    if (!previous.user)
      publish({
        status: 'loading',
        user: null,
        sessionId: null,
        expiresAt: null,
        sessionKey: `session-${current}`
      });
    try {
      const session = await http.request<SessionDto>('/auth/session', { signal: pending.signal });
      const sameSession =
        !!sessionId &&
        sessionId === session.sessionId &&
        previous.user?.id === session.user.id &&
        previous.user.role === session.user.role &&
        previous.expiresAt === session.expiresAt;
      save(session, current, sameSession ? previous.sessionKey : undefined);
      if (sameSession) void queryCache.revalidateActiveQueries();
    } catch (error: unknown) {
      if (current !== version) return;
      sessionId = undefined;
      if (error instanceof HttpError && (error.kind === 'session' || error.kind === 'forbidden'))
        discardDraft();
      publish({
        user: null,
        sessionId: null,
        expiresAt: null,
        sessionKey: `session-${current}`,
        status: error instanceof HttpError && error.kind === 'session' ? 'anonymous' : 'error',
        error: error instanceof Error ? error : new Error('Não foi possível consultar a sessão.')
      });
    }
  }
  async function login(email: string, password: string) {
    const { current, signal } = begin('loading');
    try {
      save(
        await http.request<SessionDto>('/auth/login', {
          method: 'POST',
          json: { email, password },
          signal
        }),
        current
      );
    } catch (error: unknown) {
      if (current === version)
        publish({
          ...state,
          status: 'anonymous',
          error: error instanceof Error ? error : new Error('Não foi possível entrar.')
        });
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
      const user = await http.request<User>('/me', {
        method: 'PATCH',
        json: { name, expectedRevision }
      });
      if (current === version && state.user) {
        if (state.user.id !== user.id || state.user.role !== user.role) {
          discardDraft();
          pending?.abort();
          version++;
          publish({ ...state, user, sessionKey: `session-${version}` });
        } else publish({ ...state, user });
      }
      return user;
    } catch (error: unknown) {
      if (current === version && error instanceof HttpError && error.kind === 'session')
        begin('anonymous');
      throw error;
    }
  }
  async function protectedRequest<T>(path: string, options?: HttpRequestOptions) {
    const current = version;
    try {
      return await http.request<T>(path, options);
    } catch (error: unknown) {
      if (current === version && error instanceof HttpError && error.kind === 'session')
        begin('anonymous');
      throw error;
    }
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh,
    login,
    logout,
    updateProfile,
    register: (name: string, email: string, password: string) =>
      http.request<User>('/auth/register', { method: 'POST', json: { name, email, password } }),
    requestConfirmation: (email: string) =>
      http.request<{ message: string }>('/auth/email-confirmation-requests', {
        method: 'POST',
        json: { email }
      }),
    confirmEmail: (token: string) =>
      http.request<User>('/auth/email-confirmations', { method: 'POST', json: { token } }),
    requestRecovery: (email: string) =>
      http.request<{ message: string }>('/auth/password-reset-requests', {
        method: 'POST',
        json: { email }
      }),
    resetPassword: (token: string, password: string) =>
      http.request<{ message: string }>('/auth/password-resets', {
        method: 'POST',
        json: { token, password }
      }),
    request: protectedRequest,
    readDraft: <T>(context: string): T | undefined =>
      state.status === 'authenticated' && sessionId ? draftStore.readDraft<T>(context) : undefined,
    saveDraft: <T>(context: string, value: T, expectedSessionKey: string) => {
      if (state.status === 'authenticated' && sessionId && state.sessionKey === expectedSessionKey)
        draftStore.saveDraft(context, value);
    },
    readDraftExtra: <T>(context: string): T | undefined =>
      state.status === 'authenticated' && sessionId
        ? draftStore.readDraftExtra<T>(context)
        : undefined,
    saveDraftExtra: <T>(context: string, value: T, expectedSessionKey: string) => {
      if (state.status === 'authenticated' && sessionId && state.sessionKey === expectedSessionKey)
        draftStore.saveDraftExtra(context, value);
    },
    clearDraft: (context: string, expectedSessionKey: string) => {
      if (state.sessionKey === expectedSessionKey) {
        draftStore.clearDraft(context);
      }
    },
    readProfile: () => protectedRequest<User>('/me'),
    readEnrollments: (signal?: AbortSignal) =>
      protectedRequest<{
        items: {
          id: string;
          classId: string;
          className: string | null;
          status: string;
          enrolledAt: string | null;
        }[];
      }>('/me/enrollments', { signal }),
    queryCache,
    invalidateQueries: (prefix?: QueryKey) => queryCache.invalidateQueries(prefix),
    revalidateQueries: () => queryCache.revalidateActiveQueries(),
    dispose: () => {
      version++;
      pending?.abort();
      discardDraft();
      queryCache.clear();
      listeners.clear();
    }
  };
}

export type SessionClient = ReturnType<typeof createSessionClient>;

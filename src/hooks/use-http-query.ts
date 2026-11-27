'use client';

import { useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import {
  createHttpQueryCache,
  serializeQueryKey,
  type HttpQueryLoader,
  type QueryKey
} from '@/lib/http-query';
import { SessionContext } from '@/providers/app-context';

export interface UseHttpQueryOptions {
  enabled?: boolean;
  keepPreviousData?: boolean;
}

/** Keep load stable with useCallback; include all result inputs in identity.key. */
export function useHttpQuery<T>(
  identity: { sessionKey: string; key: QueryKey },
  load: HttpQueryLoader<T>,
  enabledOrOptions: boolean | UseHttpQueryOptions = true
) {
  const { sessionKey, key } = identity;
  const enabled =
    typeof enabledOrOptions === 'boolean' ? enabledOrOptions : (enabledOrOptions.enabled ?? true);
  const keepPreviousData =
    typeof enabledOrOptions === 'boolean' ? false : Boolean(enabledOrOptions.keepPreviousData);

  const sessionClient = useContext(SessionContext);
  const fallbackCache = useMemo(() => createHttpQueryCache(), []);
  const cache = sessionClient?.queryCache ?? fallbackCache;
  if (!sessionClient) cache.setSessionKey(sessionKey);

  const serializedKey = serializeQueryKey(key);
  const previousRef = useRef<{ sessionKey: string; data: T } | undefined>(undefined);

  // biome-ignore lint/correctness/useExhaustiveDependencies: serializedKey captures the canonical QueryKey
  const subscribe = useCallback(
    (listener: () => void) => cache.subscribe(sessionKey, key, listener),
    [cache, sessionKey, serializedKey]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: serializedKey captures the canonical QueryKey
  const getSnapshot = useCallback(
    () => cache.getSnapshot<T>(sessionKey, key),
    [cache, sessionKey, serializedKey]
  );

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // biome-ignore lint/correctness/useExhaustiveDependencies: serializedKey captures the canonical QueryKey
  useEffect(() => {
    if (enabled) void cache.ensure(sessionKey, key, load);
  }, [cache, sessionKey, serializedKey, load, enabled]);

  if (state.status === 'success' && state.data !== undefined) {
    previousRef.current = { sessionKey, data: state.data };
  } else if (state.status === 'error' || previousRef.current?.sessionKey !== sessionKey) {
    previousRef.current = undefined;
  }

  const hasPreviousSameSession =
    keepPreviousData &&
    enabled &&
    (state.status === 'idle' || state.status === 'loading') &&
    previousRef.current?.sessionKey === sessionKey;

  const data = enabled
    ? state.data !== undefined
      ? state.data
      : hasPreviousSameSession
        ? previousRef.current?.data
        : undefined
    : undefined;

  const error = enabled ? state.error : undefined;
  const loading =
    enabled && !hasPreviousSameSession && (state.status === 'idle' || state.status === 'loading');
  const revalidating = enabled && (state.revalidating || hasPreviousSameSession);

  // biome-ignore lint/correctness/useExhaustiveDependencies: serializedKey captures the canonical QueryKey
  const retry = useCallback(
    () => cache.retry(sessionKey, key, load),
    [cache, sessionKey, serializedKey, load]
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: serializedKey captures the canonical QueryKey
  const invalidate = useCallback(
    () => cache.ensure(sessionKey, key, load, { force: true, silent: true }),
    [cache, sessionKey, serializedKey, load]
  );

  return {
    status: hasPreviousSameSession ? ('success' as const) : state.status,
    data,
    error,
    loading,
    revalidating,
    retry,
    invalidate
  };
}

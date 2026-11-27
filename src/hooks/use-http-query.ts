'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { createHttpQuery, type HttpQueryIdentity, type HttpQueryLoader } from '@/lib/http-query';

/** Keep load stable with useCallback; include all result inputs in identity.key. */
export function useHttpQuery<T>(identity: HttpQueryIdentity, load: HttpQueryLoader<T>, enabled = true) {
  const { sessionKey, key } = identity;
  // A new controller hides the previous account/filter snapshot in this render,
  // before effect cleanup can abort the old request.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new controller per session/key hides the previous snapshot in this render
  const query = useMemo(() => createHttpQuery<T>(), [sessionKey, key]);
  const state = useSyncExternalStore(query.subscribe, query.getSnapshot, query.getSnapshot);
  useEffect(() => {
    if (enabled) void query.run({ sessionKey, key }, load);
    return query.cancel;
  }, [query, sessionKey, key, load, enabled]);
  return {
    ...state,
    data: enabled ? state.data : undefined,
    error: enabled ? state.error : undefined,
    loading: enabled && (state.status === 'idle' || state.status === 'loading'),
    retry: query.retry,
    invalidate: query.invalidate
  };
}

'use client';

import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import type { SessionClient } from './session-client';

export interface AppContextValue {
  notify: (message: string, error?: boolean) => void;
}

export const AppContext = createContext<AppContextValue | null>(null);
export const SessionContext = createContext<SessionClient | null>(null);

export function useSessionClient(): SessionClient {
  const client = useContext(SessionContext);
  if (!client) throw new Error('Providers missing');
  return client;
}

export function useSessionUser() {
  const client = useSessionClient();
  return useSyncExternalStore(
    client.subscribe,
    () => client.getSnapshot().user,
    () => client.getSnapshot().user
  );
}

export function useSessionStatus() {
  const client = useSessionClient();
  return useSyncExternalStore(
    client.subscribe,
    () => client.getSnapshot().status,
    () => client.getSnapshot().status
  );
}

export function useSession() {
  const client = useSessionClient();
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  return useMemo(
    () => ({ ...state, client, invalidateQueries: client.invalidateQueries }),
    [state, client]
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('Providers missing');
  return context;
}

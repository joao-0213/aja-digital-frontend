'use client';

import { createContext, useContext, useSyncExternalStore } from 'react';
import type { SessionClient } from './session-client';

export interface AppContextValue {
  notify: (message: string, error?: boolean) => void;
}

export const AppContext = createContext<AppContextValue | null>(null);
export const SessionContext = createContext<SessionClient | null>(null);

export function useSession() {
  const client = useContext(SessionContext);
  if (!client) throw new Error('Providers missing');
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  return { ...state, client, invalidateQueries: client.invalidateQueries };
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('Providers missing');
  return context;
}

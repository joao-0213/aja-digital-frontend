'use client';

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AppContext, SessionContext } from '@/providers/app-context';
import { createSessionClient } from '@/providers/session-client';
import { createHttpClient } from '@/lib/http-client';
import type { MockDatabase, User } from '@/models';
import { ToastRegion } from '@/components/shared/toast-region';
import { useToasts } from '@/components/shared/use-toasts';

// Preserve the existing consumer API while keeping composition separate from state.
export { useApp } from '@/providers/app-context';

export function Providers({ children }: { children: ReactNode }) {
  const { toasts, notify, dismiss } = useToasts();
  const [client] = useState(() => createSessionClient(createHttpClient()));
  const session = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  useEffect(() => {
    void client.refresh();
    const refresh = () => { if (document.visibilityState === 'visible') void client.refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      client.dispose();
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [client]);
  useEffect(() => {
    if (!session.expiresAt) return;
    const delay = Math.max(0, Date.parse(session.expiresAt) - Date.now());
    const timer = setTimeout(() => void client.refresh(), Math.min(delay, 2147483647));
    return () => clearTimeout(timer);
  }, [client, session.expiresAt]);
  const value = useMemo(() => {
    const user: User = session.user ?? { id: '', name: '', email: '', role: 'student', active: false };
    // Compatibility shape only: never read or write the browser's legacy database.
    const db: MockDatabase = { version: 1, audit: [], enrollments: [], users: session.user ? [user] : [], classes: [], subjects: [], modules: [], materials: [], questions: [], assessments: [], attempts: [], submissions: [], topics: [], announcements: [], events: [], attendance: [], progress: [] };
    const unavailable = () => notify('Esta área está temporariamente indisponível.', true);
    return { db, user, role: user.role, ready: session.status !== 'loading', busy: false, notify,
      setRole: unavailable, signIn: unavailable, lookupAccount: () => undefined,
      mutate: async () => { unavailable(); return false; }, reset: unavailable };
  }, [session, notify]);

  return <SessionContext.Provider value={client}><AppContext.Provider value={value}>
    {children}
    <ToastRegion toasts={toasts} onDismiss={dismiss} />
  </AppContext.Provider></SessionContext.Provider>;
}

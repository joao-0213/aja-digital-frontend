'use client';

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AppContext, SessionContext } from '@/providers/app-context';
import { createSessionClient } from '@/providers/session-client';
import { createHttpClient } from '@/lib/http-client';
import { useStudyTools } from '@/hooks/use-study-tools';
import { ToastRegion } from '@/components/shared/toast-region';
import { useToasts } from '@/components/shared/use-toasts';

// Preserve the existing consumer API while keeping composition separate from state.
export { useApp } from '@/providers/app-context';

export function Providers({ children }: { children: ReactNode }) {
  const { toasts, notify, dismiss } = useToasts();
  const [client] = useState(() => createSessionClient(createHttpClient()));
  const session = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  useStudyTools(client, session.sessionKey, session.status === 'authenticated');
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
  const value = useMemo(() => ({ notify }), [notify]);

  return <SessionContext.Provider value={client}><AppContext.Provider value={value}>
    {children}
    <ToastRegion toasts={toasts} onDismiss={dismiss} />
  </AppContext.Provider></SessionContext.Provider>;
}

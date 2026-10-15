'use client';

import type { ReactNode } from 'react';
import { AppContext } from '@/providers/app-context';
import { useDemoState } from '@/providers/use-demo-state';
import { useStudyTools } from '@/hooks/use-study-tools';
import { ToastRegion } from '@/components/shared/toast-region';
import { useToasts } from '@/components/shared/use-toasts';

// Preserve the existing consumer API while keeping composition separate from state.
export { useApp } from '@/providers/app-context';

export function Providers({ children }: { children: ReactNode }) {
  const { toasts, notify, dismiss } = useToasts();
  const state = useDemoState(notify);
  useStudyTools(state.db, state.user, state.mutate);

  return <AppContext.Provider value={{ ...state, notify }}>
    {children}
    <ToastRegion toasts={toasts} onDismiss={dismiss} />
  </AppContext.Provider>;
}

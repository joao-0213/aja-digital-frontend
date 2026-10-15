'use client';

import { createContext, useContext } from 'react';
import type { MockDatabase, Role, User } from '@/models';

export interface AppContextValue {
  db: MockDatabase;
  user: User;
  ready: boolean;
  busy: boolean;
  role: Role;
  setRole: (role: Role) => void;
  signIn: (id: string, role: Role) => void;
  mutate: (recipe: (draft: MockDatabase) => void, message?: string) => Promise<boolean>;
  notify: (message: string, error?: boolean) => void;
  reset: () => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('Providers missing');
  return context;
}

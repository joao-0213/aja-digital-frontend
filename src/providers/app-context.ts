'use client';

import { createContext, useContext } from 'react';
import type { MockDatabase, Role, User } from '@/models';
import type { MutationOptions } from '@/lib/demo-mutations';

export interface AppContextValue {
  db: MockDatabase;
  user: User;
  ready: boolean;
  busy: boolean;
  role: Role;
  setRole: (role: Role) => void;
  signIn: (id: string, role: Role) => void;
  lookupAccount: (email: string) => User | undefined;
  mutate: (recipe: (draft: MockDatabase) => void, message?: string, options?: MutationOptions) => Promise<boolean>;
  notify: (message: string, error?: boolean) => void;
  reset: () => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('Providers missing');
  return context;
}

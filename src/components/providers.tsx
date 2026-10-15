'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, X, AlertCircle } from 'lucide-react';
import type { MockDatabase, Role, User } from '@/models';
import { seed } from '@/mocks/database';
import { mockRequest } from '@/mocks/api';
import { removeMaterialFiles } from '@/lib/material-files';
import { useStudyTools } from '@/hooks/use-study-tools';
type Toast = {
  id: number;
  message: string;
  error: boolean;
};
interface Context {
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
const AppContext = createContext<Context | null>(null);
const KEY = 'aja-digital-demo-v1';
const ids: Record<Role, string> = {
  student: 'u1',
  teacher: 'u2',
  admin: 'u3'
};
export function Providers({
  children
}: {
  children: ReactNode;
}) {
  const [db, setDb] = useState<MockDatabase>(seed);
  const current = useRef(db);
  const [role, setRoleState] = useState<Role>('student');
  const [activeId, setActiveId] = useState('u1');
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = useCallback((message: string, error = false) => {
    const id = Date.now() + Math.random();
    setToasts(items => [...items, {
      id,
      message,
      error
    }]);
    setTimeout(() => setToasts(items => items.filter(item => item.id !== id)), 6000);
  }, []);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (isDatabase(parsed)) {
          current.current = parsed;
          setDb(parsed);
        } else localStorage.removeItem(KEY);
      }
      const savedRole = sessionStorage.getItem('aja-demo-role');
      if (savedRole === 'student' || savedRole === 'teacher' || savedRole === 'admin') setRoleState(savedRole);
    } catch {
      notify('O armazenamento local não está disponível. As alterações durarão apenas esta visita.', true);
    }
    setReady(true);
  }, [notify]);
  const mutate = useCallback(async (recipe: (draft: MockDatabase) => void, message?: string) => {
    setPending(count => count + 1);
    try {
      await mockRequest(() => true);
      const draft = structuredClone(current.current);
      recipe(draft);
      current.current = draft;
      setDb(draft);
      try {
        localStorage.setItem(KEY, JSON.stringify(draft));
      } catch {
        notify('Alteração salva nesta visita, mas não no armazenamento do navegador.', true);
      }
      if (message) notify(message);
      return true;
    } catch (error: unknown) {
      notify(error instanceof Error ? error.message : 'Ocorreu um erro.', true);
      return false;
    } finally {
      setPending(count => count - 1);
    }
  }, [notify]);
  const setRole = (next: Role) => {
    setRoleState(next);
    setActiveId(ids[next]);
    try {
      sessionStorage.setItem('aja-demo-role', next);
    } catch {}
  };
  const signIn = (id: string, next: Role) => {
    setRoleState(next);
    setActiveId(id);
  };
  const reset = () => {
    void removeMaterialFiles().catch(() => notify('Os dados foram restaurados, mas não foi possível remover os PDFs locais.', true));
    const fresh = structuredClone(seed);
    current.current = fresh;
    setDb(fresh);
    try {
      localStorage.removeItem(KEY);
    } catch {}
    notify('Demonstração restaurada.');
  };
  const user = db.users.find(item => item.id === activeId && item.role === role) ?? db.users.find(item => item.role === role) ?? db.users[0];
  useStudyTools(db, user, mutate);
  return <AppContext.Provider value={{
    db,
    user,
    role,
    ready,
    busy: pending > 0,
    setRole,
    signIn,
    mutate,
    notify,
    reset
  }}>
    {children}
    <div className="fixed bottom-5 right-4 z-[100] flex w-[min(26rem,calc(100vw_-_2rem))] flex-col gap-2" role="status" aria-live="polite">
      {toasts.map(toast => <div key={toast.id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
        {toast.error ? <AlertCircle className="mt-0.5 size-5 shrink-0 text-rose-600" /> : <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />}
        <p className="flex-1 text-sm leading-6">
          {toast.message}
        </p>
        <button aria-label="Fechar notificação" onClick={() => setToasts(items => items.filter(item => item.id !== toast.id))}>
          <X className="size-4" />
        </button>
      </div>)}
    </div>
  </AppContext.Provider>;
}
function isDatabase(value: unknown): value is MockDatabase {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<MockDatabase>;
  return item.version === 1 && ['users', 'classes', 'subjects', 'modules', 'materials', 'questions', 'assessments', 'attempts', 'topics', 'announcements', 'events', 'attendance', 'documents', 'progress'].every(key => Array.isArray(item[key as keyof MockDatabase]));
}
export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('Providers missing');
  return context;
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MockDatabase, Role } from '@/models';
import { seed } from '@/mocks/database';
import { mockRequest } from '@/mocks/api';
import { removeMaterialFiles } from '@/lib/material-files';
import { DEMO_DATABASE_KEY, DEMO_ROLE_KEY, isDatabase } from '@/lib/demo-storage';
import type { AppContextValue } from './app-context';

const ids: Record<Role, string> = {
  student: 'u1',
  teacher: 'u2',
  admin: 'u3'
};

// Cliente: mantém os dados e a sessão da demonstração no navegador.
export function useDemoState(notify: AppContextValue['notify']): Omit<AppContextValue, 'notify'> {
  const [db, setDb] = useState<MockDatabase>(seed);
  const current = useRef(db);
  const [role, setRoleState] = useState<Role>('student');
  const [activeId, setActiveId] = useState('u1');
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(0);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DEMO_DATABASE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (isDatabase(parsed)) {
          current.current = parsed;
          setDb(parsed);
        } else localStorage.removeItem(DEMO_DATABASE_KEY);
      }
      const savedRole = sessionStorage.getItem(DEMO_ROLE_KEY);
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
        localStorage.setItem(DEMO_DATABASE_KEY, JSON.stringify(draft));
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
      sessionStorage.setItem(DEMO_ROLE_KEY, next);
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
      localStorage.removeItem(DEMO_DATABASE_KEY);
    } catch {}
    notify('Demonstração restaurada.');
  };
  const user = db.users.find(item => item.id === activeId && item.role === role) ?? db.users.find(item => item.role === role) ?? db.users[0];

  return { db, user, role, ready, busy: pending > 0, setRole, signIn, mutate, reset };
}
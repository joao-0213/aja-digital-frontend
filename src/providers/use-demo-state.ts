'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MockDatabase, Role } from '@/models';
import { seed } from '@/mocks/database';
import { mockRequest } from '@/mocks/api';
import { removeMaterialFiles } from '@/lib/material-files';
import { DEMO_DATABASE_KEY, DEMO_ROLE_KEY, DEMO_USER_KEY, readDemoState } from '@/lib/demo-storage';
import { isDatabase, migrateDatabase } from '@/lib/demo-storage';
import { isActiveUser, scopeDatabase } from '@/lib/access';
import { applyDemoMutation, type MutationOptions } from '@/lib/demo-mutations';
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
  const actorId = useRef(activeId);
  actorId.current = activeId;
  const persisted = useRef<string | null>(null);
  const memoryOnly = useRef(false);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const restore = () => {
      if (cancelled) return;
      const restored = readDemoState({
        getItem: key => localStorage.getItem(key),
        setItem: (key, value) => localStorage.setItem(key, value),
        removeItem: key => localStorage.removeItem(key)
      }, { getItem: key => sessionStorage.getItem(key) });
      if (restored.database) {
        current.current = restored.database;
        setDb(restored.database);
      }
      if (restored.role) { setRoleState(restored.role); setActiveId(ids[restored.role]); }
      if (restored.userId) setActiveId(restored.userId);
      try { persisted.current = localStorage.getItem(DEMO_DATABASE_KEY); } catch { memoryOnly.current = true; }
      if (restored.storageError) {
        notify('O armazenamento local não está disponível. As alterações durarão apenas esta visita.', true);
      }
      setReady(true);
    };
    // Migration rewrites use the same lock as mutations; opening a new tab cannot restore an older snapshot.
    const initialize = async () => {
      try {
        if (navigator.locks) await navigator.locks.request(`${DEMO_DATABASE_KEY}:mutation`, restore);
        else restore();
      } catch {
        if (!cancelled) { notify('Não foi possível carregar os dados locais. Recarregue para tentar novamente.', true); setReady(true); }
      }
    };
    void initialize();
    const synchronize = (event: StorageEvent) => {
      if (event.key !== DEMO_DATABASE_KEY) return;
      try {
        const saved = localStorage.getItem(DEMO_DATABASE_KEY);
        const parsed: unknown = saved ? JSON.parse(saved) : structuredClone(seed);
        if (!isDatabase(parsed)) return;
        if (memoryOnly.current) { notify('Há alterações locais sem gravação. Confira os dados antes de continuar em outra aba.', true); return; }
        const latest = migrateDatabase(parsed);
        current.current = latest;
        persisted.current = saved;
        setDb(latest);
      } catch { notify('Não foi possível atualizar os dados de outra aba. Recarregue para conferir.', true); }
    };
    window.addEventListener('storage', synchronize);
    return () => { cancelled = true; window.removeEventListener('storage', synchronize); };
  }, [notify]);
  const mutate = useCallback(async (recipe: (draft: MockDatabase) => void, message?: string, options?: MutationOptions) => {
    const requestingActor = actorId.current;
    setPending(count => count + 1);
    try {
      await mockRequest(() => true);
      const commit = () => {
        if (requestingActor !== actorId.current) throw new Error('O perfil da demonstração mudou. Confira seu preenchimento antes de tentar novamente.');
        let latest = current.current;
        let storageAvailable = true;
        let saved: string | null = null;
        try { saved = localStorage.getItem(DEMO_DATABASE_KEY); } catch { storageAvailable = false; }
        if (storageAvailable) {
          if (saved !== persisted.current) {
            if (memoryOnly.current) throw new Error('Outra aba alterou os dados enquanto há alterações sem gravação nesta visita. Confira a versão atual antes de continuar.');
            let parsed: unknown;
            try { parsed = saved ? JSON.parse(saved) : structuredClone(seed); } catch { throw new Error('Os dados locais não puderam ser lidos. Recarregue para conferir a recuperação.'); }
            if (!isDatabase(parsed)) throw new Error('Os dados locais estão incompatíveis. Recarregue para conferir a recuperação.');
            latest = migrateDatabase(parsed);
            current.current = latest;
            persisted.current = saved;
            setDb(latest);
          }
        }
        // Without Web Locks a persisted write cannot be safely coordinated with another tab.
        if (!navigator.locks && storageAvailable) throw new Error('Este navegador não permite coordenar alterações entre abas. Abra a demonstração em um navegador atualizado para salvar. Seu preenchimento foi preservado.');
        const draft = applyDemoMutation(latest, requestingActor, recipe, options);
        current.current = draft;
        setDb(draft);
        try {
          localStorage.setItem(DEMO_DATABASE_KEY, JSON.stringify(draft));
          persisted.current = JSON.stringify(draft);
          memoryOnly.current = false;
        } catch {
          memoryOnly.current = true;
          notify('Alteração salva nesta visita, mas não no armazenamento do navegador.', true);
        }
      };
      if (navigator.locks) await navigator.locks.request(`${DEMO_DATABASE_KEY}:mutation`, commit);
      else commit();
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
    const nextUser = current.current.users.find(u => u.id === ids[next] && u.role === next && isActiveUser(u)) ?? current.current.users.find(u => u.role === next && isActiveUser(u));
    if (!nextUser) { notify('Não há conta ativa com esse perfil na demonstração.', true); return; }
    setRoleState(next);
    setActiveId(nextUser.id);
    actorId.current = nextUser.id;
    try {
      sessionStorage.setItem(DEMO_ROLE_KEY, next);
      sessionStorage.setItem(DEMO_USER_KEY, nextUser.id);
    } catch {}
  };
  const signIn = (id: string, next: Role) => {
    const person = current.current.users.find(u => u.id === id && u.role === next && isActiveUser(u));
    if (!person) { notify('Conta indisponível. Solicite a regularização à administração.', true); return; }
    setRoleState(next);
    setActiveId(id);
    actorId.current = id;
    try {
      sessionStorage.setItem(DEMO_ROLE_KEY, next);
      sessionStorage.setItem(DEMO_USER_KEY, id);
    } catch {}
  };
  const reset = () => {
    void removeMaterialFiles().catch(() => notify('Os dados foram restaurados, mas não foi possível remover os PDFs locais.', true));
    const fresh = structuredClone(seed);
    current.current = fresh;
    setDb(fresh);
    const next = fresh.users.find(u => u.id === actorId.current) ?? fresh.users.find(u => u.role === role)!;
    setActiveId(next.id);
    actorId.current = next.id;
    try {
      sessionStorage.setItem(DEMO_ROLE_KEY, next.role);
      sessionStorage.setItem(DEMO_USER_KEY, next.id);
    } catch {}
    try {
      localStorage.removeItem(DEMO_DATABASE_KEY);
      persisted.current = null;
      memoryOnly.current = false;
    } catch {}
    notify('Demonstração restaurada.');
  };
  const user = db.users.find(item => item.id === activeId) ?? { id: activeId, name: 'Conta indisponível', email: '', role, active: false };
  const lookupAccount = (email: string) => current.current.users.find(u => isActiveUser(u) && u.email.toLowerCase() === email.trim().toLowerCase());

  return { db: scopeDatabase(db, user), user, role: user.role, ready, busy: pending > 0, setRole, signIn, lookupAccount, mutate, reset };
}

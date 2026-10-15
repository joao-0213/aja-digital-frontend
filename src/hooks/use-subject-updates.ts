'use client';

import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/components/providers';
import { hasUnseenPublications, subjectPublications } from '@/lib/subject-updates';

const sessionSeen = new Map<string, string[]>();
const eventName = 'aja-subject-visited';

function readSeen(key: string): string[] {
  if (sessionSeen.has(key)) return sessionSeen.get(key)!;
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (Array.isArray(value) && value.every(item => typeof item === 'string')) return value;
  } catch { /* Keep visit tracking available for this session. */ }
  return sessionSeen.get(key) ?? [];
}

export function useSubjectUpdates(subjectId: string, visiting = false) {
  const { db, user, ready } = useApp();
  const visitor = useRef(user.id);
  const key = `aja-subject-seen:${user.id}:${subjectId}`;
  const signature = JSON.stringify(subjectPublications(db, subjectId));
  const [state, setState] = useState<{ key: string; seen: string[] } | null>(null);
  useEffect(() => {
    const refresh = () => setState({ key, seen: readSeen(key) });
    const syncStorage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) { sessionSeen.delete(key); refresh(); }
    };
    refresh();
    window.addEventListener('storage', syncStorage);
    window.addEventListener(eventName, refresh);
    return () => {
      window.removeEventListener('storage', syncStorage);
      window.removeEventListener(eventName, refresh);
    };
  }, [key]);
  useEffect(() => {
    // Switching demo users redirects away; it is not a visit by the next user.
    if (!visiting || !ready || visitor.current !== user.id) return;
    const publications = JSON.parse(signature) as string[];
    try { localStorage.setItem(key, signature); sessionSeen.delete(key); }
    catch { sessionSeen.set(key, publications); }
    window.dispatchEvent(new Event(eventName));
  }, [key, signature, visiting, ready, user.id]);
  return ready && state?.key === key && hasUnseenPublications(JSON.parse(signature) as string[], state.seen);
}

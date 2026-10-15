'use client';

import { useEffect, useState } from 'react';

const defaults = { forum: true, events: true, announcements: true };

export function useDashboardPreferences(userId: string) {
  const [saved, setSaved] = useState({ userId, values: defaults });
  const [storageError, setStorageError] = useState(false);
  const key = `aja-dashboard-${userId}`;
  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem(key) ?? '{}');
      setSaved({ userId, values: { forum: typeof data.forum === 'boolean' ? data.forum : true, events: typeof data.events === 'boolean' ? data.events : true, announcements: typeof data.announcements === 'boolean' ? data.announcements : true } });
      setStorageError(false);
    } catch { setSaved({ userId, values: defaults }); setStorageError(true); }
  }, [key, userId]);
  const values = saved.userId === userId ? saved.values : defaults;
  const update = (name: keyof typeof defaults, value: boolean) => {
    const next = { ...values, [name]: value };
    setSaved({ userId, values: next });
    try { localStorage.setItem(key, JSON.stringify(next)); setStorageError(false); }
    catch { setStorageError(true); }
  };
  return { values, update, storageError };
}

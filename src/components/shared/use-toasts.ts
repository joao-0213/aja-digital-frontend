'use client';

import { useCallback, useState } from 'react';

export interface Toast {
  id: number;
  message: string;
  error: boolean;
}

export function useToasts() {
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
  const dismiss = (id: number) => setToasts(items => items.filter(item => item.id !== id));
  return { toasts, notify, dismiss };
}

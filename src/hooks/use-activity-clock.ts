'use client';

import { useEffect, useState } from 'react';

/** Refresh open pages at deadline boundaries; mutations also recheck the actual instant. */
export function useActivityClock() {
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().toISOString()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

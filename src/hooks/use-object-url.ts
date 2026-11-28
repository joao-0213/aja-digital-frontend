'use client';

import { useEffect, useState } from 'react';

/** Creates and revokes a Blob object URL safely across renders and unmounts. */
export function useObjectUrl(blob: Blob | null | undefined): string {
  const [entry, setEntry] = useState<{ blob: Blob; url: string } | null>(null);

  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    setEntry({ blob, url });
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  return blob && entry?.blob === blob ? entry.url : '';
}

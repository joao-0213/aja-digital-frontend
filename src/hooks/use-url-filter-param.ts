'use client';

import { useCallback, useState } from 'react';

export function resolveUrlFilterValue(
  selection: { source: string; value: string },
  urlValue: string
): string {
  return selection.source === urlValue ? selection.value : urlValue;
}

/** Keeps a local filter value synchronized with a URL query parameter without effect loops. */
export function useUrlFilterParam(urlValue: string) {
  const [selection, setSelection] = useState({ source: urlValue, value: urlValue });
  const value = resolveUrlFilterValue(selection, urlValue);
  const setValue = useCallback(
    (next: string) => setSelection({ source: urlValue, value: next }),
    [urlValue]
  );
  return [value, setValue] as const;
}

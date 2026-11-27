'use client';

import { useCallback, useState } from 'react';
import { useSession } from '@/providers/app-context';

/** Standardizes editable dialog open/close state and session-scoped draft cleanup. */
export function useEditableDialogSelection<T>(openKey: string, fieldsKey?: string) {
  const { client, sessionKey } = useSession();
  const [selection, setSelection] = useState<T | null>(() => client.readDraft<T>(openKey) ?? null);

  const open = useCallback(
    (next: T) => {
      if (fieldsKey) client.clearDraft(fieldsKey, sessionKey);
      client.saveDraft(openKey, next, sessionKey);
      setSelection(next);
    },
    [client, fieldsKey, openKey, sessionKey]
  );

  const close = useCallback(() => {
    client.clearDraft(openKey, sessionKey);
    setSelection(null);
  }, [client, openKey, sessionKey]);

  return {
    selection,
    isOpen: selection !== null,
    open,
    close
  };
}

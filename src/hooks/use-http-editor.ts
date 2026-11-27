'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createHttpEditor, type RevisionRecord } from '@/lib/http-editor';
import { useSession } from '@/providers/app-context';
import { useUnsavedChanges } from './use-unsaved-changes';

export function useHttpEditor<F, R extends RevisionRecord>(
  fields: F,
  revision: number,
  context: string
) {
  const { client, sessionKey } = useSession();
  const [editor] = useState(() => {
    const restored = client.readDraft<{ fields: F; expectedRevision: number }>(context);
    return createHttpEditor<F, R>(
      restored?.fields ?? fields,
      restored?.expectedRevision ?? revision
    );
  });
  const state = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot);
  const [initialFields] = useState(() => JSON.stringify(fields));
  const serializedFields = useMemo(() => JSON.stringify(state.fields), [state.fields]);
  const dirty = serializedFields !== initialFields;
  useUnsavedChanges(dirty);
  useEffect(
    () =>
      editor.subscribe(() => {
        const latest = editor.getSnapshot();
        client.saveDraft(
          context,
          { fields: latest.fields, expectedRevision: latest.expectedRevision },
          sessionKey
        );
      }),
    [client, context, editor, sessionKey]
  );
  const clear = useCallback(
    () => client.clearDraft(context, sessionKey),
    [client, context, sessionKey]
  );
  return { ...state, dirty, editor, clear };
}

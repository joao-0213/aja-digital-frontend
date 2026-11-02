'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { createHttpEditor, type RevisionRecord } from '@/lib/http-editor';
import { useSession } from '@/providers/app-context';

export function useHttpEditor<F, R extends RevisionRecord>(fields: F, revision: number, context: string) {
  const { client, sessionKey } = useSession();
  const [editor] = useState(() => {
    const restored = client.readDraft<{ fields: F; expectedRevision: number }>(context);
    return createHttpEditor<F, R>(restored?.fields ?? fields, restored?.expectedRevision ?? revision);
  });
  const state = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot);
  const [initialFields] = useState(() => JSON.stringify(fields));
  const dirty = JSON.stringify(state.fields) !== initialFields;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => editor.subscribe(() => {
    const latest = editor.getSnapshot();
    client.saveDraft(context, { fields: latest.fields, expectedRevision: latest.expectedRevision }, sessionKey);
  }), [client, context, editor, sessionKey]);
  return { ...state, editor, clear: () => client.clearDraft(context, sessionKey) };
}

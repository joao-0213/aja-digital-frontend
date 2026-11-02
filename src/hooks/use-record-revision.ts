'use client';

import { useState } from 'react';

type EditableRecord = { id: string; revision?: number };

/** Keep the version opened by the editor while its local fields remain untouched. */
export function useRecordRevision(collection: string, record?: EditableRecord) {
  const [opened, setOpened] = useState<EditableRecord | undefined>(record ? { id: record.id, revision: record.revision ?? 0 } : undefined);
  const capture = (value?: EditableRecord) => setOpened(value ? { id: value.id, revision: value.revision ?? 0 } : undefined);
  return {
    conflict: !!record && (!opened || record.id !== opened.id || (record.revision ?? 0) !== opened.revision),
    expected: opened ? { expected: [{ collection, id: opened.id, revision: opened.revision ?? 0 }] } : undefined,
    capture,
    acknowledge: () => capture(record)
  };
}

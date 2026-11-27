'use client';

import { useEffect } from 'react';
import type { SessionClient } from '@/providers/session-client';
import { HttpError } from '@/lib/http-client';
import { createMaterialsApi } from '../api';
import { createStudyTools, type StudyTool } from '../lib/study-tools';

type ModelDocument = Document & { modelContext?: { registerTool(tool: StudyTool, options?: { signal: AbortSignal }): void | Promise<void> } };

/** Optional browser capability: registration failure never blocks the interface. */
export function useStudyTools(client: SessionClient, sessionKey: string, authenticated: boolean) {
  useEffect(() => {
    if (!authenticated) return;
    let registry: ModelDocument['modelContext'];
    try { registry = (document as ModelDocument).modelContext; } catch { return; }
    if (!registry?.registerTool) return;
    const lifecycle = new AbortController();
    const isCurrent = () => !lifecycle.signal.aborted && client.getSnapshot().status === 'authenticated' && client.getSnapshot().sessionKey === sessionKey;
    const tools = createStudyTools(createMaterialsApi(client), { isCurrent, signal: lifecycle.signal }, async () => { await client.refresh(); });
    for (const tool of tools) {
      const execute = tool.execute;
      const registered = { ...tool, async execute(input?: unknown) {
        if (!isCurrent()) throw new HttpError('cancelled', 'A sessão desta ferramenta não está mais disponível.');
        await client.refresh();
        if (!isCurrent()) throw new HttpError('cancelled', 'A sessão desta ferramenta mudou.');
        return execute(input);
      } };
      try { void Promise.resolve(registry.registerTool(registered, { signal: lifecycle.signal })).catch(() => {}); }
      catch { /* Unsupported or disabled integrations do not affect the page. */ }
    }
    return () => lifecycle.abort();
  }, [client, sessionKey, authenticated]);
}

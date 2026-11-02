import { HttpError } from './http-client.ts';

export interface RevisionRecord { id: string; revision?: number }
export interface HttpEditorState<F, R> {
  fields: F; expectedRevision: number; busy: boolean; conflicted: boolean;
  latest: R | null; blocked: boolean; error?: string;
}

/** Keeps the opened revision separate from the current server record. */
export function createHttpEditor<F, R extends RevisionRecord = RevisionRecord>(fields: F, revision: number) {
  let state: HttpEditorState<F, R> = { fields, expectedRevision: revision, busy: false, conflicted: false, latest: null, blocked: false };
  const listeners = new Set<() => void>();
  const publish = (next: HttpEditorState<F, R>) => { state = next; listeners.forEach(listener => listener()); };
  async function review(load: () => Promise<R>) {
    try { publish({ ...state, latest: await load() }); }
    catch (error: unknown) {
      const blocked = error instanceof HttpError && ['session', 'forbidden', 'not-found'].includes(error.kind);
      publish({ ...state, blocked, latest: null, error: error instanceof Error ? error.message : 'Não foi possível consultar a versão atual.' });
    }
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    change: (fields: F) => { if (!state.busy) publish({ ...state, fields, error: state.blocked ? state.error : undefined }); },
    acknowledge: () => {
      if (state.latest && !state.blocked) publish({ ...state, expectedRevision: state.latest.revision ?? 1, conflicted: false, latest: null, error: undefined });
    },
    review,
    async submit(save: (fields: F, revision: number) => Promise<unknown>, load?: () => Promise<R>) {
      if (state.busy || state.conflicted || state.blocked) return false;
      publish({ ...state, busy: true, error: undefined });
      try {
        await save(state.fields, state.expectedRevision);
        publish({ ...state, busy: false });
        return true;
      } catch (error: unknown) {
        const denied = error instanceof HttpError && (['session', 'forbidden', 'not-found'].includes(error.kind) || error.code === 'IDEMPOTENCY_CONFLICT');
        publish({ ...state, busy: false, blocked: denied, error: error instanceof Error ? error.message : 'Não foi possível salvar. Seu preenchimento foi mantido.' });
        const currentRevision = error instanceof HttpError && typeof error.details === 'object' && error.details !== null && 'currentRevision' in error.details ? error.details.currentRevision : undefined;
        if (load && error instanceof HttpError && error.kind === 'conflict' && state.expectedRevision > 0 && (!error.code || error.code === 'REVISION_CONFLICT' && typeof currentRevision === 'number')) {
          publish({ ...state, conflicted: true });
          await review(load);
        }
        return false;
      }
    }
  };
}

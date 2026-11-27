import { HttpError } from '../../../lib/http-client.ts';
import type { HttpFile } from '../../../lib/http-files.ts';
import { videoSource } from '../../../lib/material-video.ts';
import type { MaterialBatch } from '../api.ts';

export interface PublicationInput {
  moduleId: string; kind: 'lesson' | 'pdf' | 'video'; title: string;
  content: string; duration: number; videoUrl: string;
  files: { localId: string; file: File; title: string }[];
}
interface Stage { localId: string; intent: string; metadata?: HttpFile }
interface Pending { input: PublicationInput; revision: number; intent: string }
export interface PublicationState { stages: Stage[]; pending?: Pending; uncertain: boolean }
interface PublicationResult { items: { id: string }[]; total: number }
interface Transport {
  isCurrent(): boolean;
  upload(file: File, parentId: string, intent: string, signal?: AbortSignal): Promise<HttpFile>;
  discard(id: string, signal?: AbortSignal): Promise<void>;
  batch(command: MaterialBatch, intent: string, signal?: AbortSignal): Promise<PublicationResult>;
}

const copyInput = (input: PublicationInput): PublicationInput => ({ ...input, files: input.files.map(item => ({ ...item })) });

/** Domain coordinator: never discard attached bytes after an uncertain commit. */
export function createMaterialPublication(api: Transport, restored?: PublicationState, changed: (state: PublicationState) => void = () => {}) {
  let state: PublicationState = restored ? { ...restored, uncertain: !!restored.pending } : { stages: [], uncertain: false };
  let busy = false;
  let generation = 0;
  let active: AbortController | undefined;
  const guard = (version: number) => {
    if (version !== generation || !api.isCurrent()) throw new HttpError('cancelled', 'A sessão desta publicação mudou ou a operação foi cancelada. Retome somente na sessão original.');
  };
  const snapshot = (): PublicationState => ({ ...state, stages: state.stages.map(stage => ({ ...stage, metadata: stage.metadata ? { ...stage.metadata } : undefined })), pending: state.pending ? { ...state.pending, input: copyInput(state.pending.input) } : undefined });
  const persist = (version: number) => { guard(version); changed(snapshot()); };
  const discardStages = async (version: number, signal?: AbortSignal) => {
    for (const stage of state.stages.filter(stage => stage.metadata)) {
      guard(version);
      await api.discard(stage.metadata!.id, signal).catch(() => {});
      guard(version);
    }
    state = { stages: [], uncertain: false }; persist(version);
  };
  return {
    getState: snapshot,
    cancel: () => { generation++; active?.abort(); },
    async discard() {
      const version = generation;
      guard(version);
      if (state.uncertain || busy) return false;
      await discardStages(version);
      guard(version);
      return true;
    },
    async publish(fields: PublicationInput, revision: number) {
      const version = generation;
      guard(version);
      if (busy) throw new Error('Aguarde a conferência da publicação em andamento.');
      busy = true;
      const controller = new AbortController(); active = controller;
      try {
        if (!state.uncertain || !state.pending) {
          if (!Number.isFinite(fields.duration) || fields.duration < 1 || fields.duration > 600) throw new Error('Informe um tempo de estudo entre 1 e 600 minutos.');
          if (fields.kind === 'pdf') {
            if (!fields.files.length || fields.files.length > 10) throw new Error('Selecione de 1 a 10 PDFs por publicação.');
            for (const item of fields.files) {
              guard(version);
              if (!item.title.trim() || item.title.trim().length > 160) throw new Error('Informe o título de cada PDF, com até 160 caracteres.');
              const signature = new TextDecoder().decode(await item.file.slice(0, 5).arrayBuffer());
              guard(version);
              if (!item.file.name.toLowerCase().endsWith('.pdf') || item.file.type && item.file.type !== 'application/pdf' || item.file.size === 0 || item.file.size > 10 * 1024 * 1024 || signature !== '%PDF-') throw new Error(`${item.file.name}: selecione um PDF válido, não vazio, de até 10 MB.`);
            }
          } else {
            if (!fields.title.trim()) throw new Error('Informe o título do material.');
            if (fields.kind === 'lesson' && !fields.content.trim()) throw new Error('Preencha o texto de apoio.');
            if (fields.kind === 'video' && !videoSource(fields.videoUrl)) throw new Error('Informe uma URL HTTPS válida para o vídeo, sem credenciais.');
          }
          state.pending = { input: copyInput(fields), revision, intent: crypto.randomUUID() };
          state.uncertain = false; persist(version);
        }
        const pending = state.pending!;
        const input = pending.input;
        const selected = new Set(input.kind === 'pdf' ? input.files.map(item => item.localId) : []);
        for (const stage of state.stages.filter(stage => !selected.has(stage.localId))) if (stage.metadata) {
          guard(version); await api.discard(stage.metadata.id, controller.signal).catch(() => {}); guard(version);
        }
        state.stages = state.stages.filter(stage => selected.has(stage.localId)); persist(version);
        if (input.kind === 'pdf') for (const item of input.files) {
          let stage = state.stages.find(stage => stage.localId === item.localId);
          if (!stage) { stage = { localId: item.localId, intent: crypto.randomUUID() }; state.stages.push(stage); persist(version); }
          if (!stage.metadata) {
            guard(version);
            const uploaded = await api.upload(item.file, input.moduleId, stage.intent, controller.signal);
            guard(version); stage.metadata = uploaded; persist(version);
          }
        }
        const base = { moduleId: input.moduleId, duration: input.duration, content: input.content.trim() };
        const command: MaterialBatch = { moduleId: input.moduleId, expectedRevision: pending.revision, items: input.kind === 'pdf' ? input.files.map(item => ({ ...base, kind: 'pdf' as const, title: item.title.trim(), fileId: state.stages.find(stage => stage.localId === item.localId)!.metadata!.id, videoUrl: null })) : [{ ...base, kind: input.kind, title: input.title.trim(), fileId: null, videoUrl: input.kind === 'video' ? videoSource(input.videoUrl)!.url : null }] };
        guard(version);
        const result = await api.batch(command, pending.intent, controller.signal);
        guard(version);
        state = { stages: [], uncertain: false }; persist(version);
        return result;
      } catch (error: unknown) {
        guard(version);
        const definitive = error instanceof HttpError && (['session', 'forbidden', 'not-found', 'validation', 'conflict'].includes(error.kind) || error.status === 413 || error.code === 'PERSISTENCE_FAILED');
        if (definitive) {
          state.pending = undefined; state.uncertain = false;
          if (error instanceof HttpError && (['session', 'forbidden', 'not-found', 'validation'].includes(error.kind) || error.status === 413)) await discardStages(version, controller.signal);
          else persist(version);
        } else if (state.pending) { state.uncertain = true; persist(version); }
        throw error;
      } finally { busy = false; }
    }
  };
}

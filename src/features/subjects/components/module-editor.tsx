'use client';

import { useMemo } from 'react';
import { useSession, useApp } from '@/providers/app-context';
import { Button, Dialog, Input, Textarea } from '@/components/ui';
import { RecordConflict } from '@/components/shared/record-conflict';
import { useHttpEditor } from '@/hooks/use-http-editor';
import type { TrailModule } from '@/models';
import { createSubjectsApi, type ModuleFields } from '../api';

export interface ModuleSelection { record?: TrailModule; intent: string }

export function ModuleEditor({ subjectId, selection, close, saved }: { subjectId: string; selection: ModuleSelection; close: () => void; saved: () => void }) {
  const { client } = useSession();
  const { notify } = useApp();
  const api = useMemo(() => createSubjectsApi(client), [client]);
  const { record, intent } = selection;
  const state = useHttpEditor<ModuleFields, TrailModule>({ title: record?.title ?? '', description: record?.description ?? '' }, record?.revision ?? 0, `module-fields:${subjectId}`);
  const closeEditor = () => { if (!state.busy && window.confirm('Fechar sem salvar as alterações do módulo?')) { state.clear(); close(); } };
  const save = async () => {
    const ok = await state.editor.submit((fields, revision) => api.saveModule({ title: fields.title.trim(), description: fields.description.trim() }, revision, subjectId, record?.id, intent), record ? () => api.readModule(record.id) : undefined);
    if (ok) { state.clear(); notify('Módulo salvo.'); saved(); }
  };
  return <Dialog open onClose={closeEditor} title={record ? 'Editar módulo' : 'Novo módulo'}><form className="space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>
    {state.conflicted && <RecordConflict author="Equipe docente" updatedAt={state.latest?.updatedAt} onReviewed={state.editor.acknowledge}>{state.latest ? <><p className="font-semibold">{state.latest.title}</p><p>{state.latest.description}</p></> : <Button variant="secondary" onClick={() => void state.editor.review(() => api.readModule(record!.id))}>Consultar versão atual</Button>}</RecordConflict>}
    <fieldset disabled={state.busy} className="space-y-4"><Input label="Título do módulo" value={state.fields.title} onChange={event => state.editor.change({ ...state.fields, title: event.target.value })} required maxLength={160} /><Textarea label="Orientações do módulo (opcional)" value={state.fields.description} onChange={event => state.editor.change({ ...state.fields, description: event.target.value })} maxLength={10000} /></fieldset>
    {state.error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{state.error}</p>}
    {state.blocked && <p className="text-sm text-slate-600">Esta operação não pode ser repetida agora. Seu texto foi mantido. Confira o estado atual da disciplina antes de iniciar outra alteração.</p>}
    <div className="flex justify-end gap-2"><Button variant="secondary" disabled={state.busy} onClick={closeEditor}>Cancelar</Button><Button type="submit" loading={state.busy} disabled={state.conflicted || state.blocked}>Salvar módulo</Button></div>
  </form></Dialog>;
}

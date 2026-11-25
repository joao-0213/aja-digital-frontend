'use client';

import { useCallback, useMemo, useState } from 'react';
import { useSession, useApp } from '@/providers/app-context';
import { Button, Check, Dialog, Input, Select, Textarea, ErrorState, Skeleton } from '@/components/ui';
import { RecordConflict } from '@/components/shared/record-conflict';
import { useHttpQuery } from '@/hooks/use-http-query';
import { useHttpEditor } from '@/hooks/use-http-editor';
import { createClassesApi } from '@/features/classes';
import type { Subject } from '@/models';
import { createSubjectsApi, type SubjectFields, type SubjectSummary } from '../api';
import { teachingTeamOptions } from '../lib/teaching-team';
import { resolveSubjectIcon, SubjectIconPicker } from './subject-icons';

export interface SubjectSelection { record?: SubjectSummary; targetClass: string; intent: string }

export function SubjectEditor({ selection, close, saved }: { selection: SubjectSelection; close: () => void; saved: () => void }) {
  const { client, sessionKey, resourceEpoch } = useSession();
  const { notify } = useApp();
  const api = useMemo(() => createSubjectsApi(client), [client]);
  const classApi = useMemo(() => createClassesApi(client), [client]);
  const { record } = selection;
  const initial: SubjectFields = { name: record?.name ?? '', description: record?.description ?? '', classId: record?.classId ?? selection.targetClass, teacherIds: record?.teacherIds ?? [], color: record?.color ?? 'violet', icon: record ? resolveSubjectIcon(record).value : 'book' };
  const state = useHttpEditor<SubjectFields, Subject>(initial, record?.revision ?? 0, 'subjects-fields');
  const [confirmMode, setConfirmMode] = useState<'close' | 'remove-teachers' | null>(null);
  const classes = useHttpQuery({ sessionKey, key: `subject-editor-classes:${resourceEpoch}` }, useCallback(signal => classApi.options(signal), [classApi]));
  const teachers = useHttpQuery({ sessionKey, key: `subject-editor-teachers:${resourceEpoch}` }, useCallback(signal => api.teachers(signal), [api]));
  const options = teachingTeamOptions(teachers.data ?? [], state.fields.teacherIds).map(option => option.available ? option : { ...option, name: record?.teachers.find(item => item.id === option.id)?.name ?? 'Docente indisponível', reason: 'Este cadastro não está disponível para atribuição. Remova a seleção para continuar.' });
  const unavailable = options.filter(option => !option.available);
  const activeClasses = classes.data?.filter(item => item.active) ?? [];
  const ready = !classes.loading && !teachers.loading && !classes.error && !teachers.error;
  const validClass = activeClasses.some(item => item.id === state.fields.classId);
  const dirty = JSON.stringify(state.fields) !== JSON.stringify(initial);
  const closeEditor = () => {
    if (state.busy) return;
    if (confirmMode) { setConfirmMode(null); return; }
    if (!dirty) { state.clear(); close(); return; }
    setConfirmMode('close');
  };
  const persist = async () => {
    setConfirmMode(null);
    const ok = await state.editor.submit((fields, revision) => api.saveSubject({ ...fields, name: fields.name.trim(), description: fields.description.trim() }, revision, record?.id, selection.intent), record ? () => api.readSubject(record.id) : undefined);
    if (ok) { state.clear(); notify('Disciplina salva.'); saved(); }
  };
  const save = async () => {
    if (!ready || !validClass || unavailable.length) return;
    const removed = record?.teacherIds.filter(id => !state.fields.teacherIds.includes(id)) ?? [];
    if (removed.length) { setConfirmMode('remove-teachers'); return; }
    await persist();
  };
  return <Dialog open onClose={closeEditor} title={record ? 'Editar disciplina e equipe' : 'Nova disciplina'}>{confirmMode === 'close' ? <div role="alert" className="space-y-4"><p className="text-sm leading-6 text-slate-600">Descartar as alterações não salvas desta disciplina?</p><div className="flex flex-wrap justify-end gap-2"><Button autoFocus variant="secondary" onClick={() => setConfirmMode(null)}>Continuar editando</Button><Button variant="danger" onClick={() => { state.clear(); close(); }}>Descartar alterações</Button></div></div> : confirmMode === 'remove-teachers' ? <div role="alert" className="space-y-4"><p className="text-sm leading-6 text-slate-600">Encerrar o acesso dos docentes removidos? Autoria e histórico serão preservados.</p><div className="flex flex-wrap justify-end gap-2"><Button autoFocus variant="secondary" disabled={state.busy} onClick={() => setConfirmMode(null)}>Voltar à edição</Button><Button variant="danger" loading={state.busy} onClick={() => void persist()}>Confirmar e salvar</Button></div></div> : <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>
    <fieldset disabled={state.busy} className="space-y-4"><Input label="Nome" value={state.fields.name} onChange={event => state.editor.change({ ...state.fields, name: event.target.value })} required maxLength={100} /><Textarea label="Descrição" value={state.fields.description} onChange={event => state.editor.change({ ...state.fields, description: event.target.value })} maxLength={10000} />
      {classes.loading ? <Skeleton /> : classes.error ? <ErrorState message={classes.error.message} retry={() => void classes.retry()} /> : <Select label="Turma" value={state.fields.classId} onChange={event => state.editor.change({ ...state.fields, classId: event.target.value })} required><option value="" disabled>Selecione uma turma</option>{!validClass && state.fields.classId && <option value={state.fields.classId} disabled>Turma indisponível para edição</option>}{activeClasses.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</Select>}
      <fieldset className="space-y-3"><legend className="mb-2 text-sm font-medium text-slate-700">Equipe docente</legend><p className="text-sm leading-6 text-slate-500">Todos os docentes atribuídos têm as mesmas permissões sobre os conteúdos da disciplina, preservando a autoria das publicações.</p>
        {teachers.loading ? <Skeleton /> : teachers.error ? <ErrorState message={teachers.error.message} retry={() => void teachers.retry()} /> : <>{options.filter(option => option.available).map(option => <Check key={option.id} label={option.name} checked={option.selected} onChange={checked => state.editor.change({ ...state.fields, teacherIds: checked ? [...state.fields.teacherIds, option.id] : state.fields.teacherIds.filter(id => id !== option.id) })} />)}{!options.some(option => option.available) && <p className="text-sm text-slate-500">Cadastre um docente em Usuários e docentes. Você pode salvar a disciplina sem equipe.</p>}{unavailable.length > 0 && <div role="alert" className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm"><p>Revise os docentes selecionados. Seu texto e as demais seleções foram mantidos.</p>{unavailable.map(option => <div key={option.id}><p className="font-semibold">{option.name}</p><p className="mb-2 text-slate-600">{option.reason}</p><Button variant="secondary" aria-label={`Remover ${option.name} da seleção`} onClick={() => state.editor.change({ ...state.fields, teacherIds: state.fields.teacherIds.filter(id => id !== option.id) })}>Remover da seleção</Button></div>)}</div>}</>}
      </fieldset><SubjectIconPicker value={state.fields.icon ?? 'book'} onChange={icon => state.editor.change({ ...state.fields, icon })} disabled={state.busy} />
    </fieldset>
    {state.conflicted && <RecordConflict author="Equipe administrativa" updatedAt={state.latest?.updatedAt} onReviewed={state.editor.acknowledge}>{state.latest ? <><p>Nome atual: {state.latest.name}</p><p>Descrição atual: {state.latest.description || 'Sem descrição'}</p><p>Turma atual: {classes.data?.find(item => item.id === state.latest!.classId)?.name ?? 'Turma indisponível'}</p><p>Equipe atual: {state.latest.teacherIds.map(id => teachers.data?.find(item => item.id === id)?.name ?? record?.teachers.find(item => item.id === id)?.name ?? 'Docente indisponível').join(', ') || 'Sem docentes atribuídos'}</p><p>Ícone atual: {resolveSubjectIcon(state.latest).label}</p><p>Seu preenchimento e sua seleção foram mantidos. Remova qualquer docente indisponível antes de salvar.</p></> : <Button variant="secondary" onClick={() => void state.editor.review(() => api.readSubject(record!.id))}>Consultar versão atual</Button>}</RecordConflict>}
    {state.error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{state.error}</p>}
    {state.blocked && <p className="text-sm text-slate-600">Esta operação não pode ser repetida agora. Confira o estado atual na lista antes de iniciar outra alteração.</p>}
    <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={state.busy} onClick={closeEditor}>Cancelar</Button><Button type="submit" loading={state.busy} disabled={!ready || !validClass || unavailable.length > 0 || state.conflicted || state.blocked}>Salvar disciplina</Button></div>
  </form>}</Dialog>;
}

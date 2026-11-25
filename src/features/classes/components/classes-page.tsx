'use client';

import { useCallback, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useSession, useApp } from '@/providers/app-context';
import { Badge, Button, Card, Check, Dialog, Empty, Input, LinkButton, PageHeading, Select, Skeleton, ErrorState } from '@/components/ui';
import { RecordConflict } from '@/components/shared/record-conflict';
import { useHttpQuery } from '@/hooks/use-http-query';
import { useHttpEditor } from '@/hooks/use-http-editor';
import { countLabel } from '@/lib/utils';
import type { SchoolClass } from '@/models';
import { createClassesApi, type ClassFields } from '../api';

type Selection = { record?: SchoolClass; action: 'edit' | 'close' | 'reopen'; intent: string };

function ClassDialog({ selection, close, saved }: { selection: Selection; close: () => void; saved: () => void }) {
  const { client } = useSession();
  const { notify } = useApp();
  const api = useMemo(() => createClassesApi(client), [client]);
  const { record, action, intent } = selection;
  const initial: ClassFields = { name: record?.name ?? '', code: record?.code ?? '', year: record?.year ?? new Date().getFullYear(), shift: record?.shift ?? 'Noite' };
  const state = useHttpEditor<ClassFields, SchoolClass>(initial, record?.revision ?? 0, 'classes-fields');
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [yearInput, setYearInput] = useState(() => String(state.fields.year));
  const dirty = JSON.stringify(state.fields) !== JSON.stringify(initial);
  const closeEditor = () => {
    if (state.busy) return;
    if (confirmingClose) { setConfirmingClose(false); return; }
    if (action !== 'edit' || !dirty) { state.clear(); close(); return; }
    setConfirmingClose(true);
  };
  const save = async () => {
    const ok = await state.editor.submit((fields, revision) => action === 'edit' ? api.save({ ...fields, name: fields.name.trim(), code: fields.code.trim().toUpperCase() }, revision, record?.id, intent) : api.command(record!.id, action, revision, intent), record ? () => api.read(record.id) : undefined);
    if (ok) { state.clear(); notify(action === 'edit' ? 'Turma salva.' : 'Situação da turma atualizada. Histórico preservado.'); saved(); }
  };
  return <Dialog open onClose={closeEditor} title={action === 'edit' ? record ? 'Editar turma' : 'Criar nova turma' : action === 'close' ? 'Inativar turma?' : 'Reativar turma?'}>{confirmingClose ? <div role="alert" className="space-y-4"><p className="text-sm leading-6 text-slate-600">Fechar esta edição sem salvar as alterações da turma?</p><div className="flex flex-wrap justify-end gap-2"><Button autoFocus variant="secondary" onClick={() => setConfirmingClose(false)}>Continuar editando</Button><Button variant="danger" onClick={() => { state.clear(); close(); }}>Descartar alterações</Button></div></div> : <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>
    {action === 'edit' ? <fieldset disabled={state.busy} className="space-y-4"><Input label="Nome da turma" value={state.fields.name} onChange={event => state.editor.change({ ...state.fields, name: event.target.value })} required maxLength={100} /><Input label="Código único" value={state.fields.code} onChange={event => state.editor.change({ ...state.fields, code: event.target.value })} required pattern="[A-Za-z0-9-]+" maxLength={20} /><div className="grid grid-cols-2 gap-4"><Input label="Ano" type="number" value={yearInput} onChange={event => { const raw = event.target.value; setYearInput(raw); if (raw !== '') state.editor.change({ ...state.fields, year: Number(raw) }); }} min={2020} max={2100} required /><Select label="Turno" value={state.fields.shift} onChange={event => state.editor.change({ ...state.fields, shift: event.target.value as SchoolClass['shift'] })}><option>Manhã</option><option>Tarde</option><option>Noite</option></Select></div></fieldset> : <p className="text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">O histórico de {record?.name} será preservado. Inativar encerra vínculos e cancela matrículas pendentes; alunos perdem acesso. Reativar não restaura vínculos encerrados.</p>}
    {state.conflicted && <RecordConflict author="Equipe administrativa" updatedAt={state.latest?.updatedAt} onReviewed={state.editor.acknowledge}><p>A turma mudou. Seu preenchimento foi mantido.</p>{state.latest ? <p>{state.latest.name} · {state.latest.code} · {state.latest.year} · {state.latest.shift} · {state.latest.active ? 'Ativa' : 'Inativa'}</p> : <Button variant="secondary" onClick={() => void state.editor.review(() => api.read(record!.id))}>Consultar versão atual</Button>}</RecordConflict>}
    {state.error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{state.error}</p>}
    {state.blocked && <p className="text-sm text-slate-600">Feche esta janela e atualize a lista para conferir o que foi registrado antes de iniciar outra operação.</p>}
    <div className="flex justify-end gap-2"><Button variant="secondary" disabled={state.busy} onClick={closeEditor}>Cancelar</Button><Button type="submit" variant={action === 'close' ? 'danger' : 'primary'} loading={state.busy} disabled={state.conflicted || state.blocked}>{action === 'edit' ? 'Salvar turma' : 'Confirmar'}</Button></div>
  </form>}</Dialog>;
}

export function ClassesPage() {
  const { client, sessionKey, user, resourceEpoch } = useSession();
  const api = useMemo(() => createClassesApi(client), [client]);
  const [search, setSearch] = useState('');
  const [inactive, setInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<Selection | null>(() => client.readDraft<Selection>('classes-open') ?? null);
  const query = useHttpQuery({ sessionKey, key: JSON.stringify(['classes', search, inactive, page, resourceEpoch]) }, useCallback(signal => api.list(search, inactive, page, signal), [api, search, inactive, page]), user?.role === 'admin');
  if (user?.role !== 'admin') return <Empty title="Área de gestão" description="Seu perfil não permite gerenciar turmas." />;
  const open = (action: Selection['action'], record?: SchoolClass) => { const next = { action, record, intent: crypto.randomUUID() }; client.clearDraft('classes-fields', sessionKey); client.saveDraft('classes-open', next, sessionKey); setSelection(next); };
  const close = () => { client.clearDraft('classes-open', sessionKey); setSelection(null); };
  return <>
    <LinkButton secondary href="/" className="mb-5"><ArrowLeft aria-hidden="true" className="size-4" />Voltar ao painel</LinkButton>
    <PageHeading eyebrow="Gestão acadêmica" title="Turmas" description="Cadastre e gerencie as turmas." action={<Button onClick={() => open('edit')}>Nova turma</Button>} />
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div className="w-full sm:w-80"><Input aria-label="Buscar turmas" placeholder="Buscar por nome ou código…" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></div><Check label="Mostrar turmas inativas" checked={inactive} onChange={value => { setInactive(value); setPage(1); }} /></div>
    {query.loading ? <Skeleton /> : query.error ? <ErrorState message={query.error.message} retry={() => void query.retry()} /> : !query.data?.items.length ? <Empty title="Nenhuma turma encontrada" description="Tente outro nome ou inclua as turmas inativas." /> : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{query.data.items.map(item => <Card key={item.id}><div className="mb-5"><Badge tone={item.active ? 'green' : 'neutral'}>{item.active ? 'Ativa' : 'Inativa'}</Badge></div><h2 className="text-lg font-semibold [overflow-wrap:anywhere]">{item.name}</h2><p className="mt-1 text-sm text-slate-500 [overflow-wrap:anywhere]">{item.code} · {item.year} · {item.shift}</p><p className="my-5 text-sm text-slate-500">{countLabel(item.studentIds.length, 'aluno matriculado', 'alunos matriculados')}</p><div className="flex flex-wrap gap-2 border-t pt-4"><LinkButton secondary href={`/disciplinas?turma=${encodeURIComponent(item.id)}`}>Ver disciplinas</LinkButton><LinkButton secondary href={`/alunos?turma=${encodeURIComponent(item.id)}`}>Ver matrículas</LinkButton><Button variant="ghost" aria-label={`Editar ${item.name}`} onClick={() => open('edit', item)}>Editar</Button><Button variant="ghost" aria-label={`${item.active ? 'Inativar' : 'Reativar'} ${item.name}`} onClick={() => open(item.active ? 'close' : 'reopen', item)}>{item.active ? 'Inativar' : 'Reativar'}</Button></div></Card>)}</div>}
    <div className="mt-5 flex items-center justify-between gap-3"><Button variant="secondary" disabled={page === 1 || query.loading} onClick={() => setPage(value => value - 1)}>Anterior</Button><span className="text-sm text-slate-600">Página {page}{query.data && ` · ${countLabel(query.data.total, 'turma', 'turmas')}`}</span><Button variant="secondary" disabled={!query.data || page * query.data.pageSize >= query.data.total || query.loading} onClick={() => setPage(value => value + 1)}>Próxima</Button></div>
    {selection && <ClassDialog key={selection.intent} selection={selection} close={close} saved={() => { close(); void query.invalidate(); }} />}
  </>;
}

'use client';

import { useCallback, useMemo, useState } from 'react';
import { useApp, useSession } from '@/providers/app-context';
import { Avatar, Badge, Button, Card, Dialog, Empty, Input, PageHeading, Select, Skeleton, ErrorState } from '@/components/ui';
import { RecordConflict } from '@/components/shared/record-conflict';
import { roleLabels } from '@/lib/utils';
import { useHttpQuery } from '@/hooks/use-http-query';
import { useHttpEditor } from '@/hooks/use-http-editor';
import type { User, Role } from '@/models';
import { createUsersApi, type UserFields } from '../api';

type Selection = { record?: User; action: 'edit' | 'role' | 'deactivate' | 'withdraw'; nextRole?: Role; intent: string };

function UserDialog({ selection, close, saved }: { selection: Selection; close: () => void; saved: () => void }) {
  const { client } = useSession();
  const { notify } = useApp();
  const api = useMemo(() => createUsersApi(client), [client]);
  const { record, action, nextRole, intent } = selection;
  const edit = action === 'edit';
  const state = useHttpEditor<UserFields, User>({ name: record?.name ?? '', email: record?.email ?? '' }, record?.revision ?? 0, 'users-fields');
  const closeEditor = () => { if (!state.busy && (action !== 'edit' || window.confirm('Fechar esta edição sem salvar?'))) { state.clear(); close(); } };
  const save = async () => {
    const ok = await state.editor.submit((fields, revision) => edit ? api.save({ name: fields.name.trim(), email: fields.email.trim().toLowerCase() }, revision, record?.id, intent) : api.command(record!.id, action, revision, nextRole), record ? () => api.read(record.id) : undefined);
    if (ok) { state.clear(); notify(edit ? 'Docente salvo. O acesso pode ser definido pelo fluxo de recuperação.' : 'Situação do usuário atualizada. Histórico preservado.'); saved(); }
  };
  return <Dialog open onClose={closeEditor} title={edit ? record ? 'Editar docente' : 'Cadastrar docente' : action === 'role' ? 'Alterar perfil de acesso?' : action === 'withdraw' ? 'Excluir docente?' : 'Inativar docente?'}>
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>
      {edit ? <><p className="text-sm leading-6 text-slate-600">Cargo global: Professor. Atribua o docente às disciplinas após o cadastro. A senha é definida pelo próprio usuário no fluxo de recuperação de acesso.</p><Input label="Nome" value={state.fields.name} onChange={event => state.editor.change({ ...state.fields, name: event.target.value })} required minLength={3} maxLength={100} disabled={state.busy} /><Input label="E-mail" type="email" value={state.fields.email} onChange={event => state.editor.change({ ...state.fields, email: event.target.value })} required maxLength={254} disabled={state.busy} /></> : <><p className="text-sm leading-6">{record?.name}{action === 'role' ? ` passará a ser ${roleLabels[nextRole!].toLowerCase()}.` : ' perderá acesso à plataforma.'}</p><p className="text-sm leading-6 text-slate-600">A alteração de cargo, inativação ou exclusão encerra as atribuições incompatíveis. Conteúdos anteriores conservam autoria e histórico. A exclusão é lógica.</p></>}
      {state.conflicted && <RecordConflict author="Equipe administrativa" updatedAt={state.latest?.updatedAt} onReviewed={state.editor.acknowledge}><p>O cadastro mudou. Seu preenchimento foi mantido.</p>{state.latest ? <p>{state.latest.name} · {state.latest.email} · {roleLabels[state.latest.role]} · {state.latest.active === false ? 'Inativo' : 'Ativo'}</p> : <Button variant="secondary" onClick={() => void state.editor.review(() => api.read(record!.id))}>Consultar versão atual</Button>}</RecordConflict>}
      {state.error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{state.error}</p>}
      {state.blocked && <p className="text-sm text-slate-600">Esta operação não pode ser repetida agora. Seu preenchimento foi preservado. Feche esta janela e atualize a lista para conferir o que foi registrado antes de iniciar outra operação.</p>}
      <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={state.busy} onClick={closeEditor}>Cancelar</Button><Button type="submit" loading={state.busy} disabled={state.conflicted || state.blocked}>{edit ? 'Salvar docente' : 'Confirmar alteração'}</Button></div>
    </form>
  </Dialog>;
}

export function UsersPage() {
  const { client, sessionKey, user, resourceEpoch } = useSession();
  const api = useMemo(() => createUsersApi(client), [client]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<Selection | null>(() => client.readDraft<Selection>('users-open') ?? null);
  const query = useHttpQuery({ sessionKey, key: JSON.stringify(['users', search, filter, page, resourceEpoch]) }, useCallback(signal => api.list(search, filter, page, signal), [api, search, filter, page]), user?.role === 'admin');
  if (user?.role !== 'admin') return <Empty title="Área da administração" description="Seu perfil não permite gerenciar docentes e cargos." />;
  const open = (value: Omit<Selection, 'intent'>) => { const next = { ...value, intent: crypto.randomUUID() }; client.clearDraft('users-fields', sessionKey); client.saveDraft('users-open', next, sessionKey); setSelection(next); };
  const close = () => { client.clearDraft('users-open', sessionKey); setSelection(null); };
  return <>
    <PageHeading eyebrow="Gestão de acesso" title="Usuários e docentes" description="Administre cargos globais e identificação dos docentes." action={<Button onClick={() => open({ action: 'edit' })}>Cadastrar docente</Button>} />
    <div className="mb-6 grid max-w-2xl gap-3 sm:grid-cols-2"><Input label="Buscar usuário" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Nome ou e-mail" /><Select label="Cargo global" value={filter} onChange={event => { setFilter(event.target.value); setPage(1); }}><option value="all">Todos os cargos</option><option value="teacher">Professores</option><option value="student">Alunos</option><option value="admin">Administradores</option></Select></div>
    {query.loading ? <Skeleton /> : query.error ? <ErrorState message={query.error.message} retry={() => void query.retry()} /> : !query.data?.items.length ? <Empty title="Nenhum usuário encontrado" description="Altere o nome, e-mail ou cargo pesquisado." /> : <Card className="!p-0 overflow-hidden"><div className="overflow-x-auto" role="region" aria-label="Lista de usuários e cargos" tabIndex={0}><table className="w-full text-left text-sm"><thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-5">Usuário</th><th className="p-5">E-mail</th><th className="p-5">Cargo global</th><th className="p-5">Gestão do docente</th></tr></thead><tbody className="divide-y">{query.data.items.map(item => <tr key={item.id}><td className="p-5"><div className="flex items-center gap-3"><Avatar name={item.name} size="sm" /><div className="min-w-40"><p className="font-semibold">{item.name}</p><Badge tone={item.active === false ? 'neutral' : 'purple'}>{item.active === false ? 'Conta inativa' : roleLabels[item.role]}</Badge></div></div></td><td className="p-5">{item.email}</td><td className="min-w-52 p-5"><Select aria-label={`Cargo de ${item.name}`} value={item.role} disabled={item.active === false} onChange={event => open({ action: 'role', record: item, nextRole: event.target.value as Role })}><option value="student">Aluno</option><option value="teacher">Professor</option><option value="admin">Administrador</option></Select></td><td className="p-5">{item.role === 'teacher' && <div className="flex flex-wrap gap-2">{item.active !== false && <Button variant="ghost" aria-label={`Editar docente ${item.name}`} onClick={() => open({ action: 'edit', record: item })}>Editar</Button>}{item.active !== false && <Button variant="ghost" aria-label={`Inativar docente ${item.name}`} onClick={() => open({ action: 'deactivate', record: item })}>Inativar</Button>}<Button variant="ghost" aria-label={`Excluir docente ${item.name}`} onClick={() => open({ action: 'withdraw', record: item })}>Excluir</Button></div>}</td></tr>)}</tbody></table></div></Card>}
    <div className="mt-5 flex items-center justify-between gap-3"><Button variant="secondary" disabled={page === 1 || query.loading} onClick={() => setPage(value => value - 1)}>Anterior</Button><span className="text-sm text-slate-600">Página {page}{query.data && ` · ${query.data.total} usuários`}</span><Button variant="secondary" disabled={!query.data || page * query.data.pageSize >= query.data.total || query.loading} onClick={() => setPage(value => value + 1)}>Próxima</Button></div>
    <p className="mt-4 text-xs leading-5 text-slate-500">O último administrador ativo não pode perder o cargo. O serviço confere as permissões e a revisão antes de efetivar alterações.</p>
    {selection && <UserDialog key={selection.intent} selection={selection} close={close} saved={() => { close(); void query.invalidate(); void client.refresh(); }} />}
  </>;
}

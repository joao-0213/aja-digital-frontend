'use client';

import { useEffect, useState } from 'react';
import { Pencil, Plus, ShieldCheck, UserMinus, Trash2 } from 'lucide-react';
import { useApp } from '@/providers/app-context';
import { Avatar, Badge, Button, Card, Dialog, Empty, Input, PageHeading, Select } from '@/components/ui';
import { roleLabels, textMatch, uid } from '@/lib/utils';
import { isActiveUser } from '@/lib/access';
import type { Role, User } from '@/models';

type Editor = { id?: string; revision: number; name: string; email: string };
type Change = { id: string; revision: number; role?: Role; action: 'role' | 'deactivate' | 'delete' };

export function UsersPage() {
  const { db, user, role, mutate, busy } = useApp();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [change, setChange] = useState<Change | null>(null);
  const [compared, setCompared] = useState(false);
  const dirty = !!editor && (name !== editor.name || email !== editor.email);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  if (role !== 'admin' || !isActiveUser(user)) return <Empty title="Área da administração" description="Selecione o perfil de administrador para gerenciar docentes e cargos na demonstração." />;

  const users = db.users.filter(item => !item.deletedAt);
  const admins = users.filter(item => item.role === 'admin' && isActiveUser(item)).length;
  const visible = users.filter(item => (filter === 'all' || item.role === filter) && textMatch(`${item.name} ${item.email}`, search));
  const current = db.users.find(item => item.id === editor?.id);
  const changedUser = db.users.find(item => item.id === change?.id);
  const editConflict = !!editor?.id && (!current || !!current.deletedAt || (current.revision ?? 0) !== editor.revision);
  const actionConflict = !!change && (!changedUser || !!changedUser.deletedAt || (changedUser.revision ?? 0) !== change.revision);
  const assignments = changedUser ? db.subjects.filter(subject => subject.teacherIds.includes(changedUser.id)).length : 0;
  const author = (record: User | undefined) => db.users.find(item => item.id === record?.updatedBy)?.name ?? 'Equipe administrativa';
  const when = (record: User | undefined) => record?.updatedAt ? new Date(record.updatedAt).toLocaleString('pt-BR') : 'data não registrada';
  const openEditor = (record?: User) => {
    setEditor({ id: record?.id, revision: record?.revision ?? 0, name: record?.name ?? '', email: record?.email ?? '' });
    setName(record?.name ?? ''); setEmail(record?.email ?? ''); setError(''); setCompared(false);
  };
  const closeEditor = () => { if (!busy && (!dirty || window.confirm('Descartar as alterações não salvas deste docente?'))) setEditor(null); };

  return <>
    <PageHeading eyebrow="Gestão de acesso" title="Usuários e docentes" description="Administre cargos globais e os dados de identificação dos docentes. As atribuições são gerenciadas nas disciplinas." action={<Button onClick={() => openEditor()}><Plus aria-hidden="true" className="size-4" />Cadastrar docente</Button>} />
    <div className="mb-6 grid max-w-2xl gap-3 sm:grid-cols-2">
      <Input label="Buscar usuário" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome ou e-mail" />
      <Select label="Cargo global" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">Todos os cargos</option><option value="teacher">Professores</option><option value="student">Alunos</option><option value="admin">Administradores</option></Select>
    </div>
    {visible.length ? <Card className="!p-0 overflow-hidden">
      <p className="px-5 pt-4 text-xs text-slate-500 sm:hidden">Deslize para ver todas as colunas.</p>
      <div className="relative overflow-x-auto" role="region" aria-label="Lista de usuários e cargos" tabIndex={0}>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-400"><tr><th className="p-5 font-medium">Usuário</th><th className="p-5 font-medium">E-mail</th><th className="p-5 font-medium">Cargo global</th><th className="p-5 font-medium">Gestão do docente</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{visible.map(item => <tr key={item.id}>
            <td className="p-5"><div className="flex items-center gap-3"><Avatar name={item.name} size="sm" /><div><span className="whitespace-nowrap font-semibold">{item.name}</span><div className="mt-1"><Badge tone={!isActiveUser(item) ? 'neutral' : item.role === 'admin' ? 'purple' : item.role === 'teacher' ? 'amber' : 'neutral'}>{!isActiveUser(item) ? 'Conta inativa' : roleLabels[item.role]}</Badge></div></div></div></td>
            <td className="p-5 text-slate-500">{item.email}</td>
            <td className="min-w-52 p-5"><Select aria-label={`Cargo de ${item.name}`} value={item.role} disabled={!isActiveUser(item) || item.role === 'admin' && admins === 1} onChange={event => { setCompared(false); setChange({ id: item.id, revision: item.revision ?? 0, role: event.target.value as Role, action: 'role' }); }}><option value="student">Aluno</option><option value="teacher">Professor</option><option value="admin">Administrador</option></Select></td>
            <td className="p-5">{item.role === 'teacher' && <div className="flex flex-wrap gap-2">
              {isActiveUser(item) && <><Button variant="ghost" aria-label={`Editar docente ${item.name}`} onClick={() => openEditor(item)}><Pencil aria-hidden="true" className="size-4" />Editar</Button><Button variant="ghost" aria-label={`Inativar docente ${item.name}`} onClick={() => { setCompared(false); setChange({ id: item.id, revision: item.revision ?? 0, action: 'deactivate' }); }}><UserMinus aria-hidden="true" className="size-4" />Inativar</Button></>}
              <Button variant="ghost" aria-label={`Excluir docente ${item.name}`} onClick={() => { setCompared(false); setChange({ id: item.id, revision: item.revision ?? 0, action: 'delete' }); }}><Trash2 aria-hidden="true" className="size-4" />Excluir</Button>
            </div>}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </Card> : <Empty title="Nenhum usuário encontrado" description="Altere o nome, e-mail ou cargo pesquisado." />}
    <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />O último administrador ativo não pode perder o cargo. A demonstração usa dados fictícios e permissões simuladas no navegador.</p>

    <Dialog open={!!editor} onClose={closeEditor} title={editor?.id ? 'Editar docente' : 'Cadastrar docente'}>
      <form className="space-y-4" onSubmit={async event => {
        event.preventDefault();
        if (!editor || editConflict) return;
        setError('');
        if (users.some(item => item.id !== editor.id && item.email.toLowerCase() === email.trim().toLowerCase())) { setError('Este e-mail já está cadastrado. Altere o cargo da conta existente para Professor.'); return; }
        const ok = await mutate(draft => {
          if (editor.id) {
            const record = draft.users.find(item => item.id === editor.id);
            if (!record || record.deletedAt || record.active === false || record.role !== 'teacher') throw new Error('Este docente não está mais disponível para edição.');
            record.name = name.trim(); record.email = email.trim().toLowerCase();
          } else draft.users.push({ id: uid('user'), name: name.trim(), email: email.trim().toLowerCase(), role: 'teacher', active: true });
        }, 'Docente salvo.', editor.id ? { expected: [{ collection: 'users', id: editor.id, revision: editor.revision }] } : undefined);
        if (ok) setEditor(null);
        else setError('Não foi possível salvar. Confira a mensagem e tente novamente; seu preenchimento foi mantido.');
      }}>
        <p className="text-sm leading-6 text-slate-500">Cargo global: Professor. Depois do cadastro, atribua o docente às disciplinas em que atuará.</p>
        <Input label="Nome" value={name} onChange={event => setName(event.target.value)} required maxLength={100} />
        <Input label="E-mail" type="email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} error={error} />
        {editConflict && <div role="alert" className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6"><p>Este cadastro mudou desde a abertura. Seu preenchimento foi mantido.</p>{current && !current.deletedAt ? <><p>Última alteração: {author(current)} · {when(current)}.</p><Button variant="secondary" onClick={() => setCompared(true)}>Conferir versão atual</Button>{compared && <><p>Nome atual: {current.name}<br />E-mail atual: {current.email}<br />Cargo atual: {roleLabels[current.role]} · {isActiveUser(current) ? 'Ativo' : 'Inativo'}</p>{current.role === 'teacher' && isActiveUser(current) && <Button variant="secondary" onClick={() => { setEditor({ ...editor!, revision: current.revision ?? 0 }); setCompared(false); }}>Conferi a versão atual; manter meu preenchimento</Button>}</>}</> : <p>O cadastro foi retirado. Feche esta edição para voltar à lista.</p>}</div>}
        <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={closeEditor}>Cancelar</Button><Button type="submit" loading={busy} disabled={editConflict || !name.trim()}>Salvar docente</Button></div>
      </form>
    </Dialog>

    <Dialog open={!!change} onClose={() => { if (!busy) setChange(null); }} title={change?.action === 'role' ? 'Alterar perfil de acesso?' : change?.action === 'delete' ? 'Excluir docente?' : 'Inativar docente?'}>
      <div className="space-y-4 text-sm leading-6">
        <p>{changedUser?.name}{change?.action === 'role' ? ` passará a ser ${change.role ? roleLabels[change.role].toLowerCase() : ''}.` : change?.action === 'delete' ? ' sairá das listas de docentes e perderá acesso.' : ' perderá acesso à plataforma.'} Esta alteração afeta apenas os dados da demonstração.</p>
        {changedUser?.role === 'teacher' && (change?.action !== 'role' || change.role !== 'teacher') && <p>As {assignments} atribuições atuais serão encerradas. Materiais, avisos, frequência e registros anteriores conservarão autoria e histórico. A exclusão é lógica, sem restauração pela interface.</p>}
        {actionConflict && <div role="alert" className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4"><p>O cadastro mudou. Confira a versão atual antes de confirmar a ação.</p>{changedUser && !changedUser.deletedAt && <><p>{changedUser.name} · {roleLabels[changedUser.role]} · {isActiveUser(changedUser) ? 'Ativo' : 'Inativo'}<br />Última alteração: {author(changedUser)} · {when(changedUser)}</p><Button variant="secondary" onClick={() => setChange({ ...change!, revision: changedUser.revision ?? 0 })}>Conferi a versão atual</Button></>}</div>}
        <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={() => setChange(null)}>Cancelar</Button><Button loading={busy} disabled={actionConflict} onClick={async () => {
          if (!change || actionConflict) return;
          const ok = await mutate(draft => {
            const record = draft.users.find(item => item.id === change.id);
            if (!record || record.deletedAt) throw new Error('O usuário não está mais disponível.');
            if (change.action === 'role' && change.role) record.role = change.role;
            else { record.active = false; if (change.action === 'delete') record.deletedAt = new Date().toISOString(); }
          }, change.action === 'role' ? 'Perfil atualizado. Notificação ao usuário simulada.' : change.action === 'delete' ? 'Docente excluído. Histórico preservado.' : 'Docente inativado. Histórico preservado.', { expected: [{ collection: 'users', id: change.id, revision: change.revision }] });
          if (ok) setChange(null);
        }}>Confirmar alteração</Button></div>
      </div>
    </Dialog>
  </>;
}

'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, LogOut } from 'lucide-react';
import { useApp, useSession } from '@/providers/app-context';
import { Avatar, Badge, Button, Card, Input, LinkButton, PageHeading, ErrorState, Skeleton } from '@/components/ui';
import { roleLabels } from '@/lib/utils';
import { HttpError } from '@/lib/http-client';
import { useHttpQuery } from '@/hooks/use-http-query';
import { PrivacyNotice } from '@/features/privacy';
import { createSubjectsApi } from '@/features/subjects';

export function ProfilePage() {
  const { user, client, sessionKey, resourceEpoch } = useSession();
  const { notify } = useApp();
  const router = useRouter();
  const subjectsApi = useMemo(() => createSubjectsApi(client), [client]);
  const [restoredDraft] = useState(() => client.readProfileDraft());
  const [name, setName] = useState(restoredDraft?.name ?? user?.name ?? '');
  const [revision, setRevision] = useState(restoredDraft?.revision ?? user?.revision ?? 1);
  const [conflict, setConflict] = useState<{ name: string; revision: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [error, setError] = useState('');
  const enrollments = useHttpQuery({ sessionKey, key: `profile-enrollments:${user?.emailConfirmedAt ?? ''}:${resourceEpoch}` }, useCallback(signal => client.readEnrollments(signal), [client]), user?.role === 'student');
  const assignedSubjects = useHttpQuery({ sessionKey, key: `profile-subjects:${resourceEpoch}` }, useCallback(async signal => {
    const items = [];
    for (let page = 1; ; page++) {
      const result = await subjectsApi.list('', 'all', page, signal);
      items.push(...result.items);
      if (items.length >= result.total || !result.items.length) return items;
    }
  }, [subjectsApi]), user?.role === 'teacher');
  if (!user) return null;
  const logout = async () => {
    if (exiting) return;
    setExiting(true);
    try { await client.logout(); router.replace('/login'); }
    catch (cause: unknown) { notify(cause instanceof Error ? cause.message : 'Não foi possível encerrar a sessão. Tente novamente.', true); }
    finally { setExiting(false); }
  };
  const save = async () => {
    if (busy || conflict) return;
    setBusy(true); setError('');
    try {
      const saved = await client.updateProfile(name.trim(), revision);
      setRevision(saved.revision ?? revision + 1);
      notify('Perfil atualizado.');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar. Seu preenchimento foi mantido.');
      if (cause instanceof HttpError && cause.kind === 'conflict') {
        try {
          const current = await client.readProfile();
          setConflict({ name: current.name, revision: current.revision ?? 1 });
        } catch { setError('Não foi possível consultar a versão atual. Seu preenchimento foi mantido. Tente salvar novamente para conferir.'); }
      }
    } finally { setBusy(false); }
  };
  const requestConfirmation = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { notify((await client.requestConfirmation(user.email)).message); }
    catch (cause: unknown) { setError(cause instanceof Error ? cause.message : 'Não foi possível solicitar a confirmação.'); }
    finally { setBusy(false); }
  };
  return <>
    <LinkButton secondary href="/" className="mb-5"><ArrowLeft aria-hidden="true" className="size-4" />Voltar ao painel</LinkButton>
    <PageHeading title="Meu perfil" description="Consulte e atualize seus dados cadastrais." action={<Button variant="secondary" loading={exiting} onClick={() => void logout()}><LogOut aria-hidden="true" className="size-4" />Sair da conta</Button>} />
    {user.emailConfirmedAt === null && <Card className="mb-6"><h2 className="font-semibold">Confirme seu e-mail</h2><p className="mb-4 mt-2 text-sm leading-6 text-slate-600">Solicite as instruções para confirmar o endereço da sua conta. O vínculo acadêmico será verificado após a confirmação.</p><Button loading={busy} onClick={() => void requestConfirmation()}>Solicitar confirmação de e-mail</Button></Card>}
    <div className="mb-4"><PrivacyNotice /></div>
    <div className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Card className="text-center"><div className="mb-4 flex justify-center"><Avatar name={user.name} size="lg" /></div><h2 className="text-lg font-semibold">{user.name}</h2><p className="mt-1 break-all text-sm text-slate-500">{user.email}</p><div className="my-4"><Badge tone="purple">{roleLabels[user.role]}</Badge></div>
        <div className="mt-6 border-t border-slate-100 pt-5 text-left">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{user.role === 'teacher' ? 'Minhas disciplinas' : user.role === 'admin' ? 'Escopo de acesso' : 'Meus vínculos'}</h3>
          {user.role === 'student' && (enrollments.loading ? <Skeleton /> : enrollments.error ? <ErrorState message={enrollments.error.message} retry={() => void enrollments.retry()} /> : !enrollments.data?.items.length ? <p className="text-sm text-slate-500">Nenhum vínculo cadastrado.</p> : enrollments.data.items.map(item => <p key={item.id} className="py-1 text-sm text-slate-600">{item.className ?? 'Turma indisponível'} · {({ active: 'Matrícula ativa', pending: 'Matrícula pendente', ended: 'Vínculo encerrado', cancelled: 'Matrícula cancelada' } as Record<string, string>)[item.status] ?? item.status}</p>))}
          {user.role === 'teacher' && (assignedSubjects.loading ? <Skeleton /> : assignedSubjects.error ? <ErrorState message={assignedSubjects.error.message} retry={() => void assignedSubjects.retry()} /> : !assignedSubjects.data?.length ? <p className="text-sm text-slate-500">Nenhuma disciplina atribuída.</p> : assignedSubjects.data.map(subject => <p key={subject.id} className="py-1 text-sm text-slate-600">{subject.name} · {subject.className}</p>))}
          {user.role === 'admin' && <p className="text-sm text-slate-600">Acesso completo às turmas, disciplinas e gestão da plataforma.</p>}
        </div>
      </Card>
      <Card><h2 className="mb-6 text-lg font-semibold">Dados cadastrais</h2>
        {conflict && <div role="alert" className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm"><p>O perfil mudou. Nome atual: {conflict.name}. Seu nome em edição foi mantido.</p><Button variant="secondary" onClick={() => { setRevision(conflict.revision); client.saveProfileDraft({ name, revision: conflict.revision }); setConflict(null); }}>Conferi a versão atual</Button></div>}
        <form className="space-y-5" onSubmit={event => { event.preventDefault(); void save(); }}><fieldset disabled={busy} className="space-y-5"><Input label="Nome completo" value={name} onChange={event => { setName(event.target.value); client.saveProfileDraft({ name: event.target.value, revision }); }} required minLength={3} maxLength={100} /><Input label="E-mail" type="email" value={user.email} readOnly /><div className="flex justify-end"><Button loading={busy} disabled={!!conflict} type="submit">Salvar alterações</Button></div></fieldset></form>
        {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      </Card>
    </div>
  </>;
}

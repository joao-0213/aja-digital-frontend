'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, KeyRound, LogOut } from 'lucide-react';
import { useApp, useSession } from '@/providers/app-context';
import {
  Avatar,
  Badge,
  Button,
  Card,
  ErrorState,
  LinkButton,
  PageHeading,
  Skeleton
} from '@/components/ui';
import { roleLabels } from '@/lib/labels';
import { PrivacyNotice } from '@/features/privacy';
import { useProfileEnrollments, useProfileSubjects } from '../hooks/use-profile';
import { toErrorMessage } from '@/lib/errors';

export function ProfilePage() {
  const { user, client } = useSession();
  const { notify } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [passwordRequested, setPasswordRequested] = useState(false);
  const [error, setError] = useState('');
  const enrollments = useProfileEnrollments(user?.emailConfirmedAt, user?.role === 'student');
  const assignedSubjects = useProfileSubjects(user?.role === 'teacher');
  if (!user) return null;

  const logout = async () => {
    if (exiting) return;
    setExiting(true);
    try {
      await client.logout();
      router.replace('/login');
    } catch (cause: unknown) {
      notify(toErrorMessage(cause, 'Não foi possível encerrar a sessão. Tente novamente.'), true);
    } finally {
      setExiting(false);
    }
  };

  const requestConfirmation = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      notify((await client.requestConfirmation(user.email)).message);
    } catch (cause: unknown) {
      setError(toErrorMessage(cause, 'Não foi possível solicitar a confirmação.'));
    } finally {
      setBusy(false);
    }
  };

  const requestPasswordChange = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await client.requestRecovery(user.email);
      setPasswordRequested(true);
      notify(response.message);
    } catch (cause: unknown) {
      setError(toErrorMessage(cause, 'Não foi possível enviar o link para alterar a senha.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <LinkButton secondary href="/" className="mb-5">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar ao painel
      </LinkButton>
      <PageHeading
        title="Meu perfil"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <PrivacyNotice />
            <Button variant="secondary" loading={exiting} onClick={() => void logout()}>
              <LogOut aria-hidden="true" className="size-4" />
              Sair da conta
            </Button>
          </div>
        }
      />
      {user.emailConfirmedAt === null && (
        <Card className="mb-6">
          <h2 className="font-semibold">Confirme seu e-mail</h2>
          <p className="mb-4 mt-2 text-sm leading-6 text-slate-600">
            Solicite as instruções para confirmar o endereço da sua conta. O vínculo acadêmico será
            verificado após a confirmação.
          </p>
          <Button loading={busy} onClick={() => void requestConfirmation()}>
            Solicitar confirmação de e-mail
          </Button>
        </Card>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="text-center">
          <div className="mb-4 flex justify-center">
            <Avatar name={user.name} size="lg" />
          </div>
          <h2 className="text-lg font-semibold [overflow-wrap:anywhere]">{user.name}</h2>
          <p className="mt-1 break-all text-sm text-slate-500">{user.email}</p>
          <div className="my-4">
            <Badge tone="purple">{roleLabels[user.role]}</Badge>
          </div>
          <div className="mt-6 border-t border-slate-100 pt-5 text-left">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {user.role === 'teacher'
                ? 'Minhas disciplinas'
                : user.role === 'admin'
                  ? 'Escopo de acesso'
                  : 'Meus vínculos'}
            </h3>
            {user.role === 'student' &&
              (enrollments.loading ? (
                <Skeleton />
              ) : enrollments.error ? (
                <ErrorState
                  message={enrollments.error.message}
                  retry={() => void enrollments.retry()}
                />
              ) : !enrollments.data?.items.length ? (
                <p className="text-sm text-slate-500">Nenhum vínculo cadastrado.</p>
              ) : (
                enrollments.data.items.map((item) => (
                  <p key={item.id} className="py-1 text-sm text-slate-600">
                    {item.className ?? 'Turma indisponível'} ·{' '}
                    {(
                      {
                        active: 'Matrícula ativa',
                        pending: 'Matrícula pendente',
                        ended: 'Vínculo encerrado',
                        cancelled: 'Matrícula cancelada'
                      } as Record<string, string>
                    )[item.status] ?? item.status}
                  </p>
                ))
              ))}
            {user.role === 'teacher' &&
              (assignedSubjects.loading ? (
                <Skeleton />
              ) : assignedSubjects.error ? (
                <ErrorState
                  message={assignedSubjects.error.message}
                  retry={() => void assignedSubjects.retry()}
                />
              ) : !assignedSubjects.data?.length ? (
                <p className="text-sm text-slate-500">Nenhuma disciplina atribuída.</p>
              ) : (
                assignedSubjects.data.map((subject) => (
                  <p key={subject.id} className="py-1 text-sm text-slate-600">
                    {subject.name} · {subject.className}
                  </p>
                ))
              ))}
            {user.role === 'admin' && (
              <p className="text-sm text-slate-600">
                Acesso completo às turmas, disciplinas e gestão da plataforma.
              </p>
            )}
          </div>
        </Card>
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 text-lg font-semibold">Dados da conta</h2>
            <dl className="divide-y divide-slate-100 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                <dt className="text-slate-500">Nome completo</dt>
                <dd className="font-medium text-slate-900 [overflow-wrap:anywhere]">{user.name}</dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                <dt className="text-slate-500">E-mail</dt>
                <dd className="break-all font-medium text-slate-900">{user.email}</dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                <dt className="text-slate-500">Perfil</dt>
                <dd className="font-medium text-slate-900">{roleLabels[user.role]}</dd>
              </div>
            </dl>
          </Card>
          <Card>
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                <KeyRound aria-hidden="true" className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-slate-900">Alterar senha</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Enviaremos um link de uso único para{' '}
                  <strong className="font-medium text-slate-800">{user.email}</strong> para você
                  definir uma nova senha.
                </p>
                {passwordRequested && (
                  <div
                    role="status"
                    className="mt-4 flex items-start gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50 p-3.5 text-sm text-emerald-900"
                  >
                    <CheckCircle2
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-emerald-600"
                    />
                    <span>Confira seu e-mail para abrir o link de definição de nova senha.</span>
                  </div>
                )}
                {error && (
                  <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
                    {error}
                  </p>
                )}
                <div className="mt-5">
                  <Button loading={busy} onClick={() => void requestPasswordChange()}>
                    {passwordRequested
                      ? 'Reenviar link de alteração'
                      : 'Enviar link para alterar senha'}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

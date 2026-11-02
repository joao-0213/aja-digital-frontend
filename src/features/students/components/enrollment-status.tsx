'use client';

import { useCallback } from 'react';
import { useSession } from '@/providers/app-context';
import { Card, Skeleton, ErrorState } from '@/components/ui';
import { useHttpQuery } from '@/hooks/use-http-query';

/** Own-account status uses the same service projection as the profile. */
export function EnrollmentStatus() {
  const { client, user, sessionKey, resourceEpoch } = useSession();
  const query = useHttpQuery({ sessionKey, key: `own-enrollment:${user?.emailConfirmedAt ?? ''}:${resourceEpoch}` }, useCallback(signal => client.readEnrollments(signal), [client]), user?.role === 'student');
  if (user?.role !== 'student') return null;
  if (query.loading) return <Skeleton />;
  if (query.error) return <ErrorState message={query.error.message} retry={() => void query.retry()} />;
  const active = query.data?.items.filter(item => item.status === 'active') ?? [];
  if (active.length > 1) return <Card className="mb-6"><h2 className="font-semibold">Regularização de matrícula necessária</h2><p className="mt-2 text-sm leading-6 text-slate-600">Há vínculos em mais de uma turma ativa. Peça à administração para conferir e encerrar explicitamente o vínculo incorreto. O histórico foi preservado; não há transferência automática.</p></Card>;
  if (!active.length) return <Card className="mb-6"><h2 className="font-semibold">Aguardando inclusão em turma</h2><p className="mt-2 break-words text-sm leading-6 text-slate-600">Informe {user.email} à administração para regularizar sua matrícula. {user.emailConfirmedAt === null ? 'Confirme seu e-mail usando as instruções da sua conta.' : 'Confirmar o e-mail não cria uma matrícula automaticamente.'}</p></Card>;
  return <Card className="mb-6"><h2 className="font-semibold">Matrícula ativa — {active[0].className ?? 'Turma indisponível'}</h2><p className="mt-2 text-sm text-slate-600">{active[0].enrolledAt ? `Efetivada em ${new Date(active[0].enrolledAt).toLocaleString('pt-BR')}. As atividades consideram a data da sua entrada.` : 'Matrícula anterior — data não registrada.'}</p></Card>;
}

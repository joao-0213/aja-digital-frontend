'use client';

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useSession } from '@/providers/app-context';
import {
  Avatar,
  Card,
  Empty,
  LinkButton,
  PageHeading,
  Skeleton,
  ErrorState
} from '@/components/ui';
import { brazilDateTimeLabel, dateLabel } from '@/lib/utils';
import { useHttpQuery } from '@/hooks/use-http-query';
import { createStudentsApi } from '../api';
import { createAttendanceApi } from '@/features/attendance';

export function StudentDetails() {
  const { client, user, sessionKey } = useSession();
  const id = useSearchParams().get('id') ?? '';
  const api = useMemo(() => createStudentsApi(client), [client]);
  const attendanceApi = useMemo(() => createAttendanceApi(client), [client]);
  const allowed = !!user && user.role !== 'student' && !!id;
  const query = useHttpQuery(
    { sessionKey, key: ['students', 'detail', id] },
    useCallback((signal) => api.read(id, signal), [api, id]),
    allowed
  );
  const attendance = useHttpQuery(
    { sessionKey, key: ['students', 'attendance', id] },
    useCallback(
      async (signal) => {
        const [history, subjects] = await Promise.all([
          attendanceApi.staffHistory(id, signal),
          attendanceApi.subjects(signal)
        ]);
        const subjectNames = new Map(subjects.map((subject) => [subject.id, subject.name]));
        return history.map((item) => ({
          ...item,
          subjectName: subjectNames.get(item.subjectId) ?? item.subjectName
        }));
      },
      [attendanceApi, id]
    ),
    allowed && !!query.data
  );
  if (user?.role === 'student') return <Empty title="Acesso reservado à equipe pedagógica" />;
  if (!id)
    return (
      <Empty
        title="Selecione um aluno"
        description="Volte à lista de alunos para abrir um perfil."
        action={
          <LinkButton secondary href="/alunos">
            <ArrowLeft aria-hidden="true" className="size-4" />
            Voltar aos alunos
          </LinkButton>
        }
      />
    );
  if (query.loading) return <Skeleton />;
  if (query.error)
    return (
      <>
        <LinkButton secondary href="/alunos" className="mb-5">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Voltar aos alunos
        </LinkButton>
        <ErrorState message={query.error.message} retry={() => void query.retry()} />
      </>
    );
  const detail = query.data;
  if (!detail)
    return (
      <Empty
        title="Aluno indisponível neste contexto"
        action={
          <LinkButton secondary href="/alunos">
            <ArrowLeft aria-hidden="true" className="size-4" />
            Voltar aos alunos
          </LinkButton>
        }
      />
    );
  return (
    <>
      <LinkButton secondary href="/alunos" className="mb-5">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar aos alunos
      </LinkButton>
      <PageHeading title={detail.student.name} />
      <div className="grid items-start gap-6 lg:grid-cols-[280px_1fr]">
        <Card>
          <Avatar name={detail.student.name} size="lg" />
          <h2 className="mt-5 text-lg font-semibold [overflow-wrap:anywhere]">
            {detail.student.name}
          </h2>
          <p className="mt-2 break-all text-sm text-slate-500">{detail.student.email}</p>
        </Card>
        <Card>
          <h2 className="mb-5 font-semibold">Matrículas</h2>
          {detail.enrollments.map((item) => (
            <p key={item.id} className="py-2 text-sm leading-6 text-slate-600">
              {item.className ?? 'Turma indisponível'} ·{' '}
              {item.status === 'active'
                ? 'Ativo'
                : item.status === 'pending'
                  ? 'Pendente'
                  : item.status === 'cancelled'
                    ? 'Cancelado'
                    : 'Encerrado'}
              <br />
              {item.legacy
                ? 'Matrícula anterior — data não registrada'
                : item.enrolledAt
                  ? `Efetivada em ${brazilDateTimeLabel(item.enrolledAt)}`
                  : 'Data de efetivação não registrada'}
              {item.endedAt && ` · Encerrada em ${brazilDateTimeLabel(item.endedAt)}`}
            </p>
          ))}
          {!detail.enrollments.length && (
            <p className="text-sm text-slate-500">Nenhuma matrícula registrada.</p>
          )}
        </Card>
      </div>
      <Card className="mt-6">
        <h2 className="mb-4 font-semibold">Histórico de frequência</h2>
        {attendance.loading ? (
          <Skeleton />
        ) : attendance.error ? (
          <ErrorState message={attendance.error.message} retry={() => void attendance.retry()} />
        ) : attendance.data?.length ? (
          <ul className="divide-y divide-slate-100">
            {attendance.data.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
              >
                <span>
                  {item.subjectName} · {dateLabel(item.date)} às {item.time}
                </span>
                <strong className={item.present ? 'text-emerald-700' : 'text-rose-700'}>
                  {item.present ? 'Presente' : 'Ausente'}
                </strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Nenhuma marcação de frequência neste contexto.</p>
        )}
      </Card>
    </>
  );
}

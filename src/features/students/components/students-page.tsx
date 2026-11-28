'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useSession } from '@/providers/app-context';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Check,
  Empty,
  Input,
  LinkButton,
  PageHeading,
  Select,
  Skeleton,
  ErrorState
} from '@/components/ui';
import { useHttpQuery } from '@/hooks/use-http-query';
import { useEditableDialogSelection } from '@/hooks/use-editable-dialog-selection';
import { useUrlFilterParam } from '@/hooks/use-url-filter-param';
import { brazilDateTimeLabel } from '@/lib/utils';
import { aggregateAttendanceByStudent } from '../lib/attendance-summary';
import { useAttendanceApi } from '@/features/attendance';
import { useClassesApi } from '@/features/classes';
import type { EnrollmentDto } from '../api';
import { studentKeys, useStudentsApi } from '../hooks/use-students';
import { BatchEnrollmentDialog } from './batch-enrollment-dialog';
import { EnrollmentDialog, type EnrollmentCommandSelection } from './enrollment-dialog';

type Selection =
  | {
      action: 'add';
      classId: string;
      className: string;
      intent: string;
    }
  | EnrollmentCommandSelection;

const labels: Record<string, string> = {
  active: 'Ativo',
  pending: 'Pendente',
  ended: 'Encerrado',
  cancelled: 'Cancelado'
};

export function StudentsPage() {
  const { sessionKey, user } = useSession();
  const params = useSearchParams();
  const api = useStudentsApi();
  const attendanceApi = useAttendanceApi();
  const classApi = useClassesApi();
  const requestedClassId = params.get('turma') ?? '';
  const [selectedClassId, setSelectedClassId] = useUrlFilterParam(requestedClassId);
  const [search, setSearch] = useState('');
  const [history, setHistory] = useState(false);
  const [page, setPage] = useState(1);
  const [enrollmentPage, setEnrollmentPage] = useState(1);
  const {
    selection,
    open: openSelection,
    close
  } = useEditableDialogSelection<Selection>('students-open', 'students-fields');
  const allowed = !!user && user.role !== 'student';
  const classes = useHttpQuery(
    { sessionKey, key: studentKeys.classOptions },
    useCallback((signal) => classApi.options(signal), [classApi]),
    allowed
  );
  const classId = selectedClassId || classes.data?.[0]?.id || '';
  const schoolClass = classes.data?.find((item) => item.id === classId);
  const students = useHttpQuery(
    {
      sessionKey,
      key: ['students', 'list', classId, search, history, page]
    },
    useCallback(
      (signal) => api.list(classId, search, history, page, signal),
      [api, classId, search, history, page]
    ),
    { enabled: allowed && !!classId, keepPreviousData: true }
  );
  const enrollments = useHttpQuery(
    {
      sessionKey,
      key: ['students', 'enrollments', classId, search, history, enrollmentPage]
    },
    useCallback(
      (signal) => api.enrollments(classId, search, history, enrollmentPage, signal),
      [api, classId, search, history, enrollmentPage]
    ),
    { enabled: user?.role === 'admin' && !!classId, keepPreviousData: true }
  );
  const classAttendance = useHttpQuery(
    { sessionKey, key: ['students', 'attendance-summary', classId] },
    useCallback(
      async (signal) => {
        const subjects = await attendanceApi.subjects(signal);
        const classSubjects = subjects.filter((subject) => subject.classId === classId);
        if (!classSubjects.length) return new Map<string, { present: number; total: number }>();
        const lessonsBySubject = await Promise.all(
          classSubjects.map((subject) => attendanceApi.subjectLessons(subject.id, signal))
        );
        return aggregateAttendanceByStudent(lessonsBySubject.flat());
      },
      [attendanceApi, classId]
    ),
    allowed && !!classId
  );
  if (!allowed)
    return (
      <Empty
        title="Área da equipe pedagógica"
        description="Seu perfil não permite consultar os alunos de outras contas."
        action={
          <LinkButton secondary href="/">
            Voltar ao painel
          </LinkButton>
        }
      />
    );
  const visible = students.data?.items ?? [];
  const pending = enrollments.data?.items ?? [];
  const openAdd = () => {
    openSelection({
      action: 'add',
      classId,
      className: schoolClass?.name ?? 'Turma indisponível',
      intent: crypto.randomUUID()
    });
  };
  const openCommand = (action: 'cancel' | 'end', record: EnrollmentDto) => {
    openSelection({
      action,
      record,
      classId,
      className: schoolClass?.name ?? record.className ?? 'Turma indisponível',
      intent: crypto.randomUUID()
    });
  };
  const refreshAll = () => {
    void students.invalidate();
    void enrollments.invalidate();
    void classes.invalidate();
    void classAttendance.invalidate();
  };
  return (
    <>
      <LinkButton secondary href={requestedClassId ? '/turmas' : '/'} className="mb-5">
        <ArrowLeft aria-hidden="true" className="size-4" />
        {requestedClassId ? 'Voltar às turmas' : 'Voltar ao painel'}
      </LinkButton>
      <PageHeading
        title="Alunos"
        action={
          user?.role === 'admin' && (
            <Button disabled={!schoolClass?.active || !!classes.error} onClick={openAdd}>
              Adicionar aluno por e-mail
            </Button>
          )
        }
      />
      <div className="mb-6 grid items-center gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(260px,360px)_280px_1fr]">
        <Input
          aria-label="Buscar aluno ou matrícula"
          placeholder="Buscar por nome ou e-mail…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
            setEnrollmentPage(1);
          }}
        />
        <Select
          aria-label="Turma"
          value={classId}
          onChange={(event) => {
            setSelectedClassId(event.target.value);
            setPage(1);
            setEnrollmentPage(1);
          }}
        >
          <option value="">Selecione uma turma</option>
          {classes.data?.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
              {item.active ? '' : ' (inativa)'}
            </option>
          ))}
        </Select>
        <Check
          label="Incluir histórico encerrado"
          checked={history}
          onChange={(value) => {
            setHistory(value);
            setPage(1);
            setEnrollmentPage(1);
          }}
        />
      </div>
      {classes.loading ? (
        <Skeleton />
      ) : classes.error ? (
        <ErrorState message={classes.error.message} retry={() => void classes.retry()} />
      ) : !classes.data?.length ? (
        <Empty
          title="Nenhuma turma disponível"
          description="As turmas aparecem conforme suas atribuições."
        />
      ) : !schoolClass ? (
        <Empty title="Turma indisponível neste contexto" />
      ) : students.loading || enrollments.loading ? (
        <Skeleton />
      ) : students.error || enrollments.error ? (
        <ErrorState
          message={students.error?.message ?? enrollments.error!.message}
          retry={() => {
            void students.retry();
            void enrollments.retry();
          }}
        />
      ) : (
        <>
          <Card className="!p-0 overflow-hidden">
            <h2 className="px-5 pt-5 font-semibold">Alunos vinculados — {schoolClass.name}</h2>
            <div
              className="relative overflow-x-auto"
              role="region"
              aria-label="Lista de alunos"
              tabIndex={0}
            >
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="p-5">Aluno</th>
                    <th className="p-5">Vínculo</th>
                    <th className="p-5">Frequência</th>
                    <th className="p-5">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visible.map((item) => {
                    const record = item.enrollment;
                    const attendanceSummary = item.attendance?.total
                      ? item.attendance
                      : classAttendance.data?.get(item.id);
                    return (
                      <tr key={item.id}>
                        <td className="p-5">
                          <div className="flex items-center gap-3">
                            <Avatar name={item.name} />
                            <div className="max-w-xs">
                              <p className="font-semibold [overflow-wrap:anywhere]">{item.name}</p>
                              <p className="mt-1 break-all text-xs text-slate-500">{item.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-5">
                          <Badge tone={record?.status === 'ended' ? 'neutral' : 'green'}>
                            {record ? labels[record.status] : 'Histórico'}
                          </Badge>
                          <p className="mt-2 text-xs text-slate-500">
                            {record?.legacy
                              ? 'Matrícula anterior — data não registrada'
                              : record?.enrolledAt
                                ? brazilDateTimeLabel(record.enrolledAt)
                                : 'Data não registrada'}
                          </p>
                        </td>
                        <td className="p-5">
                          {attendanceSummary?.total
                            ? `${Math.round((attendanceSummary.present / attendanceSummary.total) * 100)}% (${attendanceSummary.present}/${attendanceSummary.total})`
                            : classAttendance.loading
                              ? 'Carregando…'
                              : 'Sem registro'}
                        </td>
                        <td className="p-5">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              className="inline-flex min-h-11 items-center whitespace-nowrap font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900"
                              href={`/alunos/perfil?id=${encodeURIComponent(item.id)}`}
                            >
                              Ver perfil
                            </Link>
                            {user?.role === 'admin' && record?.status === 'active' && (
                              <Button variant="ghost" onClick={() => openCommand('end', record)}>
                                Encerrar vínculo
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!visible.length && (
              <Empty
                title="Nenhum aluno encontrado"
                description="Altere os filtros. Matrículas pendentes ainda não são participantes ativos."
              />
            )}
          </Card>
          {students.data && students.data.total > students.data.pageSize && (
            <div className="mt-4 flex items-center justify-between gap-3">
              <Button
                variant="secondary"
                disabled={page === 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Anterior
              </Button>
              <span className="text-sm">Página {page}</span>
              <Button
                variant="secondary"
                disabled={page * students.data.pageSize >= students.data.total}
                onClick={() => setPage((value) => value + 1)}
              >
                Próxima
              </Button>
            </div>
          )}
          {user?.role === 'admin' && (
            <Card className="mt-6">
              <h2 className="font-semibold">Matrículas pendentes{history && ' e canceladas'}</h2>
              <p className="mt-1 text-xs text-slate-500">Aguardam confirmação de cadastro.</p>
              <ul className="mt-4 divide-y">
                {pending.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-4"
                  >
                    <div>
                      <p className="break-all text-sm font-medium">{item.email}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {labels[item.status]} · {brazilDateTimeLabel(item.createdAt)}
                      </p>
                    </div>
                    {item.status === 'pending' && (
                      <Button variant="secondary" onClick={() => openCommand('cancel', item)}>
                        Cancelar pendência
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {!pending.length && (
                <p className="py-5 text-sm text-slate-500">Nenhuma matrícula pendente.</p>
              )}
            </Card>
          )}
          {enrollments.data && enrollments.data.total > enrollments.data.pageSize && (
            <div className="mt-4 flex items-center justify-between gap-3">
              <Button
                variant="secondary"
                disabled={enrollmentPage === 1}
                onClick={() => setEnrollmentPage((value) => value - 1)}
              >
                Vínculos anteriores
              </Button>
              <span className="text-sm">Lote de vínculos {enrollmentPage}</span>
              <Button
                variant="secondary"
                disabled={enrollmentPage * enrollments.data.pageSize >= enrollments.data.total}
                onClick={() => setEnrollmentPage((value) => value + 1)}
              >
                Mais vínculos
              </Button>
            </div>
          )}
        </>
      )}
      {selection &&
        (selection.action === 'add' ? (
          <BatchEnrollmentDialog
            key={selection.intent}
            classId={selection.classId}
            className={selection.className}
            initialIntent={selection.intent}
            close={close}
            onRefresh={refreshAll}
            saved={() => {
              close();
              refreshAll();
            }}
          />
        ) : (
          <EnrollmentDialog
            key={selection.intent}
            selection={selection}
            close={close}
            saved={() => {
              close();
              refreshAll();
            }}
          />
        ))}
    </>
  );
}

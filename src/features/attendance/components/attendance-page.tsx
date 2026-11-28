'use client';

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, CalendarClock } from 'lucide-react';
import { useApp, useSession } from '@/providers/app-context';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Check,
  Dialog,
  Empty,
  ErrorState,
  Input,
  LinkButton,
  PageHeading,
  Select,
  Skeleton
} from '@/components/ui';
import { cn, countLabel, dateLabel } from '@/lib/utils';
import { useHttpQuery } from '@/hooks/use-http-query';
import { useUrlFilterParam } from '@/hooks/use-url-filter-param';
import { RecordConflict } from '@/components/shared/record-conflict';
import { compareAttendanceRecords } from '../lib/attendance-comparison';
import { attendanceKeys, useAttendanceApi } from '../hooks/use-attendance';
import { useAttendanceSession } from '../hooks/use-attendance-session';

export function AttendancePage() {
  const { user, sessionKey } = useSession();
  const { notify } = useApp();
  const params = useSearchParams();
  const api = useAttendanceApi();
  const subjects = useHttpQuery(
    { sessionKey, key: attendanceKeys.subjects },
    useCallback((signal) => api.subjects(signal), [api]),
    user?.role !== 'student'
  );
  const requestedSubject = params.get('disciplina') ?? '';
  const [selectedSubjectParam, setSelectedSubjectParam] = useUrlFilterParam(requestedSubject);
  const available = subjects.data ?? [];
  const subjectId =
    (available.some((item) => item.id === selectedSubjectParam) ? selectedSubjectParam : '') ||
    available.find((item) => item.canManageContent)?.id ||
    available[0]?.id ||
    '';
  const selectedSubject = available.find((item) => item.id === subjectId);
  const recentLessons = useHttpQuery(
    { sessionKey, key: attendanceKeys.recent(subjectId) },
    useCallback((signal) => api.subjectLessons(subjectId, signal), [api, subjectId]),
    user?.role !== 'student' && !!subjectId
  );
  const sortedRecent = useMemo(
    () =>
      [...(recentLessons.data ?? [])].sort(
        (a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time)
      ),
    [recentLessons.data]
  );

  const onSaved = useCallback(() => notify('Frequência salva.'), [notify]);
  const { invalidate: invalidateRecent } = recentLessons;
  const onInvalidateRecent = useCallback(() => {
    void invalidateRecent();
  }, [invalidateRecent]);

  const session = useAttendanceSession({
    subjectId,
    canManageContent: !!selectedSubject?.canManageContent,
    onSaved,
    onInvalidateRecent
  });

  const students = session.roster?.items ?? [];
  const markLabel = (mark: boolean | undefined) =>
    mark === undefined ? 'Sem registro' : mark ? 'Presente' : 'Ausente';
  const presentCount = Object.values(session.records).filter(Boolean).length;
  const absentCount = Object.values(session.records).filter((value) => !value).length;
  const conflictPresentCount = session.conflictLesson
    ? Object.values(session.conflictLesson.records).filter(Boolean).length
    : 0;

  if (user?.role === 'student')
    return (
      <Empty
        title="Registro de frequência"
        description="Esta tela está disponível para professores e administradores."
        action={
          <LinkButton secondary href="/">
            Voltar ao painel
          </LinkButton>
        }
      />
    );
  if (subjects.loading && !subjects.data) return <Skeleton />;
  if (subjects.error)
    return <ErrorState message={subjects.error.message} retry={() => void subjects.retry()} />;
  if (!available.length)
    return (
      <Empty
        title="Nenhuma disciplina atribuída"
        description="A frequência pode ser registrada apenas nas disciplinas atribuídas à equipe."
        action={
          <LinkButton secondary href="/">
            Voltar ao painel
          </LinkButton>
        }
      />
    );

  return (
    <>
      <LinkButton
        secondary
        href={
          requestedSubject
            ? `/disciplinas/detalhes?id=${encodeURIComponent(requestedSubject)}`
            : '/'
        }
        className="mb-5"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {requestedSubject ? 'Voltar à disciplina' : 'Voltar ao painel'}
      </LinkButton>
      <PageHeading title="Registro de frequência" />
      <Card className="mb-6">
        <form
          className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_180px_130px_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            session.load();
          }}
        >
          <Select
            label="Disciplina / turma"
            value={subjectId}
            onChange={(event) => {
              session.invalidateSelection();
              setSelectedSubjectParam(event.target.value);
            }}
          >
            {available.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.className}
                {item.canManageContent ? '' : ' (encerrada)'}
              </option>
            ))}
          </Select>
          <Input
            label="Data da aula"
            type="date"
            value={session.date}
            onChange={(event) => session.setDate(event.target.value)}
            required
          />
          <Input
            label="Horário"
            type="time"
            value={session.time}
            onChange={(event) => session.setTime(event.target.value)}
            required
          />
          <Button
            type="submit"
            loading={session.loading}
            disabled={!subjectId || !session.date || !session.time}
          >
            Carregar chamada
          </Button>
        </form>
      </Card>
      {session.error && (
        <p role="alert" className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
          {session.error}
        </p>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="!p-0 overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <CalendarClock aria-hidden="true" className="size-4 text-brand-600" />
              Chamadas recentes
            </h2>
            {sortedRecent.length > 0 && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600">
                {sortedRecent.length}
              </span>
            )}
          </div>
          {recentLessons.loading ? (
            <div className="p-5">
              <Skeleton />
            </div>
          ) : recentLessons.error ? (
            <div className="p-5">
              <ErrorState
                message={recentLessons.error.message}
                retry={() => void recentLessons.retry()}
              />
            </div>
          ) : sortedRecent.length ? (
            <ul className="max-h-[30rem] divide-y divide-slate-100 overflow-y-auto">
              {sortedRecent.map((item) => {
                const marks = Object.values(item.records);
                const present = marks.filter(Boolean).length;
                const active = session.loaded && session.lesson?.id === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-current={active ? 'true' : undefined}
                      onClick={() => session.openSavedLesson(item)}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 border-l-2 px-5 py-3.5 text-left transition-colors hover:bg-slate-50',
                        active ? 'border-l-brand-600 bg-brand-50/60' : 'border-l-transparent'
                      )}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {dateLabel(item.date)} · {item.time}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {countLabel(present, 'presente', 'presentes')} de{' '}
                          {countLabel(marks.length, 'aluno', 'alunos')}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-brand-700">
                        {active ? 'Aberta' : 'Abrir'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="p-5 text-sm text-slate-500">
              Nenhuma chamada registrada nesta disciplina.
            </p>
          )}
        </Card>
        <div className="min-w-0">
          {session.loaded ? (
            <Card>
              {session.conflictLesson && (
                <RecordConflict
                  key={session.conflictLesson.revision}
                  author="Equipe AJA"
                  updatedAt={session.conflictLesson.updatedAt}
                  onReviewed={session.resolveConflict}
                >
                  <p>
                    Chamada atual: {conflictPresentCount}{' '}
                    {conflictPresentCount === 1 ? 'presença' : 'presenças'} em{' '}
                    {dateLabel(session.conflictLesson.date)} às {session.conflictLesson.time}.
                  </p>
                  <p>
                    Compare as marcações salvas com seu preenchimento. Os controles abaixo mantêm
                    suas alterações; ajuste-os antes de salvar.
                  </p>
                  <ul
                    aria-label="Comparação da frequência por aluno"
                    className="divide-y divide-amber-200 whitespace-normal"
                  >
                    {compareAttendanceRecords(
                      session.conflictLesson.records,
                      session.records,
                      students
                    ).map((row) => (
                      <li key={row.studentId} className="py-3">
                        <p className="font-semibold">{row.name}</p>
                        <dl className="mt-2 grid grid-cols-2 gap-3 text-xs sm:text-sm">
                          <div>
                            <dt className="font-medium">Versão salva</dt>
                            <dd>{markLabel(row.saved)}</dd>
                          </div>
                          <div>
                            <dt className="font-medium">Seu preenchimento</dt>
                            <dd>{markLabel(row.local)}</dd>
                          </div>
                        </dl>
                        {row.changed && (
                          <p className="mt-1 text-xs font-semibold">Marcação diferente</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </RecordConflict>
              )}
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-semibold">
                  {selectedSubject?.className} · {dateLabel(session.date)}
                </h2>
                <Badge tone="purple">
                  {presentCount} {presentCount === 1 ? 'presente' : 'presentes'} / {students.length}{' '}
                  {students.length === 1 ? 'aluno' : 'alunos'}
                </Badge>
              </div>
              <div className="mb-4 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={session.markAllPresent}>
                  Marcar todos presentes
                </Button>
                <Button variant="ghost" onClick={session.markAllAbsent}>
                  Marcar todos ausentes
                </Button>
              </div>
              <div className="divide-y divide-slate-100">
                {students.map((student) => (
                  <div key={student.id} className="flex items-center gap-3 py-4">
                    <Avatar name={student.name} size="sm" />
                    <span className="flex-1 text-sm font-medium">{student.name}</span>
                    <Check
                      label={session.records[student.id] ? 'Presente' : 'Ausente'}
                      checked={session.records[student.id] ?? false}
                      onChange={(value) => session.setStudentPresence(student.id, value)}
                    />
                  </div>
                ))}
              </div>
              <p className="py-5 text-xs text-slate-500">
                Exibindo apenas alunos matriculados na data da aula.
              </p>
              <div className="mt-5 flex justify-end">
                <Button
                  disabled={
                    !students.length ||
                    !!session.conflictLesson ||
                    !selectedSubject?.canManageContent
                  }
                  onClick={() => session.setConfirm(true)}
                >
                  {session.lesson ? 'Atualizar chamada' : 'Salvar chamada'}
                </Button>
              </div>
            </Card>
          ) : (
            <Empty
              title="Selecione uma aula para começar"
              description="Escolha disciplina, data e horário ou abra uma chamada recente ao lado."
            />
          )}
        </div>
      </div>
      <Dialog
        open={session.confirm}
        onClose={() => session.setConfirm(false)}
        title="Confirmar frequência"
      >
        <p className="mb-5 text-sm leading-6 text-slate-500">
          Salvar {presentCount} {presentCount === 1 ? 'presença' : 'presenças'} e {absentCount}{' '}
          {absentCount === 1 ? 'ausência' : 'ausências'} em {dateLabel(session.date)} às{' '}
          {session.time}?
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => session.setConfirm(false)}>
            Revisar
          </Button>
          <Button
            loading={session.saving}
            disabled={!!session.conflictLesson}
            onClick={session.save}
          >
            Confirmar
          </Button>
        </div>
      </Dialog>
    </>
  );
}

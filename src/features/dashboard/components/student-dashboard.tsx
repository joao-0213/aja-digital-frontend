'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  BookOpenCheck,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileUp
} from 'lucide-react';
import { Badge, Card, Empty, Skeleton } from '@/components/ui';
import { countLabel, dateLabel, percent } from '@/lib/utils';
import { sortByDeadlineAsc } from '@/lib/academic-format';
import { dashboardDeadlineParts } from '../lib/dashboard-time';
import { useAssessmentsApi } from '@/features/assessments';
import { useMaterialsApi } from '@/features/materials';
import { SubjectCard } from '@/features/subjects';
import { EnrollmentStatus } from '@/features/students';
import { useHttpQuery } from '@/hooks/use-http-query';
import { useSession } from '@/providers/app-context';
import { isStudentDashboard } from '../api';
import { useDashboardApi } from '../hooks/use-dashboard';
import { upcomingMeetings } from '../lib/upcoming-meetings';

export function StudentDashboard() {
  const { user, sessionKey } = useSession();
  const api = useDashboardApi();
  const assessmentsApi = useAssessmentsApi();
  const materialsApi = useMaterialsApi();
  const isStudent = user?.role === 'student';
  const dashboard = useHttpQuery(
    { sessionKey, key: ['dashboard', 'student'] },
    useCallback((signal) => api.read(signal), [api]),
    isStudent
  );
  const attempts = useHttpQuery(
    { sessionKey, key: ['dashboard', 'attempts'] },
    useCallback(
      (signal) => assessmentsApi.allAttempts({}, signal, sessionKey),
      [assessmentsApi, sessionKey]
    ),
    isStudent
  );
  const submissions = useHttpQuery(
    { sessionKey, key: ['dashboard', 'submissions'] },
    useCallback(
      (signal) => assessmentsApi.allSubmissions({}, signal, sessionKey),
      [assessmentsApi, sessionKey]
    ),
    isStudent
  );
  const data = isStudentDashboard(dashboard.data) ? dashboard.data : undefined;
  const subjectIdsKey = (data?.subjects ?? []).map((item) => item.id).join(',');
  const subjectMaterials = useHttpQuery(
    { sessionKey, key: ['dashboard', 'subject-materials', subjectIdsKey] },
    useCallback(
      async (signal) => {
        const ids = subjectIdsKey ? subjectIdsKey.split(',') : [];
        const entries = await Promise.all(
          ids.map(async (subjectId) => {
            try {
              const items = await materialsApi.all({ subjectId }, signal);
              return [subjectId, items.map((item) => item.id)] as const;
            } catch {
              return [subjectId, [] as string[]] as const;
            }
          })
        );
        return Object.fromEntries(entries) as Record<string, string[]>;
      },
      [materialsApi, subjectIdsKey]
    ),
    isStudent && !!subjectIdsKey
  );

  const events = upcomingMeetings(data?.upcoming ?? []);
  const completedMaterialIds = new Set(
    (data?.progress ?? []).filter((item) => item.completed).map((item) => item.materialId)
  );
  const submittedQuizIds = new Set(
    (attempts.data ?? [])
      .filter((item) => item.userId === user?.id && item.submittedAt)
      .map((item) => item.assessmentId)
  );
  const inProgressQuizIds = new Set(
    (attempts.data ?? [])
      .filter((item) => item.userId === user?.id && !item.submittedAt)
      .map((item) => item.assessmentId)
  );
  const submittedWorkIds = new Set(
    (submissions.data ?? [])
      .filter((item) => item.userId === user?.id && item.submittedAt)
      .map((item) => item.assessmentId)
  );
  const inProgressWorkIds = new Set(
    (submissions.data ?? [])
      .filter((item) => item.userId === user?.id && !item.submittedAt)
      .map((item) => item.assessmentId)
  );
  const pendingAssessments = sortByDeadlineAsc(
    (data?.assessments ?? []).filter((item) =>
      item.kind === 'quiz' ? !submittedQuizIds.has(item.id) : !submittedWorkIds.has(item.id)
    )
  );
  const materialsPct = data ? percent(data.completedMaterials, data.totalMaterials) : 0;
  const totalAssessments = data?.assessments.length ?? 0;
  const assessmentCountsReady = !attempts.loading && !submissions.loading;
  const pendingCount = assessmentCountsReady
    ? pendingAssessments.length
    : (data?.pendingAssessmentCount ?? 0);
  const completedAssessments = Math.max(0, totalAssessments - pendingCount);
  const assessmentsPct = percent(completedAssessments, totalAssessments);
  const nextPendingDeadline = pendingAssessments.find((item) => item.deadline)?.deadline ?? null;
  const nextPendingParts = dashboardDeadlineParts(nextPendingDeadline);

  return (
    <>
      <header className="mb-7 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-sm text-slate-500">Olá, {user?.name.split(' ')[0]}!</p>
          <h1 className="text-3xl font-semibold tracking-tight">Meu painel</h1>
        </div>
      </header>
      <EnrollmentStatus />
      {dashboard.loading && <Skeleton />}
      {dashboard.error && (
        <p role="alert" className="mb-6 text-sm text-red-700">
          {dashboard.error.message}{' '}
          <button
            type="button"
            className="font-bold underline underline-offset-4"
            onClick={() => void dashboard.retry()}
          >
            Tentar novamente
          </button>
        </p>
      )}
      {data && (
        <>
          <section
            aria-label="Resumo dos estudos"
            className="mb-6 grid grid-cols-3 gap-2 sm:mb-7 sm:gap-3"
          >
            <Card padding="compact" className="flex min-w-0 flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-1.5 sm:items-center sm:gap-2">
                  <p className="min-w-0 text-[11px] leading-tight text-slate-500 sm:text-sm">
                    Materiais concluídos
                  </p>
                  <BookOpenCheck
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-brand-600 sm:size-5"
                  />
                </div>
                <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-1 tabular-nums sm:mt-1">
                  <p className="text-lg font-semibold sm:text-2xl">
                    {data.completedMaterials}
                    <span className="text-xs font-normal text-slate-500 sm:text-base">
                      {' '}
                      de {data.totalMaterials}
                    </span>
                  </p>
                  <span className="text-[11px] font-semibold text-brand-700 sm:text-sm">
                    {materialsPct}%
                  </span>
                </div>
                <div
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
                  aria-hidden="true"
                >
                  <div
                    className="h-full rounded-full bg-brand-600 transition-all"
                    style={{ width: `${materialsPct}%` }}
                  />
                </div>
              </div>
              <Link
                href="/materiais"
                className="mt-2 inline-flex min-h-7 items-center text-[11px] font-bold leading-tight text-brand-700 underline underline-offset-4 hover:text-brand-900 sm:mt-2.5 sm:min-h-8 sm:text-sm"
              >
                Materiais
                <ChevronRight aria-hidden="true" className="size-3 shrink-0 sm:size-4" />
              </Link>
            </Card>

            <Card padding="compact" className="flex min-w-0 flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-1.5 sm:items-center sm:gap-2">
                  <p className="min-w-0 text-[11px] leading-tight text-slate-500 sm:text-sm">
                    Atividades concluídas
                  </p>
                  <CheckCircle2
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-brand-600 sm:size-5"
                  />
                </div>
                <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-1 tabular-nums sm:mt-1">
                  <p className="text-lg font-semibold sm:text-2xl">
                    {completedAssessments}
                    {totalAssessments > 0 && (
                      <span className="text-xs font-normal text-slate-500 sm:text-base">
                        {' '}
                        de {totalAssessments}
                      </span>
                    )}
                  </p>
                  {totalAssessments > 0 && (
                    <span className="text-[11px] font-semibold text-brand-700 sm:text-sm">
                      {assessmentsPct}%
                    </span>
                  )}
                </div>
                <div
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
                  aria-hidden="true"
                >
                  <div
                    className="h-full rounded-full bg-brand-600 transition-all"
                    style={{ width: `${assessmentsPct}%` }}
                  />
                </div>
              </div>
              <Link
                href="/questionarios"
                className="mt-2 inline-flex min-h-7 items-center text-[11px] font-bold leading-tight text-brand-700 underline underline-offset-4 hover:text-brand-900 sm:mt-2.5 sm:min-h-8 sm:text-sm"
              >
                Atividades
                <ChevronRight aria-hidden="true" className="size-3 shrink-0 sm:size-4" />
              </Link>
            </Card>

            <Card padding="compact" className="flex min-w-0 flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-1.5 sm:items-center sm:gap-2">
                  <p className="min-w-0 text-[11px] leading-tight text-slate-500 sm:text-sm">
                    {pendingCount === 1 ? 'Atividade pendente' : 'Atividades pendentes'}
                  </p>
                  <ClipboardList
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-brand-600 sm:size-5"
                  />
                </div>
                <p className="mt-1.5 text-lg font-semibold tabular-nums sm:mt-1 sm:text-2xl">
                  {pendingCount}
                </p>
                <p className="mt-1 truncate text-[11px] text-slate-500 sm:text-xs">
                  {pendingCount === 0
                    ? 'Tudo em dia'
                    : nextPendingParts
                      ? `Próxima: ${nextPendingParts.date}`
                      : 'Sem prazo definido'}
                </p>
              </div>
              <Link
                href="/questionarios"
                className="mt-2 inline-flex min-h-7 items-center text-[11px] font-bold leading-tight text-brand-700 underline underline-offset-4 hover:text-brand-900 sm:mt-2.5 sm:min-h-8 sm:text-sm"
              >
                Ver pendentes
                <ChevronRight aria-hidden="true" className="size-3 shrink-0 sm:size-4" />
              </Link>
            </Card>
          </section>

          {!data.subjects.length ? (
            <Empty
              title="Nenhuma disciplina disponível"
              description="Quando sua matrícula em uma turma estiver ativa, as disciplinas, atividades e avisos aparecerão aqui."
            />
          ) : (
            <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0 space-y-8">
                <section aria-labelledby="student-subjects">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 id="student-subjects" className="text-lg font-semibold">
                      Minhas disciplinas
                    </h2>
                    <Link
                      href="/disciplinas"
                      className="inline-flex min-h-11 items-center text-sm font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900"
                    >
                      Ver todas
                      <ChevronRight aria-hidden="true" className="size-4" />
                    </Link>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {data.subjects.map((subject) => {
                      const ids = subjectMaterials.data?.[subject.id];
                      const subjectProgress =
                        ids && ids.length > 0
                          ? {
                              completed: ids.filter((id) => completedMaterialIds.has(id)).length,
                              total: ids.length
                            }
                          : undefined;
                      return (
                        <SubjectCard
                          key={subject.id}
                          subject={subject}
                          progress={subjectProgress}
                        />
                      );
                    })}
                  </div>
                </section>

                <section aria-labelledby="student-deadlines">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 id="student-deadlines" className="text-lg font-semibold">
                      Próximas entregas
                    </h2>
                    <Link
                      href="/questionarios"
                      className="inline-flex min-h-11 items-center text-sm font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900"
                    >
                      Ver atividades
                      <ChevronRight aria-hidden="true" className="size-4" />
                    </Link>
                  </div>
                  {pendingAssessments.length ? (
                    <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                      {pendingAssessments.map((item) => {
                        const inProgress =
                          item.kind === 'quiz'
                            ? inProgressQuizIds.has(item.id)
                            : inProgressWorkIds.has(item.id);
                        const parts = dashboardDeadlineParts(item.deadline);
                        const KindIcon = item.kind === 'work' ? FileUp : ClipboardCheck;
                        const meta = [
                          item.subjectName,
                          item.kind === 'work'
                            ? 'Entrega de trabalho'
                            : countLabel(item.questionCount, 'questão', 'questões'),
                          item.required ? 'Obrigatória' : 'Opcional'
                        ]
                          .filter(Boolean)
                          .join(' · ');
                        const actionLabel = inProgress
                          ? 'Retomar'
                          : item.kind === 'work'
                            ? 'Entregar'
                            : 'Iniciar';

                        return (
                          <Link
                            key={item.id}
                            href={`/questionarios/responder?id=${encodeURIComponent(item.id)}`}
                            className="flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-slate-50/80 sm:flex-row sm:items-center sm:gap-4"
                          >
                            {parts ? (
                              <div className="inline-flex w-fit shrink-0 items-baseline gap-1.5 rounded-lg border border-brand-100 bg-brand-50/70 px-2.5 py-1.5 sm:block sm:w-20 sm:text-center">
                                <span className="text-xs font-semibold tabular-nums text-brand-700 sm:block">
                                  {parts.date}
                                </span>
                                <span className="text-[11px] tabular-nums text-brand-600/80 sm:block">
                                  {parts.time}
                                </span>
                              </div>
                            ) : (
                              <div className="inline-flex w-fit shrink-0 items-center rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-500 sm:w-20 sm:justify-center">
                                Sem prazo
                              </div>
                            )}

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <KindIcon
                                  aria-hidden="true"
                                  className="size-4 shrink-0 text-slate-400"
                                />
                                <h3 className="text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">
                                  {item.title}
                                </h3>
                                <Badge tone={inProgress ? 'blue' : 'purple'}>
                                  {inProgress ? 'Em andamento' : 'Pendente'}
                                </Badge>
                              </div>
                              <p className="mt-1 text-xs text-slate-500">{meta}</p>
                            </div>

                            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-700">
                              {actionLabel}
                              <ChevronRight aria-hidden="true" className="size-4" />
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  ) : (
                    <Card>
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                          <CheckCircle2 aria-hidden="true" className="size-4" />
                        </div>
                        <p className="text-sm text-slate-600">
                          Nenhuma entrega pendente. Você está em dia com suas atividades.
                        </p>
                      </div>
                    </Card>
                  )}
                </section>

                {data.resume && (
                  <section aria-labelledby="student-resume">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h2 id="student-resume" className="text-lg font-semibold">
                        Continuar estudos
                      </h2>
                      <Link
                        href="/materiais"
                        className="inline-flex min-h-11 items-center text-sm font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900"
                      >
                        Biblioteca
                        <ChevronRight aria-hidden="true" className="size-4" />
                      </Link>
                    </div>
                    <Link
                      href={`/materiais?id=${encodeURIComponent(data.resume.id)}`}
                      className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 transition-colors hover:border-brand-200 hover:bg-brand-50/30"
                    >
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                        <BookOpen aria-hidden="true" className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="block text-xs text-slate-500">
                          Último material acessado
                        </span>
                        <span className="mt-0.5 block text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">
                          {data.resume.title}
                        </span>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-700">
                        Retomar
                        <ChevronRight aria-hidden="true" className="size-4" />
                      </span>
                    </Link>
                  </section>
                )}

                <section
                  aria-labelledby="student-forum"
                  className="border-t border-slate-200 pt-6"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h2 id="student-forum" className="text-lg font-semibold">
                      Dúvidas da turma
                    </h2>
                    <Link
                      href="/forum"
                      className="inline-flex min-h-11 items-center text-sm font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900"
                    >
                      Abrir fórum
                      <ChevronRight aria-hidden="true" className="size-4" />
                    </Link>
                  </div>
                  {data.topics.length ? (
                    <div className="divide-y divide-slate-200">
                      {data.topics.map((topic) => (
                        <Link
                          key={topic.id}
                          href={topic.href}
                          className="block rounded-lg py-3 text-sm [overflow-wrap:anywhere] hover:bg-slate-100/70"
                        >
                          <span className="font-medium text-slate-800">{topic.title}</span>
                          <span className="mt-1 block text-xs text-slate-500">
                            {countLabel(topic.replyCount, 'resposta', 'respostas')} ·{' '}
                            {topic.subjectName}
                          </span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="py-3 text-sm text-slate-500">Nenhuma dúvida publicada.</p>
                  )}
                  <Link
                    href="/questoes"
                    className="mt-3 inline-flex min-h-11 items-center text-sm font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900"
                  >
                    Acessar banco de questões
                    <ChevronRight aria-hidden="true" className="size-4" />
                  </Link>
                </section>
              </div>

              <aside aria-label="Avisos e agenda" className="min-w-0 space-y-6">
                <section aria-labelledby="student-notices" className="min-w-0">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 id="student-notices" className="text-lg font-semibold">
                      Avisos recentes
                    </h2>
                    <Link
                      href="/avisos"
                      className="inline-flex min-h-11 items-center text-sm font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900"
                    >
                      Ver todos
                      <ChevronRight aria-hidden="true" className="size-4" />
                    </Link>
                  </div>
                  <div className="divide-y divide-brand-200 rounded-xl bg-brand-50 px-5">
                    {data.announcements.map((notice) => (
                      <article key={notice.id} className="py-5">
                        <p className="mb-2 text-xs text-brand-700">
                          {data.subjects.find((subject) => subject.id === notice.subjectId)?.name ??
                            data.subjects.find((subject) => subject.classId === notice.classId)
                              ?.className}{' '}
                          · <time dateTime={notice.createdAt}>{dateLabel(notice.createdAt)}</time>
                        </p>
                        <h3 className="font-semibold leading-6 [overflow-wrap:anywhere]">
                          {notice.title}
                        </h3>
                        <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">
                          {notice.body}
                        </p>
                        <Link
                          href={`/avisos#aviso-${notice.id}`}
                          className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900"
                        >
                          Ler aviso
                          <ChevronRight aria-hidden="true" className="size-4" />
                        </Link>
                      </article>
                    ))}
                    {!data.announcements.length && (
                      <p className="py-5 text-sm text-slate-600">Nenhum aviso publicado.</p>
                    )}
                  </div>
                </section>
                <section aria-labelledby="student-events" className="px-1">
                  <h2 id="student-events" className="mb-2 text-base font-semibold">
                    Próximos encontros e prazos
                  </h2>
                  <div className="divide-y divide-slate-200">
                    {events.map((item) => (
                      <Link
                        key={item.id}
                        href={item.href}
                        className="flex items-start gap-3 rounded-lg py-3.5 text-sm hover:bg-slate-100/70"
                      >
                        <div className="w-11 shrink-0 text-center">
                          <span className="block text-lg font-semibold tabular-nums">
                            {item.date.slice(-2)}
                          </span>
                          <span className="text-xs text-slate-500">
                            {dateLabel(item.date, { month: 'short' })}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 [overflow-wrap:anywhere]">
                            {item.title}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {item.time ?? 'Dia inteiro'} ·{' '}
                            {item.source === 'announcement'
                              ? 'Acontecimento'
                              : 'Prazo de atividade'}
                          </p>
                        </div>
                      </Link>
                    ))}
                    {!events.length && (
                      <p className="py-3 text-sm text-slate-500">Nenhum encontro ou prazo futuro.</p>
                    )}
                  </div>
                </section>
              </aside>
            </div>
          )}
        </>
      )}
    </>
  );
}

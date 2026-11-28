'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  ChevronRight,
  MessageSquare,
  ClipboardCheck,
  GraduationCap,
  ListChecks,
  Upload,
  UserCog,
  UserPlus,
  Users
} from 'lucide-react';
import { Card, Skeleton } from '@/components/ui';
import { countLabel, dateLabel } from '@/lib/utils';
import { sortByDeadlineAsc } from '@/lib/academic-format';
import { dashboardDeadlineLabel } from '../lib/dashboard-time';
import { SubjectCard } from '@/features/subjects';
import { useHttpQuery } from '@/hooks/use-http-query';
import { useSession } from '@/providers/app-context';
import type { StaffDashboardDto } from '../api';
import { useDashboardApi } from '../hooks/use-dashboard';
import { upcomingMeetings } from '../lib/upcoming-meetings';

export function StaffDashboard() {
  const { user, sessionKey } = useSession();
  const api = useDashboardApi();
  const dashboard = useHttpQuery(
    { sessionKey, key: ['dashboard', user?.role ?? 'staff'] },
    useCallback((signal) => api.read(signal), [api]),
    user?.role !== 'student'
  );
  const data =
    dashboard.data && dashboard.data.role !== 'student'
      ? (dashboard.data as StaffDashboardDto)
      : undefined;
  const events = upcomingMeetings(data?.upcoming ?? []);
  const activeClassIds = new Set(
    (data?.classes ?? []).filter((item) => item.active).map((item) => item.id)
  );
  const activeSubjects = (data?.subjects ?? []).filter((subject) =>
    activeClassIds.has(subject.classId)
  );
  const visibleSubjects = activeSubjects.length ? activeSubjects : (data?.subjects ?? []);
  const isAdmin = user?.role === 'admin';
  const quickActions = isAdmin
    ? [
        { href: '/turmas', label: 'Gerenciar turmas', icon: GraduationCap },
        { href: '/usuarios', label: 'Usuários e docentes', icon: UserCog },
        { href: '/alunos', label: 'Matrículas e alunos', icon: Users }
      ]
    : [
        { href: '/disciplinas', label: 'Publicar materiais', icon: Upload },
        { href: '/questionarios/criar', label: 'Preparar atividade', icon: ClipboardCheck },
        { href: '/frequencia', label: 'Registrar frequência', icon: ListChecks }
      ];

  return (
    <>
      <header className="mb-7 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-sm text-slate-500">Olá, {user?.name.split(' ')[0]}!</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            {user?.role === 'admin' ? 'Painel da administração' : 'Sala dos professores'}
          </h1>
        </div>
      </header>
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
            aria-label="Indicadores"
            className="mb-6 grid grid-cols-3 gap-2 sm:mb-7 sm:gap-3"
          >
            <Card className="flex min-w-0 flex-col justify-between !p-3 sm:!p-6">
              <div>
                <div className="flex items-start justify-between gap-1.5 sm:items-center sm:gap-2">
                  <p className="min-w-0 text-[11px] leading-tight text-slate-500 sm:text-sm">
                    {isAdmin ? 'Alunos ativos' : 'Meus alunos'}
                  </p>
                  <Users
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-brand-600 sm:size-5"
                  />
                </div>
                <p className="mt-1.5 text-lg font-semibold tabular-nums sm:mt-1 sm:text-2xl">
                  {data.studentCount}
                </p>
              </div>
            </Card>
            <Card className="flex min-w-0 flex-col justify-between !p-3 sm:!p-6">
              <div>
                <div className="flex items-start justify-between gap-1.5 sm:items-center sm:gap-2">
                  <p className="min-w-0 text-[11px] leading-tight text-slate-500 sm:text-sm">
                    Devolutivas pendentes
                  </p>
                  <ClipboardCheck
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-brand-600 sm:size-5"
                  />
                </div>
                <p className="mt-1.5 text-lg font-semibold tabular-nums sm:mt-1 sm:text-2xl">
                  {data.pendingFeedbackCount}
                </p>
              </div>
              <Link
                href="/questionarios"
                className="mt-1.5 inline-flex min-h-7 items-center text-[11px] font-bold leading-tight text-brand-700 underline underline-offset-4 hover:text-brand-900 sm:mt-2 sm:min-h-9 sm:text-sm"
              >
                Atividades
                <ChevronRight aria-hidden="true" className="size-3 shrink-0 sm:size-4" />
              </Link>
            </Card>
            {isAdmin ? (
              <Card className="flex min-w-0 flex-col justify-between !p-3 sm:!p-6">
                <div>
                  <div className="flex items-start justify-between gap-1.5 sm:items-center sm:gap-2">
                    <p className="min-w-0 text-[11px] leading-tight text-slate-500 sm:text-sm">
                      Matrículas pendentes
                    </p>
                    <UserPlus
                      aria-hidden="true"
                      className="size-3.5 shrink-0 text-brand-600 sm:size-5"
                    />
                  </div>
                  <p className="mt-1.5 text-lg font-semibold tabular-nums sm:mt-1 sm:text-2xl">
                    {data.pendingEnrollmentCount}
                  </p>
                </div>
                <Link
                  href="/alunos"
                  className="mt-1.5 inline-flex min-h-7 items-center text-[11px] font-bold leading-tight text-brand-700 underline underline-offset-4 hover:text-brand-900 sm:mt-2 sm:min-h-9 sm:text-sm"
                >
                  Matrículas
                  <ChevronRight aria-hidden="true" className="size-3 shrink-0 sm:size-4" />
                </Link>
              </Card>
            ) : (
              <Card className="flex min-w-0 flex-col justify-between !p-3 sm:!p-6">
                <div>
                  <div className="flex items-start justify-between gap-1.5 sm:items-center sm:gap-2">
                    <p className="min-w-0 text-[11px] leading-tight text-slate-500 sm:text-sm">
                      Disciplinas ativas
                    </p>
                    <BookOpen
                      aria-hidden="true"
                      className="size-3.5 shrink-0 text-brand-600 sm:size-5"
                    />
                  </div>
                  <p className="mt-1.5 text-lg font-semibold tabular-nums sm:mt-1 sm:text-2xl">
                    {activeSubjects.length}
                  </p>
                </div>
                <Link
                  href="/disciplinas"
                  className="mt-1.5 inline-flex min-h-7 items-center text-[11px] font-bold leading-tight text-brand-700 underline underline-offset-4 hover:text-brand-900 sm:mt-2 sm:min-h-9 sm:text-sm"
                >
                  Disciplinas
                  <ChevronRight aria-hidden="true" className="size-3 shrink-0 sm:size-4" />
                </Link>
              </Card>
            )}
          </section>
          <nav aria-label="Acessos rápidos" className="mb-8 grid gap-3 sm:grid-cols-3">
            {quickActions.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:border-brand-200 hover:bg-brand-50/50"
              >
                <item.icon aria-hidden="true" className="size-5 shrink-0 text-brand-600" />
                <span className="min-w-0 flex-1 text-sm font-semibold">{item.label}</span>
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-slate-400" />
              </Link>
            ))}
          </nav>
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-8">
              <section aria-labelledby="subjects-title">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 id="subjects-title" className="text-lg font-semibold">
                    Disciplinas
                  </h2>
                  <Link
                    href="/disciplinas"
                    className="inline-flex min-h-11 items-center text-sm font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900"
                  >
                    Ver todas
                  </Link>
                </div>
                {visibleSubjects.length ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {visibleSubjects.slice(0, 4).map((subject) => (
                      <SubjectCard
                        key={subject.id}
                        subject={subject}
                        archived={!activeClassIds.has(subject.classId)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">
                    {isAdmin
                      ? 'Nenhuma disciplina cadastrada ainda.'
                      : 'Nenhuma disciplina disponível para sua conta.'}
                  </p>
                )}
              </section>
              <section aria-labelledby="forum-title">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h2 id="forum-title" className="text-lg font-semibold">
                    Dúvidas da turma
                  </h2>
                  <Link
                    href="/forum"
                    className="inline-flex min-h-11 items-center text-sm font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900"
                  >
                    Abrir fórum
                  </Link>
                </div>
                <div className="divide-y divide-slate-200">
                  {data.topics.map((topic) => (
                    <Link
                      key={topic.id}
                      href={topic.href}
                      className="flex items-start gap-3 rounded-lg py-4 hover:bg-slate-100"
                    >
                      <MessageSquare
                        aria-hidden="true"
                        className="mt-1 size-4 shrink-0 text-slate-500"
                      />
                      <div className="min-w-0">
                        <h3 className="text-sm font-medium leading-6 [overflow-wrap:anywhere]">
                          {topic.title}
                        </h3>
                        <p className="mt-1 text-xs text-slate-500">
                          {topic.subjectName} ·{' '}
                          {countLabel(topic.replyCount, 'resposta', 'respostas')}
                        </p>
                      </div>
                    </Link>
                  ))}
                  {!data.topics.length && (
                    <p className="py-4 text-sm text-slate-600">Nenhuma dúvida publicada.</p>
                  )}
                </div>
              </section>
            </div>
            <aside aria-label="Próximos encontros, prazos e avisos" className="min-w-0 space-y-6">
              <Card>
                <h2 className="text-base font-semibold">Prazos das atividades</h2>
                <div className="mt-2 divide-y divide-slate-200">
                  {sortByDeadlineAsc(data.assessments)
                    .slice(0, 3)
                    .map((item) => (
                      <Link
                        key={item.id}
                        href="/questionarios"
                        className="block rounded-lg py-4 hover:bg-slate-50"
                      >
                        <p className="mb-2 text-xs font-medium text-brand-700">
                          {item.deadline
                            ? `Até ${dashboardDeadlineLabel(item.deadline)}`
                            : 'Sem prazo'}
                        </p>
                        <h3 className="text-sm font-semibold leading-6 [overflow-wrap:anywhere]">
                          {item.title}
                        </h3>
                        <p className="mt-1 text-xs text-slate-500">
                          {[
                            item.subjectName,
                            item.kind === 'work'
                              ? 'Entrega de trabalho'
                              : countLabel(item.questionCount, 'questão', 'questões')
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </Link>
                    ))}
                  {!data.assessments.length && (
                    <p className="py-4 text-sm leading-6 text-slate-600">
                      Nenhuma atividade publicada.
                    </p>
                  )}
                </div>
                <Link
                  href="/questionarios"
                  className="inline-flex min-h-11 items-center text-sm font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900"
                >
                  Ver atividades
                  <ChevronRight aria-hidden="true" className="ml-1 size-4" />
                </Link>
              </Card>
              <section className="px-1" aria-labelledby="events-title">
                <h2 id="events-title" className="mb-2 text-base font-semibold">
                  Próximos encontros e prazos
                </h2>
                <div className="divide-y divide-slate-200">
                  {events.map((item) => (
                    <Link
                      href={item.href}
                      key={item.id}
                      className="flex items-start gap-3 rounded-lg py-4 hover:bg-slate-100"
                    >
                      <div className="w-11 shrink-0 text-center">
                        <span className="block text-xl font-semibold tabular-nums">
                          {item.date.slice(-2)}
                        </span>
                        <span className="text-xs text-slate-500">
                          {dateLabel(item.date, { month: 'short' })}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-medium leading-6 [overflow-wrap:anywhere]">
                          {item.title}
                        </h3>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.time ?? 'Dia inteiro'} ·{' '}
                          {item.source === 'announcement' ? 'Acontecimento' : 'Prazo de atividade'}
                        </p>
                      </div>
                    </Link>
                  ))}
                  {!events.length && (
                    <p className="py-4 text-sm text-slate-600">Nenhum encontro ou prazo futuro.</p>
                  )}
                </div>
              </section>
              {data.announcements[0] && (
                <section
                  className="border-t border-slate-200 px-1 pt-5"
                  aria-labelledby="notice-title"
                >
                  <h2 id="notice-title" className="mb-3 text-base font-semibold">
                    Último aviso
                  </h2>
                  <h3 className="text-sm font-medium leading-6 [overflow-wrap:anywhere]">
                    {data.announcements[0].title}
                  </h3>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">
                    {data.announcements[0].body}
                  </p>
                  <Link
                    href={`/avisos#aviso-${data.announcements[0].id}`}
                    className="mt-1 inline-flex min-h-11 items-center text-sm font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900"
                  >
                    Ler aviso
                    <ChevronRight aria-hidden="true" className="ml-1 size-4" />
                  </Link>
                </section>
              )}
            </aside>
          </div>
        </>
      )}
    </>
  );
}

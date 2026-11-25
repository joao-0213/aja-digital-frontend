'use client';

import { useCallback, useMemo } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Empty, Skeleton } from '@/components/ui';
import { countLabel, dateLabel } from '@/lib/utils';
import { dashboardDeadlineLabel } from '@/lib/dashboard-time';
import { SubjectCard } from '@/features/subjects';
import { EnrollmentStatus } from '@/features/students';
import { useHttpQuery } from '@/hooks/use-http-query';
import { useSession } from '@/providers/app-context';
import { createDashboardApi, type StudentDashboardDto } from '../api';
import { upcomingMeetings } from '@/lib/announcement-calendar';

export function StudentDashboard() {
  const { client, user, sessionKey, resourceEpoch } = useSession();
  const api = useMemo(() => createDashboardApi(client), [client]);
  const dashboard = useHttpQuery({ sessionKey, key: `dashboard:${resourceEpoch}:student` }, useCallback(signal => api.read(signal), [api]), user?.role === 'student');
  const data = dashboard.data?.role === 'student' ? dashboard.data as StudentDashboardDto : undefined;
  const events = upcomingMeetings(data?.upcoming ?? []);

  return <>
    <header className="mb-7 flex flex-wrap items-start justify-between gap-3">
      <div><p className="mb-1 text-sm text-slate-500">Olá, {user?.name.split(' ')[0]}!</p><h1 className="text-3xl font-semibold tracking-tight">Meu painel</h1><p className="mt-2 text-sm text-slate-600">Materiais, atividades e avisos das suas turmas.</p></div>
    </header>
    <EnrollmentStatus />
    {dashboard.loading && <Skeleton />}
    {dashboard.error && <p role="alert" className="mb-6 text-sm text-red-700">{dashboard.error.message} <button type="button" className="font-bold underline underline-offset-4" onClick={() => void dashboard.retry()}>Tentar novamente</button></p>}
    {data && <>
      <section aria-label="Progresso de estudos" className="mb-7 flex flex-wrap items-center gap-x-7 gap-y-2 rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm">
        <p><strong className="text-lg tabular-nums">{data.completedMaterials}</strong><span className="ml-2 text-slate-600">{data.completedMaterials === 1 ? 'material concluído' : 'materiais concluídos'}</span></p>
        <p><strong className="text-lg tabular-nums">{data.totalMaterials}</strong><span className="ml-2 text-slate-600">{data.totalMaterials === 1 ? 'material disponível' : 'materiais disponíveis'}</span></p>
        <p><strong className="text-lg tabular-nums">{data.pendingAssessmentCount}</strong><span className="ml-2 text-slate-600">{data.pendingAssessmentCount === 1 ? 'atividade pendente' : 'atividades pendentes'}</span></p>
      </section>
      {!data.subjects.length ? <Empty title="Nenhuma disciplina disponível" description="Quando sua matrícula em uma turma estiver ativa, as disciplinas, atividades e avisos aparecerão aqui." /> : <>
        <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section aria-labelledby="student-subjects">
            <div className="mb-3 flex items-center justify-between gap-3"><h2 id="student-subjects" className="text-lg font-semibold">Minhas disciplinas</h2><Link href="/disciplinas" className="inline-flex min-h-11 items-center text-sm font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900">Ver todas<ChevronRight aria-hidden="true" className="size-4" /></Link></div>
            <div className="grid gap-4 sm:grid-cols-2">{data.subjects.map(subject => <SubjectCard key={subject.id} subject={subject} />)}</div>
          </section>
          <section aria-labelledby="student-notices" className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-3"><h2 id="student-notices" className="text-lg font-semibold">Avisos recentes</h2><Link href="/avisos" className="inline-flex min-h-11 items-center text-sm font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900">Ver todos<ChevronRight aria-hidden="true" className="size-4" /></Link></div>
            <div className="divide-y divide-brand-200 rounded-xl bg-brand-50 px-5">{data.announcements.map(notice => <article key={notice.id} className="py-5"><p className="mb-2 text-xs text-brand-700">{data.subjects.find(subject => subject.id === notice.subjectId)?.name ?? data.subjects.find(subject => subject.classId === notice.classId)?.className} · <time dateTime={notice.createdAt}>{dateLabel(notice.createdAt)}</time></p><h3 className="font-semibold leading-6 [overflow-wrap:anywhere]">{notice.title}</h3><p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">{notice.body}</p><Link href={`/avisos#aviso-${notice.id}`} className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900">Ler aviso<ChevronRight aria-hidden="true" className="size-4" /></Link></article>)}{!data.announcements.length && <p className="py-5 text-sm text-slate-600">Nenhum aviso publicado.</p>}</div>
          </section>
        </div>
        <section aria-labelledby="student-deadlines" className="mt-8 border-t border-slate-200 pt-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h2 id="student-deadlines" className="text-lg font-semibold">Próximas entregas</h2><Link href="/questionarios" className="inline-flex min-h-11 items-center text-sm font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900">Ver atividades<ChevronRight aria-hidden="true" className="size-4" /></Link></div>
          <div className="grid gap-x-6 sm:grid-cols-3">{data.assessments.map(item => <Link key={item.id} href={`/questionarios/responder?id=${item.id}`} className="min-w-0 rounded-lg py-3 hover:bg-white"><p className="text-xs font-medium text-brand-700">{item.deadline ? `Até ${dashboardDeadlineLabel(item.deadline)}` : 'Sem prazo'} · Obrigatória</p><h3 className="mt-1 text-sm font-semibold leading-6 [overflow-wrap:anywhere]">{item.title}</h3></Link>)}</div>{!data.assessments.length && <p className="py-3 text-sm text-slate-500">Nenhuma entrega obrigatória pendente. Práticas opcionais estão em Atividades.</p>}
        </section>
        {data.resume && <Link href={`/materiais?id=${data.resume.id}`} className="mt-6 flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3"><span><span className="block text-xs text-slate-500">Último material acessado</span><span className="mt-1 block text-sm font-medium">{data.resume.title}</span></span><ChevronRight aria-hidden="true" className="size-4 shrink-0 text-brand-700" /></Link>}
        <div className="mt-8 grid gap-7 border-t border-slate-200 pt-6 md:grid-cols-2">
          <section aria-labelledby="student-events"><h2 id="student-events" className="mb-2 font-semibold">Próximos encontros e prazos</h2>{events.map(item => <Link key={item.id} href={item.href} className="flex items-baseline gap-3 rounded-lg py-3 text-sm hover:bg-white"><span className="shrink-0 text-slate-500">{dateLabel(item.date)}</span><span className="min-w-0 [overflow-wrap:anywhere]">{item.title}<span className="ml-2 text-xs text-slate-500">{item.time ?? 'Dia inteiro'} · {item.source === 'announcement' ? 'Acontecimento' : 'Prazo de atividade'}</span></span></Link>)}{!events.length && <p className="py-3 text-sm text-slate-500">Nenhum encontro ou prazo futuro.</p>}</section>
          <section aria-labelledby="student-forum"><h2 id="student-forum" className="mb-2 font-semibold">Dúvidas da turma</h2>{data.topics.map(topic => <Link key={topic.id} href={topic.href} className="block rounded-lg py-3 text-sm [overflow-wrap:anywhere] hover:bg-white">{topic.title}<span className="mt-1 block text-xs text-slate-500">{countLabel(topic.replyCount, 'resposta', 'respostas')} · {topic.subjectName}</span></Link>)}{!data.topics.length && <p className="py-3 text-sm text-slate-500">Nenhuma dúvida publicada.</p>}<Link href="/forum" className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900">Abrir fórum<ChevronRight aria-hidden="true" className="size-4" /></Link></section>
        </div>
        <Link href="/questoes" className="mt-5 inline-flex min-h-11 items-center text-sm font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900">Acessar banco de questões<ChevronRight aria-hidden="true" className="size-4" /></Link>
      </>}
    </>}
  </>;
}

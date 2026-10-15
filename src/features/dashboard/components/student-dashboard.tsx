'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronRight, SlidersHorizontal } from 'lucide-react';
import { useApp } from '@/providers/app-context';
import { Button, Check, Dialog, Empty, LinkButton } from '@/components/ui';
import { useDashboardPreferences } from '../hooks/use-dashboard-preferences';
import { dateLabel } from '@/lib/utils';
import { SubjectCard } from '@/features/subjects';
import { DEMO_DATE } from '@/mocks/database';

export function StudentDashboard() {
  const { db, user } = useApp();
  const [customizing, setCustomizing] = useState(false);
  const preferences = useDashboardPreferences(user.id);
  const classes = db.classes.filter(c => c.studentIds.includes(user.id));
  const subjects = db.subjects.filter(s => classes.some(c => c.id === s.classId));
  const modules = db.modules.filter(m => subjects.some(s => s.id === m.subjectId));
  const materials = db.materials.filter(m => modules.some(mod => mod.id === m.moduleId));
  const notices = db.announcements.filter(a => classes.some(c => c.id === a.classId) && (!a.subjectId || subjects.some(s => s.id === a.subjectId))).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 2);
  const pending = db.assessments.filter(a => a.status === 'published' && modules.some(m => m.id === a.moduleId) && a.deadline >= `${DEMO_DATE}T00:00` && !db.attempts.some(t => t.userId === user.id && t.assessmentId === a.id && t.submittedAt)).sort((a, b) => a.deadline.localeCompare(b.deadline));
  const recent = db.progress.filter(p => p.userId === user.id && !p.completed && materials.some(m => m.id === p.materialId)).sort((a, b) => b.lastAccess.localeCompare(a.lastAccess))[0];
  const resume = materials.find(m => m.id === recent?.materialId);
  const events = db.events.filter(e => e.date >= DEMO_DATE && (!e.subjectId || subjects.some(s => s.id === e.subjectId))).sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)).slice(0, 3);
  const topics = db.topics.filter(t => classes.some(c => c.id === t.classId)).slice(0, 2);

  return <>
    <header className="mb-7 flex flex-wrap items-start justify-between gap-3">
      <div><p className="mb-1 text-sm text-slate-500">Olá, {user.name.split(' ')[0]}!</p><h1 className="text-3xl font-semibold tracking-tight">Meu painel</h1><p className="mt-2 text-sm text-slate-600">Materiais e avisos das suas turmas.</p></div>
      <Button variant="ghost" aria-label="Personalizar painel" onClick={() => setCustomizing(true)}><SlidersHorizontal aria-hidden="true" className="size-4" />Personalizar</Button>
    </header>
    {!classes.length ? <Empty title="Você ainda não tem uma turma" description="Na demonstração, um administrador pode realizar sua matrícula pela tela Alunos." action={<LinkButton href="/perfil">Completar meu perfil</LinkButton>} /> : <>
      <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="student-subjects">
          <div className="mb-3 flex items-center justify-between gap-3"><h2 id="student-subjects" className="text-lg font-semibold">Minhas disciplinas</h2><Link href="/disciplinas" className="inline-flex min-h-11 items-center text-sm font-medium text-brand-700">Ver todas<ChevronRight aria-hidden="true" className="size-4" /></Link></div>
          <div className="grid gap-4 sm:grid-cols-2">{subjects.slice(0, 6).map(s => <SubjectCard key={s.id} subject={s} className={db.classes.find(c => c.id === s.classId)?.name} />)}</div>
          {!subjects.length && <p className="py-5 text-sm text-slate-500">Nenhuma disciplina disponível.</p>}
        </section>
        <section aria-labelledby="student-notices">
          <div className="mb-3 flex items-center justify-between gap-3"><h2 id="student-notices" className="text-lg font-semibold">Avisos recentes</h2><Link href="/avisos" className="inline-flex min-h-11 items-center text-sm font-medium text-brand-700">Ver todos<ChevronRight aria-hidden="true" className="size-4" /></Link></div>
          <div className="divide-y divide-brand-200 rounded-xl bg-brand-50 px-5">{notices.map(a => <article key={a.id} className="py-5"><p className="mb-2 text-xs text-brand-700">{a.subjectId ? subjects.find(s => s.id === a.subjectId)?.name : db.classes.find(c => c.id === a.classId)?.name} · <time dateTime={a.createdAt}>{dateLabel(a.createdAt)}</time></p><h3 className="font-semibold leading-6">{a.title}</h3><p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{a.body}</p><Link href={a.subjectId ? `/disciplinas/detalhes?id=${a.subjectId}` : '/avisos'} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-brand-700">Ler aviso<ChevronRight aria-hidden="true" className="size-4" /></Link></article>)}{!notices.length && <p className="py-5 text-sm text-slate-600">Nenhum aviso publicado.</p>}</div>
        </section>
      </div>
      <section aria-labelledby="student-deadlines" className="mt-8 border-t border-slate-200 pt-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h2 id="student-deadlines" className="text-lg font-semibold">Próximas entregas</h2><Link href="/questionarios" className="inline-flex min-h-11 items-center text-sm font-medium text-brand-700">Ver atividades<ChevronRight aria-hidden="true" className="size-4" /></Link></div>
        <div className="grid gap-x-6 sm:grid-cols-3">{pending.slice(0, 3).map(a => <Link key={a.id} href={`/questionarios/responder?id=${a.id}`} className="rounded-lg py-3 hover:bg-white"><p className="text-xs font-medium text-brand-700">Até {dateLabel(a.deadline)} · {a.deadline.slice(11, 16)}</p><h3 className="mt-1 text-sm font-semibold leading-6">{a.title}</h3></Link>)}</div>{!pending.length && <p className="py-3 text-sm text-slate-500">Nenhuma entrega pendente.</p>}
      </section>
      {resume && <Link href={`/materiais?id=${resume.id}`} className="mt-6 flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3"><span><span className="block text-xs text-slate-500">Último material acessado</span><span className="mt-1 block text-sm font-medium">{resume.title}</span></span><ChevronRight aria-hidden="true" className="size-4 shrink-0 text-brand-700" /></Link>}
      <div className="mt-8 grid gap-7 border-t border-slate-200 pt-6 md:grid-cols-2">
        {preferences.values.events && <section aria-labelledby="student-events"><h2 id="student-events" className="mb-2 font-semibold">Próximos encontros</h2>{events.map(e => <Link key={e.id} href="/calendario" className="flex items-baseline gap-3 rounded-lg py-3 text-sm hover:bg-white"><span className="shrink-0 text-slate-500">{dateLabel(e.date)}</span><span>{e.title}<span className="ml-2 text-xs text-slate-500">{e.time}</span></span></Link>)}{!events.length && <p className="py-3 text-sm text-slate-500">Nenhum encontro agendado.</p>}</section>}
        {preferences.values.forum && <section aria-labelledby="student-forum"><h2 id="student-forum" className="mb-2 font-semibold">Dúvidas da turma</h2>{topics.map(t => <Link key={t.id} href={`/forum/topico?id=${t.id}`} className="block rounded-lg py-3 text-sm hover:bg-white">{t.title}<span className="mt-1 block text-xs text-slate-500">{t.replies.length} respostas</span></Link>)}{!topics.length && <p className="py-3 text-sm text-slate-500">Nenhuma dúvida publicada.</p>}</section>}
      </div>
      <Link href="/questoes" className="mt-5 inline-flex min-h-11 items-center text-sm font-medium text-brand-700">Acessar banco de questões<ChevronRight aria-hidden="true" className="size-4" /></Link>
    </>}
    <Dialog open={customizing} onClose={() => setCustomizing(false)} title="Personalizar painel"><p className="mb-4 text-sm leading-6 text-slate-600">Disciplinas, avisos e prazos ficam sempre visíveis. Escolha as seções adicionais.</p><Check label="Próximos encontros" checked={preferences.values.events} onChange={v => preferences.update('events', v)} /><Check label="Dúvidas da turma" checked={preferences.values.forum} onChange={v => preferences.update('forum', v)} />{preferences.storageError && <p role="status" className="mt-3 text-sm text-amber-800">A preferência vale apenas durante esta visita.</p>}<Button className="mt-5" onClick={() => setCustomizing(false)}>Concluir</Button></Dialog>
  </>;
}

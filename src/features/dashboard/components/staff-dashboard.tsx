'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, BookOpen, ChevronRight, Clock3, MessageSquare, SlidersHorizontal, ClipboardCheck, LibraryBig, ListChecks, Upload } from 'lucide-react';
import { useApp } from '@/providers/app-context';
import { Card, PageHeading, LinkButton, Empty, Button, Dialog, Check } from '@/components/ui';
import { useDashboardPreferences } from '../hooks/use-dashboard-preferences';
import { percent, dateLabel } from '@/lib/utils';
import { gradeAttempt } from '@/lib/domain';
import { DEMO_DATE } from '@/mocks/database';
import { SubjectCard } from '@/features/subjects';

export function StaffDashboard() {
  const { db, user, role } = useApp();
  const [customizing, setCustomizing] = useState(false);
  const preferences = useDashboardPreferences(user.id);
  const student = role === 'student';
  const classes = db.classes.filter(c => !student || c.studentIds.includes(user.id));
  const subjects = db.subjects.filter(s => classes.some(c => c.id === s.classId) && (role !== 'teacher' || s.teacherId === user.id));
  const modules = db.modules.filter(m => subjects.some(s => s.id === m.subjectId));
  const materials = db.materials.filter(m => modules.some(mod => mod.id === m.moduleId));
  const completed = materials.filter(m => db.progress.some(p => p.userId === user.id && p.materialId === m.id && p.completed));
  const unfinished = materials.filter(m => !completed.some(done => done.id === m.id));
  const recent = db.progress.filter(p => p.userId === user.id && !p.completed)
    .sort((a, b) => b.lastAccess.localeCompare(a.lastAccess))
    .find(p => unfinished.some(m => m.id === p.materialId));
  const resume = unfinished.find(m => m.id === recent?.materialId) ?? unfinished[0];
  const module = modules.find(m => m.id === resume?.moduleId);
  const subject = subjects.find(s => s.id === module?.subjectId);
  const attempts = db.attempts.filter(a => a.userId === user.id && a.submittedAt);
  const answered = attempts.reduce((count, a) => count + a.questionOrder.length, 0);
  const correct = attempts.reduce((count, a) => count + gradeAttempt(a.questionOrder, a.answers, db.questions).correct, 0);
  const assessments = db.assessments.filter(a => a.status === 'published' && modules.some(m => m.id === a.moduleId));
  const pending = assessments.filter(a => a.deadline >= `${DEMO_DATE}T00:00` && (!student || !attempts.some(t => t.assessmentId === a.id)))
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
  const events = db.events.filter(e => e.date >= DEMO_DATE && (!e.subjectId || subjects.some(s => s.id === e.subjectId)))
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)).slice(0, 3);
  const topics = db.topics.filter(t => classes.some(c => c.id === t.classId)).slice(0, 2);
  const announcement = db.announcements.filter(a => classes.some(c => c.id === a.classId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  if (student && !classes.length) return <>
    <PageHeading title={`Olá, ${user.name.split(' ')[0]}`} description="Boas-vindas ao AJA Digital." />
    <Empty title="Você ainda não tem uma turma" description="Na demonstração, um administrador pode realizar sua matrícula pela tela Alunos." action={<LinkButton href="/perfil">Completar meu perfil</LinkButton>} />
  </>;

  return <>
    <header className="mb-7 flex flex-wrap items-start justify-between gap-3">
      <div><p className="mb-1 text-sm text-slate-500">Olá, {user.name.split(' ')[0]}!</p><h1 className="text-3xl font-semibold tracking-tight text-slate-900">{student ? 'Sua semana no AJA' : 'Sala dos professores'}</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">{student ? 'Consulte os materiais das aulas, as atividades e os prazos de entrega.' : 'Gerencie os materiais, as atividades e a frequência das turmas.'}</p></div>
      <Button variant="ghost" aria-label="Personalizar painel" onClick={() => setCustomizing(true)}><SlidersHorizontal aria-hidden="true" className="size-4" />Personalizar</Button>
    </header>
    <nav aria-label="Acessos rápidos" className="mb-8 grid gap-3 sm:grid-cols-3">
      {(student ? [{ href: '/disciplinas', label: 'Materiais das aulas', detail: 'Organizados por disciplina', icon: BookOpen }, { href: '/questionarios', label: 'Atividades e prazos', detail: `${pending.length} para entregar`, icon: ClipboardCheck }, { href: '/questoes', label: 'Praticar questões', detail: 'Questões por disciplina e assunto', icon: LibraryBig }] : [{ href: '/disciplinas', label: 'Publicar materiais', detail: 'Escolha a disciplina e o módulo', icon: Upload }, { href: '/questionarios/criar', label: 'Preparar atividade', detail: 'Defina as questões e o prazo', icon: ClipboardCheck }, { href: '/frequencia', label: 'Registrar frequência', detail: 'Faça a chamada da aula', icon: ListChecks }]).map(item => <Link key={item.href} href={item.href} className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:border-brand-200 hover:bg-brand-50/50"><item.icon aria-hidden="true" className="size-5 shrink-0 text-brand-600" /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{item.label}</span><span className="mt-1 block text-xs text-slate-500">{item.detail}</span></span><ChevronRight aria-hidden="true" className="size-4 shrink-0 text-slate-400" /></Link>)}
    </nav>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-8">
        {student ? <section aria-labelledby="next-step" className="rounded-xl border border-brand-200 bg-brand-50 p-5 sm:p-6">
          <p id="next-step" className="mb-4 text-sm font-medium text-brand-700">{resume ? 'Continuar estudando' : 'Materiais em dia'}</p>
          {resume ? <>
            <p className="mb-2 text-sm text-slate-600">{subject?.name} · Módulo {module?.order}</p>
            <h2 className="text-xl font-semibold leading-snug text-slate-900 sm:text-2xl">{resume.title}</h2>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
              <span className="flex items-center gap-2 text-sm text-slate-600"><Clock3 aria-hidden="true" className="size-4" />{resume.duration} min de estudo</span>
              <LinkButton href={`/materiais?id=${resume.id}`}>Abrir material<ArrowRight aria-hidden="true" className="size-4" /></LinkButton>
            </div>
          </> : <>
            <h2 className="text-xl font-semibold">{materials.length ? 'Você concluiu todos os materiais' : 'Seus materiais aparecerão aqui'}</h2>
            <p className="mt-2 text-sm text-slate-600">{materials.length ? 'Continue praticando no banco de questões.' : 'Enquanto isso, pratique com as questões da demonstração.'}</p>
            <LinkButton href="/questoes" className="mt-5">Praticar questões<ArrowRight aria-hidden="true" className="size-4" /></LinkButton>
          </>}
        </section> : <Card>
          <h2 className="text-lg font-semibold">Publicação de materiais</h2>
          <p className="mb-5 mt-2 text-sm leading-6 text-slate-600">Abra uma disciplina e selecione Enviar materiais no módulo desejado. Você pode publicar vários PDFs de uma vez.</p>
          <LinkButton href="/disciplinas">Abrir minhas disciplinas<ArrowRight aria-hidden="true" className="size-4" /></LinkButton>
        </Card>}

        {student && pending[0] && <Link href={`/questionarios/responder?id=${pending[0].id}`} className="flex min-h-11 items-center justify-between gap-3 border-b border-slate-200 pb-4 text-sm xl:hidden">
          <span><span className="block text-xs text-slate-500">Próxima entrega · {dateLabel(pending[0].deadline)}</span><span className="mt-1 block font-medium">{pending[0].title}</span></span><ChevronRight aria-hidden="true" className="size-4 shrink-0 text-brand-700" />
        </Link>}

        <section aria-label={student ? 'Resumo dos seus estudos' : 'Resumo das turmas'}>
          <dl className="grid gap-4 border-y border-slate-200 py-5 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-slate-200">
            {(student ? [
              { label: 'Materiais concluídos', value: `${completed.length} de ${materials.length}`, detail: 'Nas suas disciplinas' },
              { label: 'Taxa de acerto', value: answered ? `${percent(correct, answered)}%` : '—', detail: answered ? `${correct} acertos em ${answered} questões` : 'Responda um questionário' },
              { label: 'Questionários pendentes', value: String(pending.length), detail: 'Dentro do prazo' }
            ] : [
              { label: 'Turmas ativas', value: String(classes.filter(c => c.active).length), detail: 'Na demonstração' },
              { label: 'Disciplinas', value: String(subjects.length), detail: 'Conteúdos disponíveis' },
              { label: 'Questionários publicados', value: String(assessments.length), detail: 'Atividades das turmas' }
            ]).map(stat => <div key={stat.label} className="flex items-center justify-between gap-3 sm:block sm:px-4 sm:first:pl-0 sm:last:pr-0">
              <div><dt className="text-sm text-slate-600">{stat.label}</dt><dd className="mt-1 text-xs text-slate-500 sm:hidden">{stat.detail}</dd></div>
              <dd className="shrink-0 text-xl font-semibold tabular-nums text-slate-900 sm:mt-2">{stat.value}<span className="mt-1 hidden text-xs font-normal text-slate-500 sm:block">{stat.detail}</span></dd>
            </div>)}
          </dl>
        </section>

        <section aria-labelledby="subjects-title">
          <div className="mb-3 flex items-center justify-between gap-3"><h2 id="subjects-title" className="text-lg font-semibold">{student ? 'Minhas disciplinas' : 'Disciplinas'}</h2><Link href="/disciplinas" className="inline-flex min-h-11 items-center text-sm font-medium text-brand-700 hover:underline">Ver todas</Link></div>
          {subjects.length ? <div className="grid gap-4 sm:grid-cols-2">
            {subjects.slice(0, 4).map(s => <SubjectCard key={s.id} subject={s} className={db.classes.find(c => c.id === s.classId)?.name} />)}
          </div> : <p className="text-sm text-slate-600">Nenhuma disciplina disponível.</p>}
        </section>

        {preferences.values.forum && <section aria-labelledby="forum-title">
          <div className="mb-2 flex items-center justify-between gap-3"><h2 id="forum-title" className="text-lg font-semibold">Dúvidas da turma</h2><Link href="/forum" className="inline-flex min-h-11 items-center text-sm font-medium text-brand-700 hover:underline">Abrir fórum</Link></div>
          <div className="divide-y divide-slate-200">
            {topics.map(t => <Link key={t.id} href={`/forum/topico?id=${t.id}`} className="flex items-start gap-3 rounded-lg py-4 hover:bg-slate-100">
              <MessageSquare aria-hidden="true" className="mt-1 size-4 shrink-0 text-slate-500" /><div><h3 className="text-sm font-medium leading-6">{t.title}</h3><p className="mt-1 text-xs text-slate-500">{db.subjects.find(s => s.id === t.subjectId)?.name} · {t.replies.length} respostas</p></div>
            </Link>)}
            {!topics.length && <p className="py-4 text-sm text-slate-600">Nenhuma dúvida publicada.</p>}
          </div>
        </section>}
      </div>

      <aside aria-label="Agenda e avisos" className="min-w-0 space-y-6">
        <Card>
          <h2 className="text-base font-semibold">{student ? 'Próximas entregas' : 'Prazos das atividades'}</h2>
          <div className="mt-2 divide-y divide-slate-200">
            {pending.slice(0, 3).map(a => <Link key={a.id} href={student ? `/questionarios/responder?id=${a.id}` : '/questionarios'} className="block rounded-lg py-4 hover:bg-slate-50">
              <p className="mb-2 text-xs font-medium text-brand-700">Até {dateLabel(a.deadline)} · {a.deadline.slice(11, 16).replace(':', 'h')}</p><h3 className="text-sm font-semibold leading-6">{a.title}</h3><p className="mt-1 text-xs text-slate-500">{a.questionIds.length} {a.questionIds.length === 1 ? 'questão' : 'questões'}</p>
            </Link>)}
            {!pending.length && <p className="py-4 text-sm leading-6 text-slate-600">Nenhuma entrega pendente.</p>}
          </div>
          <Link href="/questionarios" className="inline-flex min-h-11 items-center text-sm font-medium text-brand-700 hover:underline">Ver questionários<ChevronRight aria-hidden="true" className="ml-1 size-4" /></Link>
        </Card>
        {preferences.values.events && <section className="px-1" aria-labelledby="events-title">
          <h2 id="events-title" className="mb-2 text-base font-semibold">Próximos encontros</h2>
          <div className="divide-y divide-slate-200">
            {events.map(e => <Link href="/calendario" key={e.id} className="flex items-start gap-3 rounded-lg py-4 hover:bg-slate-100">
              <div className="w-11 shrink-0 text-center"><span className="block text-xl font-semibold tabular-nums">{e.date.slice(-2)}</span><span className="text-xs text-slate-500">{dateLabel(e.date, { month: 'short' })}</span></div>
              <div><h3 className="text-sm font-medium leading-6">{e.title}</h3><p className="mt-1 text-xs text-slate-500">{e.time} · {e.kind === 'exam' ? 'Simulado' : e.kind === 'class' ? 'Aula' : 'Evento'}</p></div>
            </Link>)}
            {!events.length && <p className="py-4 text-sm text-slate-600">Nenhum encontro agendado.</p>}
          </div>
        </section>}
        {preferences.values.announcements && announcement && <section className="border-t border-slate-200 px-1 pt-5" aria-labelledby="notice-title">
          <h2 id="notice-title" className="mb-3 text-base font-semibold">Último aviso</h2><h3 className="text-sm font-medium leading-6">{announcement.title}</h3><p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{announcement.body}</p><Link href="/avisos" className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-brand-700 hover:underline">Ler aviso<ChevronRight aria-hidden="true" className="ml-1 size-4" /></Link>
        </section>}
      </aside>
    </div>
    <Dialog open={customizing} onClose={() => setCustomizing(false)} title="Personalizar painel">
      <p className="mb-4 text-sm leading-6 text-slate-600">Escolha os blocos que deseja ver. Materiais e prazos ficam sempre visíveis. As preferências são salvas neste navegador.</p>
      <Check label="Dúvidas da turma" checked={preferences.values.forum} onChange={value => preferences.update('forum', value)} />
      <Check label="Próximos encontros" checked={preferences.values.events} onChange={value => preferences.update('events', value)} />
      <Check label="Último aviso" checked={preferences.values.announcements} onChange={value => preferences.update('announcements', value)} />
      {preferences.storageError && <p role="status" className="mt-3 text-sm text-amber-800">Não foi possível salvar a preferência. Ela vale apenas durante esta visita.</p>}
      <Button className="mt-5" onClick={() => setCustomizing(false)}>Concluir</Button>
    </Dialog>
  </>;
}

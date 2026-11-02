'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useApp } from '@/providers/app-context';
import { Badge, Button, Card, Empty, LinkButton, PageHeading } from '@/components/ui';
import { dateLabel, uid } from '@/lib/utils';
import { DEMO_DATE } from '@/mocks/database';
import { beginAttempt } from '@/lib/assessment-attempts';
import { QuizSession } from './quiz-session';

export function AnswerAssessment() {
  const {
    db,
    user,
    role,
    mutate,
    busy
  } = useApp();
  const id = useSearchParams().get('id') ?? 'a1';
  const a = db.assessments.find(item => item.id === id);
  const attempts = db.attempts.filter(t => t.assessmentId === id && t.userId === user.id);
  const active = attempts.find(t => !t.submittedAt);
  if (!a || a.status !== 'published') return <Empty title="Questionário indisponível" action={<LinkButton href="/questionarios">Ver questionários</LinkButton>} />;
  if (role !== 'student') {
    const submissions = db.attempts.filter(t => t.assessmentId === id && t.submittedAt);
    return <>
      <PageHeading eyebrow="Consulta individual" title={a.title} description="Consulte cada envio da disciplina. Respostas e resultados são privados para a equipe autorizada." action={<LinkButton secondary href={`/questionarios/criar?id=${a.id}`}>Editar atividade</LinkButton>} />
      <Card><h2 className="mb-4 font-semibold">Envios dos alunos</h2><div className="divide-y divide-slate-100">{submissions.map(t => <Link key={t.id} href={`/questionarios/resultado?id=${t.id}`} className="flex min-h-14 flex-wrap items-center justify-between gap-3 py-3 text-sm"><span>{db.users.find(u => u.id === t.userId)?.name ?? 'Aluno'} · {new Date(t.submittedAt!).toLocaleString('pt-BR')}</span><span className="font-semibold text-brand-700">Consultar envio</span></Link>)}</div>{!submissions.length && <p className="text-sm text-slate-500">Ainda não há envios. Os rascunhos de resposta pertencem a cada aluno.</p>}</Card>
      <div className="mt-5"><LinkButton secondary href="/questionarios">Ver questionários</LinkButton></div>
    </>;
  }
  const completed = attempts.filter(t => t.submittedAt);
  const expired = a.deadline < `${DEMO_DATE}T00:00`;
  const exhausted = completed.length > 0;
  if (active && !exhausted) return <QuizSession key={`${active.id}:${active.questionsUpdatedAt ?? ''}`} attempt={active} />;
  return <div className="mx-auto max-w-2xl">
    <PageHeading eyebrow="Questionário" title={a.title} description={a.description} />
    <Card>
      <div className="mb-6 flex flex-wrap gap-2">
        <Badge tone="purple">{a.questionIds.length} questões</Badge>
        <Badge>Envio único</Badge>
        <Badge tone="amber">Até {dateLabel(a.deadline)}</Badge>
      </div>
      <h2 className="font-semibold">Antes de começar</h2>
      <ul className="my-5 list-disc space-y-3 pl-5 text-sm leading-6 text-slate-500">
        <li>Cada questão tem uma alternativa correta e vale 1 ponto.</li>
        <li>Você pode navegar entre as questões e revisar antes de enviar.</li>
        <li>Suas respostas são salvas automaticamente neste navegador.</li>
        <li>Data de referência desta demonstração: 05/10/2026.</li>
      </ul>
      {completed.length > 0 && <div className="mb-6 border-t border-slate-100 pt-5">
        <h3 className="mb-3 text-sm font-semibold">Envios registrados</h3>
        {completed.map((t, i) => <Link key={t.id} href={`/questionarios/resultado?id=${t.id}`} className="mb-2 flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm">
          <span>Envio {i + 1}</span>
          <span className="font-semibold text-brand-600">Ver resultado</span>
        </Link>)}
      </div>}
      <Button className="w-full" disabled={exhausted || expired} loading={busy} onClick={() => void mutate(d => {
        beginAttempt(d, id, user.id, uid('attempt'), new Date().toISOString());
      })}>
        {exhausted ? 'Questionário já enviado' : expired ? 'Prazo encerrado' : 'Iniciar questionário'}
      </Button>
      <p className="mt-3 text-center text-xs text-slate-400">Um único envio. Você pode retomar suas respostas antes de enviar.</p>
    </Card>
  </div>;
}

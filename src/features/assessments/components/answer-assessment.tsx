'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { assessmentQuestions } from '@/lib/question-composition';
import { useApp } from '@/providers/app-context';
import { Badge, Button, Card, Empty, LinkButton, PageHeading } from '@/components/ui';
import { dateLabel, uid } from '@/lib/utils';
import { activityClosed } from '@/lib/activities';
import { useActivityClock } from '@/hooks/use-activity-clock';
import { WorkActivity } from './work-activity';
import { ActivityConditions } from './activity-conditions';
import { beginAttempt } from '@/lib/assessment-attempts';
import { QuizSession } from './quiz-session';
import { isAssessmentAssigned } from '@/lib/enrollment';

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
  const now = useActivityClock();
  if (!a || a.status !== 'published') return <Empty title="Atividade indisponível: retirada ou sem acesso" action={<LinkButton href="/questionarios">Ver atividades</LinkButton>} />;
  if (a.kind === 'work') return <WorkActivity activity={a} />;
  if (role !== 'student') {
    const submissions = db.attempts.filter(t => t.assessmentId === id && t.submittedAt);
    return <>
      <PageHeading eyebrow="Consulta individual" title={a.title} description="Consulte cada envio da disciplina. Respostas e resultados são privados para a equipe autorizada." action={<LinkButton secondary href={`/questionarios/criar?id=${a.id}`}>Editar atividade</LinkButton>} />
      <Card><h2 className="mb-4 font-semibold">Envios dos alunos</h2><div className="divide-y divide-slate-100">{submissions.map(t => <Link key={t.id} href={`/questionarios/resultado?id=${t.id}`} className="flex min-h-14 flex-wrap items-center justify-between gap-3 py-3 text-sm"><span>{db.users.find(u => u.id === t.userId)?.name ?? 'Aluno'} · {new Date(t.submittedAt!).toLocaleString('pt-BR')}</span><span className="font-semibold text-brand-700">Consultar envio</span></Link>)}</div>{!submissions.length && <p className="text-sm text-slate-500">Ainda não há envios. Os rascunhos de resposta pertencem a cada aluno.</p>}</Card>
      <Card className="mt-5"><h2 className="mb-3 font-semibold">Situação por aluno</h2><ul className="divide-y divide-slate-100">{db.users.filter(u => u.role === 'student' && db.classes.some(c => c.studentIds.includes(u.id) && db.subjects.some(s => s.classId === c.id && db.modules.some(m => m.id === a.moduleId && m.subjectId === s.id)))).map(u => <li key={u.id} className="py-3 text-sm leading-6">{u.name} · {submissions.some(t => t.userId === u.id) ? 'Entregue' : !isAssessmentAssigned(db, a, u.id) ? 'Não atribuída — matrícula posterior ao prazo' : a.required === false ? 'Prática opcional — sem envio' : 'Não entregue'}</li>)}</ul></Card>
      <div className="mt-5"><LinkButton secondary href="/questionarios">Ver atividades</LinkButton></div>
    </>;
  }
  const completed = attempts.filter(t => t.submittedAt);
  if (!isAssessmentAssigned(db, a, user.id)) return <div className="mx-auto max-w-3xl">
    <PageHeading eyebrow="Consulta de atividade" title={a.title} description={a.description} />
    <Card><p role="status" className="text-sm leading-6 text-slate-700">Disponível apenas para consulta: o prazo terminou antes da sua matrícula. Esta atividade não foi atribuída a você e não gera pendência ou entrega atrasada.</p><p className="mt-3 text-sm text-slate-500">{a.required === false ? 'Opcional' : 'Obrigatória'} · {a.deadline ? `Prazo original: ${dateLabel(a.deadline)}` : 'Sem prazo'}</p></Card>
    {a.questionIds.map((questionId, index) => {
      const question = assessmentQuestions(db, a).find(q => q.id === questionId);
      return question && <Card key={questionId} className="mt-4"><h2 className="font-semibold">Questão {index + 1}</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-7">{question.statement}</p><ol className="mt-4 list-inside list-[upper-alpha] space-y-3 text-sm">{question.options.map((option, i) => <li key={i}>{option}</li>)}</ol></Card>;
    })}
    <div className="mt-5"><LinkButton secondary href="/questionarios">Voltar às atividades</LinkButton></div>
  </div>;
  const expired = activityClosed(a, now);
  const exhausted = completed.length > 0;
  if (active && !exhausted) return <QuizSession key={`${active.id}:${active.questionsUpdatedAt ?? ''}`} attempt={active} />;
  return <div className="mx-auto max-w-2xl">
    <PageHeading eyebrow="Questionário" title={a.title} description={a.description} />
    <ActivityConditions activity={a} />
    <Card>
      <div className="mb-6 flex flex-wrap gap-2">
        <Badge tone="purple">{a.questionIds.length} questões</Badge>
        <Badge>Envio único</Badge>
        <Badge tone="amber">{a.deadline ? `Até ${dateLabel(a.deadline)}` : 'Sem prazo'}</Badge>
        <Badge>{a.required === false ? 'Opcional' : 'Obrigatória'}</Badge>
      </div>
      <h2 className="font-semibold">Antes de começar</h2>
      <ul className="my-5 list-disc space-y-3 pl-5 text-sm leading-6 text-slate-500">
        <li>Cada questão tem uma alternativa correta e vale 1 ponto.</li>
        <li>Você pode navegar entre as questões e revisar antes de enviar.</li>
        <li>Suas respostas são salvas automaticamente neste navegador.</li>
        <li>O prazo considera o horário de Brasília (UTC−3), inclusive durante a realização.</li>
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

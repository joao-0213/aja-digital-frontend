'use client';

import { useSearchParams } from 'next/navigation';
import { Trophy } from 'lucide-react';
import { useApp } from '@/providers/app-context';
import { Badge, Card, Empty, LinkButton, PageHeading } from '@/components/ui';
import { percent } from '@/lib/utils';
import { gradeAttempt } from '@/lib/domain';

export function AssessmentResult() {
  const {
    db,
    user
  } = useApp();
  const id = useSearchParams().get('id');
  const attempt = db.attempts.find(t => t.id === id && t.userId === user.id && t.submittedAt);
  if (!attempt) return <Empty title="Resultado não encontrado" description="Conclua um questionário para ver seu desempenho." action={<LinkButton href="/questionarios">Ver questionários</LinkButton>} />;
  const a = db.assessments.find(a => a.id === attempt.assessmentId)!;
  const {
    correct
  } = gradeAttempt(attempt.questionOrder, attempt.answers, db.questions);
  return <div className="mx-auto max-w-3xl">
    <PageHeading eyebrow="Questionário" title="Resultado" description={a.title} />
    <Card className="mb-6 text-center">
      <Trophy className="mx-auto mb-4 size-10 text-brand-500" />
      <p className="text-5xl font-bold text-brand-700">
        {percent(correct, attempt.questionOrder.length)}
        <span className="text-2xl">%</span>
      </p>
      <p className="mt-3 text-slate-500">{correct} de {attempt.questionOrder.length} questões corretas</p>
      <p className="mt-2 text-sm text-slate-400">Confira suas respostas e o gabarito abaixo.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <LinkButton href={`/questionarios/responder?id=${a.id}`}>Ver tentativas</LinkButton>
        <LinkButton secondary href="/disciplinas">Voltar aos estudos</LinkButton>
      </div>
    </Card>
    <h2 className="mb-4 text-lg font-semibold">Vamos revisar?</h2>
    <div className="space-y-4">
      {attempt.questionOrder.map((id, index) => {
        const q = db.questions.find(q => q.id === id)!;
        const right = attempt.answers[id] === q.correct;
        return <Card key={id}>
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-semibold">Questão {index + 1}</span>
          <Badge tone={right ? 'green' : 'amber'}>
            {right ? 'Correta' : attempt.answers[id] === undefined ? 'Em branco' : 'Revisar'}
          </Badge>
        </div>
        <p className="leading-7">
          {q.statement}
        </p>
        <p className="mt-4 text-sm text-slate-500">Sua resposta: {attempt.answers[id] === undefined ? 'Não respondida' : q.options[attempt.answers[id]]}</p>
        <p className="mt-2 text-sm font-semibold text-emerald-700">Resposta correta: {q.options[q.correct]}</p>
        <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
          {q.explanation}
        </p>
      </Card>;
      })}
    </div>
  </div>;
}

'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '@/providers/app-context';
import { Badge, Button, Card, Empty, LinkButton, PageHeading } from '@/components/ui';
import { dateLabel, uid } from '@/lib/utils';
import { DEMO_DATE } from '@/mocks/database';
import { QuizSession } from './quiz-session';

export function AnswerAssessment() {
  const {
    db,
    user,
    mutate,
    busy
  } = useApp();
  const id = useSearchParams().get('id') ?? 'a1';
  const a = db.assessments.find(item => item.id === id);
  const attempts = db.attempts.filter(t => t.assessmentId === id && t.userId === user.id);
  const active = attempts.find(t => !t.submittedAt);
  const router = useRouter();
  if (!a || a.status !== 'published') return <Empty title="Questionário indisponível" action={<LinkButton href="/questionarios">Ver questionários</LinkButton>} />;
  if (active) return <QuizSession key={active.id} attempt={active} />;
  const completed = attempts.filter(t => t.submittedAt);
  const expired = a.deadline < `${DEMO_DATE}T00:00`;
  const exhausted = completed.length >= a.attempts;
  return <div className="mx-auto max-w-2xl">
    <PageHeading eyebrow="Questionário" title={a.title} description={a.description} />
    <Card>
      <div className="mb-6 flex flex-wrap gap-2">
        <Badge tone="purple">{a.questionIds.length} questões</Badge>
        <Badge>{a.attempts} tentativas</Badge>
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
        <h3 className="mb-3 text-sm font-semibold">Tentativas anteriores</h3>
        {completed.map((t, i) => <Link key={t.id} href={`/questionarios/resultado?id=${t.id}`} className="mb-2 flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm">
          <span>Tentativa {i + 1}</span>
          <span className="font-semibold text-brand-600">Ver resultado</span>
        </Link>)}
      </div>}
      <Button className="w-full" disabled={exhausted || expired} loading={busy} onClick={() => void mutate(d => {
        if (d.attempts.some(t => t.assessmentId === id && t.userId === user.id && !t.submittedAt)) return;
        const order = [...a.questionIds];
        if (a.shuffle) for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [order[i], order[j]] = [order[j], order[i]];
        }
        d.attempts.push({
          id: uid('attempt'),
          assessmentId: id,
          userId: user.id,
          startedAt: new Date().toISOString(),
          answers: {},
          questionOrder: order
        });
      })}>
        {exhausted ? 'Limite de tentativas atingido' : expired ? 'Prazo encerrado' : completed.length ? 'Iniciar nova tentativa' : 'Iniciar questionário'}
      </Button>
      <p className="mt-3 text-center text-xs text-slate-400">{completed.length} de {a.attempts} tentativas utilizadas</p>
    </Card>
  </div>;
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { useApp } from '@/providers/app-context';
import { Badge, Button, Card, Dialog, PageHeading, ProgressBar } from '@/components/ui';
import { cn, percent } from '@/lib/utils';
import { type Attempt } from '@/models';

export function QuizSession({
  attempt
}: {
  attempt: Attempt;
}) {
  const {
    db,
    mutate,
    busy
  } = useApp();
  const router = useRouter();
  const recoveryKey = `aja-attempt-${attempt.id}`;
  const [answers, setAnswers] = useState<Record<string, number>>(() => {
    if (typeof window !== 'undefined') try {
      const raw = sessionStorage.getItem(recoveryKey);
      if (raw) {
        const value: unknown = JSON.parse(raw);
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const entries = Object.entries(value).filter(([id, index]) => attempt.questionOrder.includes(id) && typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < (db.questions.find(q => q.id === id)?.options.length ?? 0));
          return Object.fromEntries(entries) as Record<string, number>;
        }
      }
    } catch {}
    return attempt.answers;
  });
  const [index, setIndex] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [retry, setRetry] = useState(0);
  const a = db.assessments.find(a => a.id === attempt.assessmentId)!;
  const question = db.questions.find(q => q.id === attempt.questionOrder[index])!;
  useEffect(() => {
    try {
      sessionStorage.setItem(recoveryKey, JSON.stringify(answers));
    } catch {}
    setSaveStatus('saving');
    let cancelled = false;
    const timer = setTimeout(() => {
      void mutate(d => {
        const item = d.attempts.find(t => t.id === attempt.id);
        if (item && !item.submittedAt) item.answers = {
          ...answers
        };
      }).then(ok => {
        if (!cancelled) setSaveStatus(ok ? 'saved' : 'error');
      });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [answers, attempt.id, mutate, retry, recoveryKey]);
  const submit = async () => {
    const ok = await mutate(d => {
      const item = d.attempts.find(t => t.id === attempt.id);
      if (item) {
        item.answers = {
          ...answers
        };
        item.submittedAt = new Date().toISOString();
      }
    }, 'Questionário enviado.');
    if (ok) {
      try {
        sessionStorage.removeItem(recoveryKey);
      } catch {}
      router.push(`/questionarios/resultado?id=${attempt.id}`);
    }
  };
  return <div className="mx-auto max-w-4xl">
    <PageHeading eyebrow="Questionário" title={a.title} action={<Badge tone={saveStatus === 'error' ? 'red' : 'neutral'}>
        {saveStatus === 'saving' ? 'Salvando…' : saveStatus === 'error' ? 'Falha ao salvar' : 'Salvo neste navegador'}
      </Badge>} />
    {saveStatus === 'error' && <Button variant="secondary" className="mb-4" onClick={() => setRetry(n => n + 1)}>Tentar salvar novamente</Button>}
    <div className="mb-3 flex justify-between text-sm text-slate-500">
      <span>Questão {index + 1} de {attempt.questionOrder.length}</span>
      <span>{Object.keys(answers).length} respondidas</span>
    </div>
    <ProgressBar label="Questões respondidas" value={percent(Object.keys(answers).length, attempt.questionOrder.length)} />
    <div className="my-6 flex flex-wrap gap-2" aria-label="Navegação entre questões">
      {attempt.questionOrder.map((id, i) => <Button key={id} variant={index === i ? 'primary' : 'secondary'} aria-label={`Questão ${i + 1}${answers[id] !== undefined ? ', respondida' : ''}`} onClick={() => setIndex(i)} className={cn('!min-h-10 !px-3', index !== i && answers[id] !== undefined && '!border-emerald-300 !bg-emerald-50 !text-emerald-700')}>
        {i + 1}
        {answers[id] !== undefined && <CheckCircle2 className="size-3" />}
      </Button>)}
    </div>
    <Card>
      <Badge tone="purple">
        {question.topic}
      </Badge>
      <h2 className="mb-7 mt-5 text-lg font-semibold leading-8">
        {question.statement}
      </h2>
      <fieldset className="space-y-3">
        <legend className="sr-only">Escolha uma alternativa</legend>
        {question.options.map((option, i) => <label key={i} className={cn('flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition hover:border-brand-200', answers[question.id] === i ? 'border-brand-500 bg-brand-50' : 'border-slate-200')}>
          <input type="radio" name={question.id} checked={answers[question.id] === i} onChange={() => setAnswers(old => ({
            ...old,
            [question.id]: i
          }))} className="mt-1 size-4 accent-brand-600" />
          <span className="text-base leading-6">
            <strong className="mr-3 text-slate-500">{String.fromCharCode(65 + i)}.</strong>
            {option}
          </span>
        </label>)}
      </fieldset>
      <Button variant="ghost" className="mt-3" disabled={answers[question.id] === undefined} onClick={() => setAnswers(old => {
        const next = {
          ...old
        };
        delete next[question.id];
        return next;
      })}>Limpar resposta</Button>
    </Card>
    <div className="mt-6 flex flex-wrap justify-between gap-3">
      <Button variant="secondary" disabled={index === 0} onClick={() => setIndex(i => i - 1)}>Questão anterior</Button>
      {index < attempt.questionOrder.length - 1 ? <Button onClick={() => setIndex(i => i + 1)}>Próxima questão</Button> : <Button onClick={() => setConfirm(true)}>Revisar e enviar</Button>}
    </div>
    <Dialog open={confirm} onClose={() => setConfirm(false)} title="Enviar suas respostas?">
      <p className="mb-5 leading-7 text-slate-500">Você respondeu {Object.keys(answers).length} de {attempt.questionOrder.length} questões. Após o envio, esta tentativa não poderá ser alterada.</p>
      {Object.keys(answers).length < attempt.questionOrder.length && <p className="mb-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Há {attempt.questionOrder.length - Object.keys(answers).length} questões em branco. Elas não receberão pontos.</p>}
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => setConfirm(false)}>Revisar</Button>
        <Button loading={busy} onClick={() => void submit()}>Confirmar envio</Button>
      </div>
    </Dialog>
  </div>;
}

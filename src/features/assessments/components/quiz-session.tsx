'use client';

import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Badge, Button, Card, Empty, LinkButton, PageHeading, ProgressBar } from '@/components/ui';
import { brazilDateTimeLabel, cn, countLabel, percent } from '@/lib/utils';
import type { AttemptStudent } from '../api';
import { useQuizSession } from '../hooks/use-quiz-session';
import { AttemptImage } from './attempt-image';
import { QuizConflictPanel, QuizSessionDialogs } from './quiz-session-dialogs';

export function QuizSession({
  attempt: initialAttempt,
  title,
  deadline,
  allowLate
}: {
  attempt: AttemptStudent;
  title: string;
  deadline: string | null;
  allowLate: boolean;
}) {
  const q = useQuizSession({ initialAttempt });
  const question = q.question;

  if (!question)
    return (
      <Empty
        title="Questão indisponível"
        description="A tentativa mantém suas respostas salvas. Consulte a equipe responsável antes de continuar."
        action={<LinkButton href="/questionarios">Voltar às atividades</LinkButton>}
      />
    );

  const remaining = q.attempt.questionOrder.length - q.answeredCount;

  return (
    <div className="mx-auto max-w-4xl">
      <LinkButton secondary href="/questionarios" className="mb-5">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar para atividades
      </LinkButton>
      {q.recoveryNotice && (
        <p role="status" className="mb-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
          {q.recoveryNotice}
        </p>
      )}
      <p className="mb-4 text-sm text-slate-600">
        Prazo: {deadline ? `${brazilDateTimeLabel(deadline)} (Brasília)` : 'sem prazo'}
        {deadline && ` · ${allowLate ? 'aceita atraso' : 'não aceita atraso'}`}
      </p>
      <PageHeading
        eyebrow="Questionário"
        title={title}
        action={
          <Badge tone={q.saveStatus === 'error' || q.saveStatus === 'conflict' ? 'red' : 'neutral'}>
            {q.saveStatus === 'saving'
              ? 'Salvando…'
              : q.saveStatus === 'error'
                ? 'Falha ao salvar'
                : q.saveStatus === 'conflict'
                  ? 'Conflito para revisar'
                  : q.dirty
                    ? 'Respostas locais pendentes'
                    : 'Respostas salvas'}
          </Badge>
        }
      />
      {q.saveError && (
        <div role="alert" className="mb-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
          {q.saveError}
        </div>
      )}
      {q.saveStatus === 'error' && (
        <Button variant="secondary" className="mb-4" onClick={() => void q.retrySave()}>
          Tentar salvar novamente
        </Button>
      )}
      {q.conflict && (
        <QuizConflictPanel
          conflict={q.conflict}
          snapshotChanged={q.snapshotChanged}
          onDiscardLocal={q.discardLocalAfterReview}
          onApplyLocal={() => void q.applyLocalAfterReview()}
        />
      )}
      <div className="mb-3 flex justify-between text-sm text-slate-500">
        <span>
          Questão {q.index + 1} de {q.attempt.questionOrder.length}
        </span>
        <span>{countLabel(q.answeredCount, 'respondida', 'respondidas')}</span>
      </div>
      <ProgressBar
        label="Questões respondidas"
        value={percent(q.answeredCount, q.attempt.questionOrder.length)}
      />
      <div className="my-6 flex flex-wrap gap-2" aria-label="Navegação entre questões">
        {q.attempt.questionOrder.map((id, position) => (
          <Button
            key={id}
            disabled={q.lockInputs || !!q.conflict}
            variant={q.index === position ? 'primary' : 'secondary'}
            aria-label={`Questão ${position + 1}${q.answers[id] !== undefined && q.answers[id] !== null ? ', respondida' : ', em branco'}`}
            onClick={() => q.setIndex(position)}
            className={cn(
              '!min-h-10 !px-3',
              q.index !== position &&
                q.answers[id] !== undefined &&
                q.answers[id] !== null &&
                '!border-emerald-300 !bg-emerald-50 !text-emerald-700'
            )}
          >
            {position + 1}
            {q.answers[id] !== undefined && q.answers[id] !== null && (
              <CheckCircle2 aria-hidden="true" className="size-3" />
            )}
          </Button>
        ))}
      </div>
      <Card>
        <Badge tone="purple">{question.topic}</Badge>
        <h2 className="mb-7 mt-5 whitespace-pre-wrap text-lg font-semibold leading-8 [overflow-wrap:anywhere]">
          {question.statement}
        </h2>
        {question.image && <AttemptImage image={question.image} />}
        <fieldset className="space-y-3" disabled={q.lockInputs || !!q.conflict}>
          <legend className="sr-only">Escolha uma alternativa</legend>
          {question.options.map((option, choice) => (
            <label
              key={choice}
              className={cn(
                'flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition hover:border-brand-200',
                q.answers[question.id] === choice
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-slate-200'
              )}
            >
              <input
                type="radio"
                name={question.id}
                checked={q.answers[question.id] === choice}
                onChange={() => q.editAnswer(question.id, choice)}
                className="mt-1 size-4 shrink-0 accent-brand-600"
              />
              <span className="min-w-0 text-base leading-6 [overflow-wrap:anywhere]">
                <strong className="mr-3 text-slate-500">{String.fromCharCode(65 + choice)}.</strong>
                {option}
              </span>
            </label>
          ))}
        </fieldset>
        <Button
          variant="ghost"
          className="mt-3"
          disabled={
            q.lockInputs ||
            !!q.conflict ||
            q.answers[question.id] === undefined ||
            q.answers[question.id] === null
          }
          onClick={() => q.editAnswer(question.id, null)}
        >
          Deixar em branco
        </Button>
      </Card>
      <div className="mt-6 flex flex-wrap justify-between gap-3">
        <Button
          variant="secondary"
          disabled={q.index === 0 || q.lockInputs || !!q.conflict}
          onClick={() => q.setIndex((value) => value - 1)}
        >
          Questão anterior
        </Button>
        {q.index < q.attempt.questionOrder.length - 1 ? (
          <Button
            disabled={q.lockInputs || !!q.conflict}
            onClick={() => q.setIndex((value) => value + 1)}
          >
            Próxima questão
          </Button>
        ) : (
          <Button disabled={!!q.conflict || q.lockInputs} onClick={() => q.setConfirm(true)}>
            Revisar e enviar
          </Button>
        )}
      </div>
      {q.submitError && (
        <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
          {q.submitError}
        </p>
      )}
      {q.submissionNeedsReview && (
        <Button
          variant="secondary"
          className="mt-4"
          loading={q.submitBusy}
          disabled={q.submitBusy}
          onClick={() => void q.retrySubmissionReview()}
        >
          Consultar estado atual da tentativa
        </Button>
      )}
      {q.hasFrozenIntent && !q.finalizedReceipt && !q.submissionNeedsReview && (
        <Button className="mt-4" loading={q.submitBusy} onClick={() => void q.submit()}>
          Tentar confirmar este mesmo envio novamente
        </Button>
      )}
      <QuizSessionDialogs
        confirm={q.confirm}
        submitBusy={q.submitBusy}
        answeredCount={q.answeredCount}
        totalQuestions={q.attempt.questionOrder.length}
        remaining={remaining}
        lockInputs={q.lockInputs}
        hasConflict={!!q.conflict}
        hasFrozenIntent={q.hasFrozenIntent}
        reloadPrompt={q.reloadPrompt}
        onCloseConfirm={() => {
          if (!q.submitBusy) q.setConfirm(false);
        }}
        onSubmit={() => void q.submit()}
        onCloseReload={() => q.setReloadPrompt(null)}
        onReload={() => window.location.reload()}
      />
    </div>
  );
}

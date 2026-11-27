'use client';

import { useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Trophy } from 'lucide-react';
import { Badge, Card, Empty, ErrorState, LinkButton, PageHeading, Skeleton } from '@/components/ui';
import { useHttpQuery } from '@/hooks/use-http-query';
import { HttpError } from '@/lib/http-client';
import { brazilDateTimeLabel, countLabel, formatScore } from '@/lib/utils';
import { useSession } from '@/providers/app-context';
import { createAssessmentsApi, type AttemptRead, type AttemptResult } from '../api';
import { summarizeQuizResult } from '../lib/result-summary';
import { AttemptImage } from './attempt-image';

function AttemptChoices({ attempts }: { attempts: AttemptRead[] }) {
  const delivered = attempts.filter((attempt) => attempt.submittedAt);
  if (!delivered.length)
    return (
      <Empty
        title="Resultado não encontrado"
        description="Nenhum envio autorizado foi localizado para esta atividade."
        action={<LinkButton href="/questionarios">Ver atividades</LinkButton>}
      />
    );
  return (
    <div className="mx-auto max-w-3xl">
      <LinkButton secondary href="/questionarios" className="mb-5">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar para atividades
      </LinkButton>
      <PageHeading
        eyebrow="Questionário"
        title="Envios disponíveis"
        description="Escolha um envio entregue e autorizado para consultar o resultado."
      />
      <Card>
        <ul className="divide-y divide-slate-100">
          {delivered.map((attempt) => (
            <li key={attempt.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium text-slate-800">{attempt.assessmentTitle}</p>
                <p className="text-sm text-slate-700">{attempt.studentName}</p>
                <p className="text-xs text-slate-500">
                  {attempt.submittedAt && brazilDateTimeLabel(attempt.submittedAt)}
                </p>
              </div>
              <Link
                className="inline-flex min-h-11 items-center font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900"
                href={`/questionarios/resultado?id=${encodeURIComponent(attempt.id)}`}
              >
                Consultar resultado
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function ResultContent({ result, isStudent }: { result: AttemptResult; isStudent: boolean }) {
  const questions = new Map(result.questions.map((question) => [question.id, question]));
  const attempt = result.attempt;
  const summary = summarizeQuizResult(result);
  return (
    <div className="mx-auto max-w-3xl">
      <LinkButton secondary href="/questionarios" className="mb-5">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar para atividades
      </LinkButton>
      <PageHeading
        eyebrow="Questionário"
        title={attempt.assessmentTitle}
        description={`Envio de ${attempt.studentName} em ${brazilDateTimeLabel(result.receipt.submittedAt)}`}
      />
      <Card className="mb-6 text-center">
        <Trophy aria-hidden="true" className="mx-auto mb-4 size-10 text-brand-500" />
        <p className="text-5xl font-bold text-brand-700">
          {summary.percentage}
          <span className="text-2xl">%</span>
        </p>
        <p className="mt-3 text-slate-600">
          {summary.hasQuestionBreakdown
            ? `${summary.correctQuestions} de ${countLabel(summary.totalQuestions, 'questão correta', 'questões corretas')}`
            : `Nota ${formatScore(result.score)} de ${formatScore(result.maxScore)}`}
        </p>
        {summary.showGradeDetail && (
          <p className="mt-1 text-sm text-slate-500">
            Nota {formatScore(result.score)} de {formatScore(result.maxScore)}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <LinkButton
            href={`/questionarios/responder?id=${encodeURIComponent(attempt.assessmentId)}`}
          >
            Ver atividade
          </LinkButton>
          <LinkButton secondary href="/disciplinas">
            {isStudent ? 'Voltar aos estudos' : 'Ver disciplinas'}
          </LinkButton>
        </div>
      </Card>
      <h2 className="mb-4 text-lg font-semibold">Revisão das respostas</h2>
      <div className="space-y-4">
        {attempt.questionOrder.map((id, index) => {
          const question = questions.get(id);
          if (!question)
            return (
              <Card key={id}>
                <p>Questão {index + 1}: o conteúdo histórico não está disponível.</p>
              </Card>
            );
          const answer = attempt.answers[id];
          const correct = answer !== null && answer !== undefined && answer === question.correct;
          return (
            <Card key={id}>
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-semibold">Questão {index + 1}</span>
                <Badge tone={correct ? 'green' : 'amber'}>
                  {correct
                    ? 'Correta'
                    : answer === null || answer === undefined
                      ? 'Em branco'
                      : 'Revisar'}
                </Badge>
              </div>
              <p className="whitespace-pre-wrap leading-7 [overflow-wrap:anywhere]">
                {question.statement}
              </p>
              {question.image && <AttemptImage image={question.image} />}
              <p className="mt-4 text-sm text-slate-500 [overflow-wrap:anywhere]">
                {isStudent ? 'Sua resposta' : 'Resposta do aluno'}:{' '}
                {answer === null || answer === undefined
                  ? 'Em branco'
                  : (question.options[answer] ?? 'Alternativa indisponível')}
              </p>
              <p className="mt-2 text-sm font-semibold text-emerald-700 [overflow-wrap:anywhere]">
                Resposta correta: {question.options[question.correct]}
              </p>
              <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">
                {question.explanation}
              </p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function AssessmentResult() {
  const { client, sessionKey, status, user } = useSession();
  const id = useSearchParams().get('id') ?? '';
  const api = useMemo(() => createAssessmentsApi(client), [client]);
  const direct = useHttpQuery(
    { sessionKey, key: ['assessments', 'attempt-result', id] },
    useCallback((signal) => api.readAttemptResult(id, signal, sessionKey), [api, id, sessionKey]),
    status === 'authenticated' && !!id
  );
  const notFound = direct.error instanceof HttpError && direct.error.kind === 'not-found';
  const choices = useHttpQuery(
    { sessionKey, key: ['assessments', 'attempt-result-list', id] },
    useCallback(
      (signal) => api.allAttempts({ assessmentId: id }, signal, sessionKey),
      [api, id, sessionKey]
    ),
    status === 'authenticated' && !!id && notFound
  );

  if (status === 'loading' || direct.loading) return <Skeleton />;
  if (!id)
    return (
      <Empty
        title="Resultado não encontrado"
        description="Abra um resultado pela lista de atividades."
        action={<LinkButton href="/questionarios">Ver atividades</LinkButton>}
      />
    );
  if (direct.data)
    return <ResultContent result={direct.data} isStudent={user?.role === 'student'} />;
  if (notFound) {
    if (choices.loading) return <Skeleton />;
    if (choices.error)
      return <ErrorState message={choices.error.message} retry={() => void choices.retry()} />;
    return <AttemptChoices attempts={choices.data ?? []} />;
  }
  if (direct.error)
    return <ErrorState message={direct.error.message} retry={() => void direct.retry()} />;
  return (
    <Empty
      title="Resultado não encontrado"
      description="Entre com uma conta autorizada e abra um envio entregue."
      action={<LinkButton href="/questionarios">Ver atividades</LinkButton>}
    />
  );
}

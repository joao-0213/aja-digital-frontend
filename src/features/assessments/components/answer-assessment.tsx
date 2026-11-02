'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Badge, Button, Card, Empty, ErrorState, LinkButton, PageHeading, Skeleton } from '@/components/ui';
import { useHttpQuery } from '@/hooks/use-http-query';
import { useSession } from '@/providers/app-context';
import { createAssessmentsApi, type AssessmentRead, type AttemptRead, type AttemptStudent } from '../api';
import { QuizSession } from './quiz-session';

function isStaffAssessment(assessment: AssessmentRead): assessment is Extract<AssessmentRead, { questionIds: string[] }> {
  return 'questionIds' in assessment;
}

function deadlineLabel(value: string | null) {
  if (!value) return 'Sem prazo';
  return `Até ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))} (Brasília)`;
}

function TeamSubmissions({ attempts }: { attempts: AttemptRead[] }) {
  const submitted = attempts.filter(attempt => attempt.submittedAt);
  return <div className="mx-auto max-w-3xl">
    <PageHeading eyebrow="Consulta individual" title="Envios dos alunos" description="A equipe consulta somente tentativas entregues. Rascunhos privados não aparecem aqui." />
    <Card>
      {submitted.length ? <ul className="divide-y divide-slate-100">{submitted.map(attempt => <li key={attempt.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div><p className="font-medium text-slate-800">{attempt.studentName}</p><p className="text-sm text-slate-600">{attempt.assessmentTitle}</p><p className="text-xs text-slate-500">{attempt.submittedAt && new Date(attempt.submittedAt).toLocaleString('pt-BR')}</p></div>
        <Link className="inline-flex min-h-11 items-center font-semibold text-brand-700" href={`/questionarios/resultado?id=${encodeURIComponent(attempt.id)}`}>Consultar resultado</Link>
      </li>)}</ul> : <p className="text-sm leading-6 text-slate-600">Ainda não há envios. Rascunhos continuam privados para cada aluno.</p>}
    </Card>
    <div className="mt-5"><LinkButton secondary href="/questionarios">Ver atividades</LinkButton></div>
  </div>;
}

export function AnswerAssessment() {
  const { client, sessionKey, resourceEpoch, status, user } = useSession();
  const params = useSearchParams();
  const id = params.get('id') ?? '';
  const deliveryId = params.get('entrega');
  const api = useMemo(() => createAssessmentsApi(client), [client]);
  const assessment = useHttpQuery({ sessionKey, key: `attempt-assessment:${id}:${resourceEpoch}` }, useCallback(signal => api.readForSession(id, sessionKey, signal), [api, id, sessionKey]), status === 'authenticated' && !!id && !deliveryId);
  const attempts = useHttpQuery({ sessionKey, key: `attempt-list:${id}:${resourceEpoch}` }, useCallback(signal => api.allAttempts({ assessmentId: id }, signal, sessionKey), [api, id, sessionKey]), status === 'authenticated' && !!id && !!assessment.data);
  const startIntent = useRef<string | null>(null);
  const [started, setStarted] = useState<AttemptStudent | null>(null);
  const [startBusy, setStartBusy] = useState(false);
  const [startError, setStartError] = useState('');
  const currentSessionKey = useRef(sessionKey);
  currentSessionKey.current = sessionKey;

  if (status === 'loading' || assessment.loading) return <Skeleton />;
  if (status !== 'authenticated' || !user) return <Empty title="Entre para consultar a atividade" action={<LinkButton href="/questionarios">Ver atividades</LinkButton>} />;
  if (deliveryId) return <Empty title="Consulta de trabalhos ainda não disponível" description="Os comprovantes e o feedback de trabalhos serão habilitados na próxima etapa." action={<LinkButton href="/questionarios">Voltar para atividades</LinkButton>} />;
  if (!id) return <Empty title="Atividade não encontrada" description="Abra uma atividade pela lista da disciplina." action={<LinkButton href="/questionarios">Ver atividades</LinkButton>} />;
  if (assessment.error) return <ErrorState message={assessment.error.message} retry={() => void assessment.retry()} />;
  if (!assessment.data) return <Empty title="Atividade indisponível" action={<LinkButton href="/questionarios">Ver atividades</LinkButton>} />;
  const activity = assessment.data;
  if (activity.kind === 'work') return <Empty title="Envio de trabalhos ainda não disponível" description="Os trabalhos e o feedback serão habilitados na próxima etapa da migração." action={<LinkButton href="/questionarios">Voltar para atividades</LinkButton>} />;
  if (attempts.loading) return <Skeleton />;
  if (attempts.error) return <ErrorState message={attempts.error.message} retry={() => void attempts.retry()} />;
  const listed = attempts.data ?? [];
  if (user.role !== 'student') return <TeamSubmissions attempts={listed} />;
  const studentAttempts = listed.filter(attempt => attempt.userId === user.id);
  const active = started ?? studentAttempts.find(attempt => !attempt.submittedAt) as AttemptStudent | undefined;
  const submitted = studentAttempts.filter(attempt => attempt.submittedAt);
  if (active) return <QuizSession key={`${active.id}:${active.questionsUpdatedAt ?? ''}`} attempt={active} title={activity.title} deadline={activity.deadline} allowLate={activity.allowLate} />;

  if (!('assigned' in activity) || !activity.assigned) return <div className="mx-auto max-w-3xl">
    <PageHeading eyebrow="Consulta de atividade" title={activity.title} description={activity.description} />
    <Card><p role="status" className="text-sm leading-6 text-slate-700">Disponível apenas para consulta. Esta atividade não foi atribuída à sua matrícula.</p><p className="mt-3 text-sm text-slate-500">{activity.required ? 'Obrigatória' : 'Opcional'} · {deadlineLabel(activity.deadline)}</p></Card>
    <div className="mt-5"><LinkButton secondary href="/questionarios">Voltar para atividades</LinkButton></div>
  </div>;

  const start = async () => {
    if (startBusy || status !== 'authenticated') return;
    startIntent.current ??= crypto.randomUUID();
    const requestSession = sessionKey;
    setStartBusy(true);
    setStartError('');
    try {
      const attempt = await api.startAttempt(activity.id, startIntent.current, requestSession);
      const latest = client.getSnapshot();
      if (latest.status === 'authenticated' && latest.sessionKey === requestSession && currentSessionKey.current === requestSession) setStarted(attempt);
    } catch (cause: unknown) {
      const latest = client.getSnapshot();
      if (latest.status === 'authenticated' && latest.sessionKey === requestSession && currentSessionKey.current === requestSession) setStartError(cause instanceof Error ? cause.message : 'Não foi possível iniciar o questionário.');
    } finally {
      if (currentSessionKey.current === requestSession) setStartBusy(false);
    }
  };
  return <div className="mx-auto max-w-3xl">
    <PageHeading eyebrow="Questionário" title={activity.title} description={activity.description} />
    <Card>
      <div className="mb-5 flex flex-wrap gap-2"><Badge tone="purple">{isStaffAssessment(activity) ? activity.questionIds.length : activity.questionCount} questões</Badge><Badge>Envio único</Badge><Badge tone="amber">{deadlineLabel(activity.deadline)}</Badge><Badge>{activity.required ? 'Obrigatória' : 'Opcional'}</Badge></div>
      <h2 className="font-semibold">Antes de começar</h2>
      <ul className="my-5 list-disc space-y-3 pl-5 text-sm leading-6 text-slate-600">
        <li>As questões e a ordem ficam registrados nesta tentativa.</li>
        <li>As respostas salvas no servidor podem ser retomadas em outro navegador.</li>
        <li>Questões em branco não recebem pontos.</li>
        <li>O serviço confirma atribuição e prazo no início e no envio.</li>
      </ul>
      {submitted.length > 0 && <div className="mb-5 border-t border-slate-100 pt-4"><h3 className="mb-2 text-sm font-semibold">Envio registrado</h3>{submitted.map(attempt => <Link key={attempt.id} href={`/questionarios/resultado?id=${encodeURIComponent(attempt.id)}`} className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm"><span>{attempt.submittedAt && new Date(attempt.submittedAt).toLocaleString('pt-BR')}</span><span className="font-semibold text-brand-700">Ver resultado</span></Link>)}</div>}
      {startError && <p role="alert" className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{startError}</p>}
      <Button className="w-full" disabled={submitted.length > 0} loading={startBusy} onClick={() => void start()}>{submitted.length ? 'Questionário já enviado' : studentAttempts.length ? 'Retomar questionário' : 'Iniciar questionário'}</Button>
      <p className="mt-3 text-center text-xs text-slate-500">Um único envio. A tentativa permanece ligada à sua conta.</p>
    </Card>
  </div>;
}

'use client';

import { ClipboardCheck, Plus } from 'lucide-react';
import { Badge, Button, Empty, LinkButton } from '@/components/ui';
import { sortByDeadlineAsc } from '@/lib/utils';
import type { TrailModule } from '@/models';
import type { AssessmentRead, AttemptRead, SubmissionRead } from '../api';

function isStaffAssessment(activity: AssessmentRead): activity is Extract<AssessmentRead, { questionIds: string[] }> {
  return 'questionIds' in activity;
}

function deadlineLabel(value: string | null) {
  if (!value) return 'Sem prazo';
  return `Até ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))} (Brasília)`;
}

export function AssessmentSummaries({
  module,
  items,
  attempts = [],
  submissions = [],
  canManage,
  studentId,
  loading = false,
  error,
  retry,
  attemptsLoading = false,
  attemptsError,
  retryAttempts,
  submissionsLoading = false,
  submissionsError,
  retrySubmissions
}: {
  module: TrailModule;
  items: AssessmentRead[];
  attempts?: AttemptRead[];
  submissions?: SubmissionRead[];
  canManage: boolean;
  studentId?: string;
  loading?: boolean;
  error?: Error;
  retry?: () => void;
  attemptsLoading?: boolean;
  attemptsError?: Error;
  retryAttempts?: () => void;
  submissionsLoading?: boolean;
  submissionsError?: Error;
  retrySubmissions?: () => void;
}) {
  const activities = sortByDeadlineAsc(items.filter(item => item.moduleId === module.id));
  return <section aria-label={`Atividades do módulo ${module.title}`} className="border-t border-slate-100 px-5 py-4">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold"><ClipboardCheck aria-hidden="true" className="size-4 text-brand-700" />Atividades</h4>
      {canManage && <LinkButton secondary href={`/questionarios/criar?modulo=${encodeURIComponent(module.id)}`}><Plus aria-hidden="true" className="size-4" />Criar atividade</LinkButton>}
    </div>
    {loading ? <p role="status" className="py-3 text-sm text-slate-500">Carregando atividades…</p> : error ? <div role="alert" className="space-y-2 text-sm"><p className="text-rose-700">{error.message}</p>{retry && <button type="button" onClick={retry} className="min-h-11 font-bold text-brand-700 underline underline-offset-4 hover:text-brand-900">Tentar novamente</button>}</div> : !activities.length ? <Empty title="Nenhuma atividade neste módulo" description={canManage ? 'Crie um rascunho para preparar a próxima atividade.' : 'As atividades serão exibidas após a publicação.'} /> : <ul className="space-y-3">{activities.map(activity => {
      const staff = isStaffAssessment(activity);
      const questionCount = staff ? activity.questionIds.length : activity.questionCount;
      const assigned = staff || activity.assigned;
      const related = attempts.filter(attempt => attempt.assessmentId === activity.id && (canManage || attempt.userId === studentId));
      const activeAttempt = related.find(attempt => !attempt.submittedAt);
      const submitted = related.filter(attempt => attempt.submittedAt);
      const relatedSubmissions = submissions.filter(submission => submission.assessmentId === activity.id && (canManage || submission.userId === studentId));
      const ownSubmission = relatedSubmissions.find(submission => !canManage) ?? relatedSubmissions[0];
      return <li key={activity.id} className="flex flex-wrap items-start gap-3 rounded-lg border border-slate-200 p-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2"><p className="min-w-0 font-medium [overflow-wrap:anywhere]">{activity.title}</p><Badge tone={activity.status === 'draft' ? 'neutral' : !assigned ? 'amber' : 'green'}>{activity.status === 'draft' ? 'Rascunho' : !assigned ? 'Somente consulta' : 'Publicada'}</Badge></div>
          <p className="text-xs text-slate-500">{activity.kind === 'work' ? 'Entrega de trabalho' : `${questionCount} ${questionCount === 1 ? 'questão' : 'questões'}`} · {activity.required ? 'Obrigatória' : 'Opcional'} · {deadlineLabel(activity.deadline)}</p>
        </div>
        <LinkButton secondary href={`/questionarios?id=${encodeURIComponent(activity.id)}`}>Detalhes</LinkButton>
        {activity.kind === 'quiz' && attemptsLoading && <span role="status" className="inline-flex min-h-11 items-center text-xs text-slate-500">Carregando tentativa…</span>}
        {activity.kind === 'quiz' && attemptsError && <span className="flex flex-wrap items-center gap-2 text-xs text-rose-700"><span role="alert">{attemptsError.message}</span>{retryAttempts && <Button variant="secondary" onClick={retryAttempts}>Tentar novamente</Button>}</span>}
        {activity.kind === 'quiz' && !attemptsLoading && !attemptsError && canManage && submitted.length > 0 && <LinkButton href={`/questionarios/responder?id=${encodeURIComponent(activity.id)}`}>Consultar envios</LinkButton>}
        {activity.kind === 'quiz' && !attemptsLoading && !attemptsError && studentId && assigned && (submitted[0]
          ? <LinkButton href={`/questionarios/resultado?id=${encodeURIComponent(submitted[0].id)}`}>Ver resultado</LinkButton>
          : <LinkButton href={`/questionarios/responder?id=${encodeURIComponent(activity.id)}`}>{activeAttempt ? 'Retomar' : 'Iniciar'}</LinkButton>)}
        {activity.kind === 'work' && submissionsLoading && <span role="status" className="inline-flex min-h-11 items-center text-xs text-slate-500">Consultando entrega…</span>}
        {activity.kind === 'work' && submissionsError && <span className="flex flex-wrap items-center gap-2 text-xs text-rose-700"><span role="alert">{submissionsError.message}</span>{retrySubmissions && <Button variant="secondary" onClick={retrySubmissions}>Tentar novamente</Button>}</span>}
        {activity.kind === 'work' && !submissionsLoading && !submissionsError && canManage && <><span className="self-center text-xs text-slate-500">{relatedSubmissions.length} entrega(s) concluída(s)</span>{relatedSubmissions.length > 0 && <LinkButton href={`/questionarios/responder?id=${encodeURIComponent(activity.id)}`}>Consultar entregas</LinkButton>}</>}
        {activity.kind === 'work' && !submissionsLoading && !submissionsError && studentId && assigned && (ownSubmission
          ? <LinkButton href={`/questionarios/responder?id=${encodeURIComponent(activity.id)}${ownSubmission.submittedAt ? `&entrega=${encodeURIComponent(ownSubmission.id)}` : ''}`}>{ownSubmission.submittedAt ? 'Consultar comprovante' : 'Retomar rascunho'}</LinkButton>
          : <LinkButton href={`/questionarios/responder?id=${encodeURIComponent(activity.id)}`}>Preparar entrega</LinkButton>)}
        {canManage && <LinkButton secondary href={`/questionarios/criar?id=${encodeURIComponent(activity.id)}`}>{activity.status === 'draft' ? 'Reabrir rascunho' : 'Editar atividade'}</LinkButton>}
      </li>;
    })}</ul>}
  </section>;
}

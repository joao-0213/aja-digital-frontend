'use client';

import Link from 'next/link';
import { ClipboardCheck, Plus } from 'lucide-react';
import { Badge, Button, Empty, LinkButton } from '@/components/ui';
import { countLabel, sortByDeadlineAsc } from '@/lib/utils';
import type { TrailModule } from '@/models';
import type { AssessmentRead, AttemptRead, SubmissionRead } from '../api';
import { classifyStudentActivity } from '../lib/activity-list';

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
      const submitted = related.filter(attempt => attempt.submittedAt);
      const relatedSubmissions = submissions.filter(submission => submission.assessmentId === activity.id && (canManage || submission.userId === studentId));
      const studentStatus = studentId ? classifyStudentActivity(activity, studentId, attempts, submissions) : null;
      return <li key={activity.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 p-3.5">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Link href={`/questionarios?id=${encodeURIComponent(activity.id)}`} className="min-w-0 font-medium text-slate-900 [overflow-wrap:anywhere] hover:text-brand-700">{activity.title}</Link>
            {studentStatus ? <Badge tone={studentStatus.tone}>{studentStatus.label}</Badge> : <Badge tone={activity.status === 'draft' ? 'neutral' : !assigned ? 'amber' : 'green'}>{activity.status === 'draft' ? 'Rascunho' : !assigned ? 'Somente consulta' : 'Publicada'}</Badge>}
          </div>
          <p className="text-xs text-slate-500">{activity.kind === 'work' ? 'Trabalho' : countLabel(questionCount, 'questão', 'questões')} · {activity.required ? 'Obrigatória' : 'Opcional'} · {deadlineLabel(activity.deadline)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/questionarios?id=${encodeURIComponent(activity.id)}`} className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">Detalhes</Link>
          {activity.kind === 'quiz' && attemptsLoading && <span role="status" className="inline-flex min-h-10 items-center text-xs text-slate-500">Carregando…</span>}
          {activity.kind === 'quiz' && attemptsError && <span className="flex flex-wrap items-center gap-2 text-xs text-rose-700"><span role="alert">{attemptsError.message}</span>{retryAttempts && <Button variant="secondary" onClick={retryAttempts}>Tentar novamente</Button>}</span>}
          {activity.kind === 'work' && submissionsLoading && <span role="status" className="inline-flex min-h-10 items-center text-xs text-slate-500">Consultando…</span>}
          {activity.kind === 'work' && submissionsError && <span className="flex flex-wrap items-center gap-2 text-xs text-rose-700"><span role="alert">{submissionsError.message}</span>{retrySubmissions && <Button variant="secondary" onClick={retrySubmissions}>Tentar novamente</Button>}</span>}
          {studentStatus && !attemptsLoading && !attemptsError && !submissionsLoading && !submissionsError && studentStatus.actionKind === 'primary' && <LinkButton href={studentStatus.actionHref}>{studentStatus.actionLabel}</LinkButton>}
          {studentStatus && !attemptsLoading && !attemptsError && !submissionsLoading && !submissionsError && studentStatus.actionKind === 'secondary' && <LinkButton secondary href={studentStatus.actionHref}>{studentStatus.actionLabel}</LinkButton>}
          {canManage && <LinkButton secondary href={`/questionarios/criar?id=${encodeURIComponent(activity.id)}`}>{activity.status === 'draft' ? 'Reabrir rascunho' : 'Editar'}</LinkButton>}
          {activity.kind === 'quiz' && !attemptsLoading && !attemptsError && canManage && submitted.length > 0 && <LinkButton href={`/questionarios/responder?id=${encodeURIComponent(activity.id)}`}>Consultar envios ({submitted.length})</LinkButton>}
          {activity.kind === 'work' && !submissionsLoading && !submissionsError && canManage && relatedSubmissions.length > 0 && <LinkButton href={`/questionarios/responder?id=${encodeURIComponent(activity.id)}`}>Consultar entregas ({relatedSubmissions.length})</LinkButton>}
        </div>
      </li>;
    })}</ul>}
  </section>;
}

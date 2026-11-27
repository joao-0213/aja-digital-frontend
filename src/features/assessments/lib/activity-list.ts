import { formatScore } from '@/lib/utils';
import { sortByDeadlineAsc } from '@/lib/academic-format';
import type { AssessmentRead, AttemptRead, SubmissionRead } from '../api';

export type StudentActivityGroupKey = 'pending' | 'awaiting_feedback' | 'completed' | 'readonly';

export interface StudentActivityStatus {
  group: StudentActivityGroupKey;
  label: string;
  tone: 'purple' | 'blue' | 'amber' | 'green' | 'neutral';
  actionKind: 'primary' | 'secondary' | 'none';
  actionLabel: string;
  actionHref: string;
}

export interface StudentActivityEntry {
  activity: AssessmentRead;
  status: StudentActivityStatus;
}

export interface StudentActivityGroup {
  key: StudentActivityGroupKey;
  title: string;
  entries: StudentActivityEntry[];
}

export function classifyStudentActivity(
  activity: AssessmentRead,
  userId: string,
  attempts: readonly AttemptRead[],
  submissions: readonly SubmissionRead[],
): StudentActivityStatus {
  const assigned = 'assigned' in activity ? activity.assigned : true;
  if (!assigned) {
    return {
      group: 'readonly',
      label: 'Somente consulta',
      tone: 'neutral',
      actionKind: 'none',
      actionLabel: '',
      actionHref: '',
    };
  }

  if (activity.kind === 'quiz') {
    const related = attempts.filter(attempt => attempt.assessmentId === activity.id && attempt.userId === userId);
    const submitted = related.find(attempt => attempt.submittedAt);
    if (submitted) {
      return {
        group: 'completed',
        label: 'Concluída',
        tone: 'green',
        actionKind: 'secondary',
        actionLabel: 'Ver resultado',
        actionHref: `/questionarios/resultado?id=${encodeURIComponent(submitted.id)}`,
      };
    }
    const active = related.find(attempt => !attempt.submittedAt);
    if (active) {
      return {
        group: 'pending',
        label: 'Em andamento',
        tone: 'blue',
        actionKind: 'primary',
        actionLabel: 'Retomar',
        actionHref: `/questionarios/responder?id=${encodeURIComponent(activity.id)}`,
      };
    }
    return {
      group: 'pending',
      label: 'Pendente',
      tone: 'purple',
      actionKind: 'primary',
      actionLabel: 'Iniciar',
      actionHref: `/questionarios/responder?id=${encodeURIComponent(activity.id)}`,
    };
  }

  const ownSubmission = submissions.find(submission => submission.assessmentId === activity.id && submission.userId === userId);
  if (ownSubmission?.submittedAt) {
    const feedback = ownSubmission.feedbackPublished;
    if (feedback) {
      const gradeLabel = feedback.grade !== null && feedback.grade !== undefined
        ? `Avaliada · ${formatScore(feedback.grade)}`
        : 'Avaliada';
      return {
        group: 'completed',
        label: gradeLabel,
        tone: 'green',
        actionKind: 'secondary',
        actionLabel: 'Ver feedback',
        actionHref: `/questionarios/responder?id=${encodeURIComponent(activity.id)}&entrega=${encodeURIComponent(ownSubmission.id)}`,
      };
    }
    return {
      group: 'awaiting_feedback',
      label: 'Aguardando correção',
      tone: 'amber',
      actionKind: 'secondary',
      actionLabel: 'Comprovante',
      actionHref: `/questionarios/responder?id=${encodeURIComponent(activity.id)}&entrega=${encodeURIComponent(ownSubmission.id)}`,
    };
  }

  if (ownSubmission) {
    return {
      group: 'pending',
      label: 'Em andamento',
      tone: 'blue',
      actionKind: 'primary',
      actionLabel: 'Retomar rascunho',
      actionHref: `/questionarios/responder?id=${encodeURIComponent(activity.id)}`,
    };
  }

  return {
    group: 'pending',
    label: 'Pendente',
    tone: 'purple',
    actionKind: 'primary',
    actionLabel: 'Preparar entrega',
    actionHref: `/questionarios/responder?id=${encodeURIComponent(activity.id)}`,
  };
}

const groupOrder: readonly { key: StudentActivityGroupKey; title: string }[] = [
  { key: 'pending', title: 'Pendentes' },
  { key: 'awaiting_feedback', title: 'Aguardando correção' },
  { key: 'completed', title: 'Concluídas' },
  { key: 'readonly', title: 'Somente consulta' },
];

export function groupStudentActivities(
  activities: readonly AssessmentRead[],
  userId: string,
  attempts: readonly AttemptRead[],
  submissions: readonly SubmissionRead[],
): StudentActivityGroup[] {
  const sorted = sortByDeadlineAsc(activities);
  const buckets = new Map<StudentActivityGroupKey, StudentActivityEntry[]>();
  for (const activity of sorted) {
    const status = classifyStudentActivity(activity, userId, attempts, submissions);
    const list = buckets.get(status.group);
    if (list) list.push({ activity, status });
    else buckets.set(status.group, [{ activity, status }]);
  }
  return groupOrder
    .map(group => ({ ...group, entries: buckets.get(group.key) ?? [] }))
    .filter(group => group.entries.length > 0);
}

export function deadlineParts(value: string | null): { date: string; time: string } | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const date = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: 'short',
  }).format(parsed).replace(/\.$/, '');
  const time = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
  return { date, time };
}

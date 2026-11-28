import { Award, CalendarClock, Clock3, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui';
import { brazilDateTimeLabel, cn, formatScore } from '@/lib/utils';

export function ActivityConditions({
  activity,
  embedded = false
}: {
  activity: {
    kind: 'quiz' | 'work';
    required: boolean;
    deadline: string | null;
    allowLate: boolean;
    maxGrade?: number | null;
  };
  embedded?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-600',
        embedded ? '' : 'my-4 rounded-xl border border-slate-200 bg-white px-4 py-3'
      )}
    >
      <Badge tone="purple">
        {activity.kind === 'work' ? 'Entrega de trabalho' : 'Questionário'}
      </Badge>
      <span className="inline-flex items-center gap-1.5 font-medium text-slate-600">
        <CalendarClock aria-hidden="true" className="size-3.5 text-brand-600" />
        {activity.deadline
          ? `Prazo: ${brazilDateTimeLabel(activity.deadline)} (Brasília)`
          : 'Sem prazo'}
      </span>
      {activity.deadline && (
        <span className="inline-flex items-center gap-1.5 text-slate-500">
          <Clock3 aria-hidden="true" className="size-3.5 text-slate-400" />
          {activity.allowLate ? 'Aceita entrega atrasada' : 'Não aceita atraso'}
        </span>
      )}
      {activity.kind === 'work' &&
        activity.maxGrade !== null &&
        activity.maxGrade !== undefined && (
          <span className="inline-flex items-center gap-1.5 text-slate-500">
            <Award aria-hidden="true" className="size-3.5 text-brand-600" />
            Nota máxima: {formatScore(activity.maxGrade)}
          </span>
        )}
      <span className="inline-flex items-center gap-1.5 text-slate-500">
        <ShieldCheck aria-hidden="true" className="size-3.5 text-slate-400" />
        Um único envio
      </span>
    </div>
  );
}

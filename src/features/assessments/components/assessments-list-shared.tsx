'use client';

import { Select, Tabs, type TabItem } from '@/components/ui';
import { cn } from '@/lib/utils';
import { deadlineParts } from '../lib/activity-list';

export type StaffFilter = 'all' | 'draft' | 'published';
export type StudentFilter = 'all' | 'pending' | 'completed';

export function DeadlineColumn({
  deadline,
  urgent = false
}: {
  deadline: string | null;
  urgent?: boolean;
}) {
  const parts = deadlineParts(deadline);
  if (!parts) {
    return (
      <div className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-slate-400 sm:w-28 sm:flex-col sm:items-start sm:gap-0.5">
        <span>Sem prazo</span>
      </div>
    );
  }
  return (
    <div className="flex shrink-0 items-baseline gap-2 sm:w-28 sm:flex-col sm:gap-0.5">
      <span
        className={cn(
          'text-sm font-semibold tabular-nums',
          urgent ? 'text-brand-700' : 'text-slate-700'
        )}
      >
        {parts.date}
      </span>
      <span className="text-xs tabular-nums text-slate-500">{parts.time}</span>
    </div>
  );
}

export type ActivityTab<T extends string> = TabItem<T>;

export function ActivityTabs<T extends string>({
  ariaLabel,
  tabs,
  value,
  onChange,
  subjectFilter,
  filterSubjects,
  onSubjectChange
}: {
  ariaLabel: string;
  tabs: readonly ActivityTab<T>[];
  value: T;
  onChange: (next: T) => void;
  subjectFilter: string;
  filterSubjects: { id: string; name: string }[];
  onSubjectChange: (next: string) => void;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6 sm:border-b sm:border-slate-200">
      <Tabs ariaLabel={ariaLabel} tabs={tabs} value={value} onChange={onChange} />
      {filterSubjects.length > 1 && (
        <div className="w-full sm:w-64 sm:pb-2">
          <Select
            aria-label="Filtrar por disciplina"
            value={subjectFilter}
            onChange={(event) => onSubjectChange(event.target.value)}
          >
            <option value="all">Todas as disciplinas</option>
            {filterSubjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </Select>
        </div>
      )}
    </div>
  );
}

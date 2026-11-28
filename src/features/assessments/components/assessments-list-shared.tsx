'use client';

import { Select } from '@/components/ui';
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

export interface ActivityTab<T extends string> {
  value: T;
  label: string;
  count?: number;
}

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
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="flex flex-wrap gap-6 border-b border-slate-200 sm:border-b-0"
      >
        {tabs.map((tab) => {
          const active = value === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.value)}
              className={cn(
                '-mb-px inline-flex min-h-12 cursor-pointer items-center gap-2 border-b-2 px-1 py-3 text-sm font-semibold transition-colors',
                active
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              )}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                    active ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
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

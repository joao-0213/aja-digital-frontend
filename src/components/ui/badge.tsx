import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Badge({
  children,
  tone = 'neutral'
}: {
  children: ReactNode;
  tone?: 'neutral' | 'purple' | 'green' | 'amber' | 'red' | 'blue';
}) {
  const colors = {
    neutral: 'bg-slate-100 text-slate-600',
    purple: 'bg-brand-50 text-brand-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-800',
    red: 'bg-rose-50 text-rose-700',
    blue: 'bg-blue-50 text-blue-700'
  };
  return <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold', colors[tone])}>
    {children}
  </span>;
}

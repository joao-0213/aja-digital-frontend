import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const toneClasses = {
  error: 'border-rose-200 bg-rose-50 text-rose-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  info: 'border-sky-200 bg-sky-50 text-sky-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800'
} as const;

export function InlineAlert({
  tone = 'info',
  role,
  className,
  children
}: {
  tone?: 'error' | 'warning' | 'info' | 'success';
  role?: 'alert' | 'status';
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role={role ?? (tone === 'error' ? 'alert' : 'status')}
      className={cn('rounded-lg border p-3 text-sm leading-6', toneClasses[tone], className)}
    >
      {children}
    </div>
  );
}

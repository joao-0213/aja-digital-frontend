import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const paddingClasses = {
  default: 'p-5 sm:p-6',
  compact: 'p-3 sm:p-6',
  none: 'p-0'
} as const;

export function Card({
  children,
  padding = 'default',
  className
}: {
  children: ReactNode;
  padding?: 'default' | 'compact' | 'none';
  className?: string;
}) {
  return (
    <section
      className={cn(
        'min-w-0 rounded-xl border border-slate-200 bg-white',
        paddingClasses[padding],
        className
      )}
    >
      {children}
    </section>
  );
}

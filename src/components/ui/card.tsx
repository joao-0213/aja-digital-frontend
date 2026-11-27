import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cn('min-w-0 rounded-xl border border-slate-200 bg-white p-5 sm:p-6', className)}>
    {children}
  </section>;
}

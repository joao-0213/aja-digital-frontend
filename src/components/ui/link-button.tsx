import { type ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { buttonStyles } from './button-styles';

export function LinkButton({
  href,
  children,
  secondary = false,
  className
}: {
  href: string;
  children: ReactNode;
  secondary?: boolean;
  className?: string;
}) {
  return <Link href={href} className={cn(buttonStyles, secondary ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50' : 'bg-brand-600 text-white hover:bg-brand-700', className)}>
    {children}
  </Link>;
}

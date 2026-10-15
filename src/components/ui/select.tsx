'use client';

import { useId, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { field } from './field-styles';

export function Select({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
}) {
  const id = useId();
  return <div className="space-y-1.5">
    {label && <label htmlFor={id} className="block text-sm font-medium text-slate-700">
      {label}
    </label>}
    <select id={id} {...props} className={cn(field, props.className)}>
      {children}
    </select>
  </div>;
}

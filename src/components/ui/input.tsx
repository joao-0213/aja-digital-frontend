'use client';

import { useId, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { field } from './field-styles';

export function Input({
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
}) {
  const id = useId();
  return <div className="space-y-1.5">
    {label && <label htmlFor={id} className="block text-sm font-medium text-slate-700">
      {label}
    </label>}
    <input id={id} {...props} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} className={cn(field, props.className)} />
    {error && <p id={`${id}-error`} className="text-sm text-rose-600">
      {error}
    </p>}
  </div>;
}

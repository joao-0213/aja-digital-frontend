'use client';

import { useId, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { field } from './field-styles';

export function Textarea({
  label,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
}) {
  const id = useId();
  return <div className="space-y-1.5">
    <label htmlFor={id} className="block text-sm font-medium text-slate-700">
      {label}
      {props.required && <span aria-hidden="true" className="ml-0.5 text-rose-600">*</span>}
    </label>
    <textarea id={id} rows={4} {...props} className={cn(field, 'resize-y', props.className)} />
  </div>;
}

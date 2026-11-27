'use client';

import { Check as CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Check({
  label,
  checked,
  onChange,
  disabled = false
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return <label className={cn('group flex min-h-10 items-center gap-3 text-sm text-slate-700 select-none', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer')}>
    <input
      type="checkbox"
      checked={checked}
      onChange={event => onChange(event.target.checked)}
      disabled={disabled}
      className="peer sr-only"
    />
    <span
      aria-hidden="true"
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600',
        checked
          ? 'border-brand-600 bg-brand-600 text-white shadow-2xs'
          : 'border-slate-300 bg-white text-transparent group-hover:border-slate-400',
      )}
    >
      <CheckIcon className="size-3.5" strokeWidth={2.5} />
    </span>
    <span className="leading-5">{label}</span>
  </label>;
}

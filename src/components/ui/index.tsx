'use client';

import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import Link from 'next/link';
import { Inbox, Loader2, X, RefreshCw } from 'lucide-react';
import { cn, initials } from '@/lib/utils';
export const buttonStyles = 'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50';
export function Button({
  children,
  variant = 'primary',
  loading,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
}) {
  return <button type="button" {...props} disabled={props.disabled || loading} className={cn(buttonStyles, variant === 'primary' && 'bg-brand-600 text-white hover:bg-brand-700', variant === 'secondary' && 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50', variant === 'ghost' && 'text-slate-600 hover:bg-slate-100', variant === 'danger' && 'bg-rose-600 text-white hover:bg-rose-700', className)}>
    {loading && <Loader2 className="size-4 animate-spin" />}
    {children}
  </button>;
}
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
export function Card({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cn('rounded-xl border border-slate-200 bg-white p-5 sm:p-6', className)}>
    {children}
  </section>;
}
const field = 'min-h-11 w-full rounded-lg border border-slate-400 bg-white px-3 py-2.5 text-base text-slate-800 placeholder:text-slate-500 focus:border-brand-600 focus:outline-2 focus:outline-offset-2 focus:outline-brand-600 disabled:bg-slate-100 disabled:cursor-not-allowed';
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
export function Textarea({
  label,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
}) {
  const id = useId();
  return <div className="space-y-1.5">
    <label htmlFor={id} className="block text-sm font-medium">
      {label}
    </label>
    <textarea id={id} rows={4} {...props} className={cn(field, 'resize-y', props.className)} />
  </div>;
}
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
export function Avatar({
  name,
  size = 'md',
  src
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  src?: string;
}) {
  return <span className={cn('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 font-semibold text-brand-700', size === 'sm' ? 'size-8 text-xs' : size === 'lg' ? 'size-20 text-2xl' : 'size-10 text-sm')}>
    {src ? <img src={src} alt={name} className="size-full object-cover" /> : initials(name)}
  </span>;
}
export function ProgressBar({
  value,
  label
}: {
  value: number;
  label: string;
}) {
  return <div role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-slate-100">
    <div className="h-full rounded-full bg-brand-500 transition-all" style={{
      width: `${Math.min(100, Math.max(0, value))}%`
    }} />
  </div>;
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
    <div className="min-w-0 w-full sm:w-auto">
      {eyebrow && <p className="mb-2 text-sm font-medium text-slate-500">
        {eyebrow}
      </p>}
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        {title}
      </h1>
      {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
        {description}
      </p>}
    </div>
    {action}
  </div>;
}
export function Empty({
  title = 'Nada por aqui ainda',
  description = 'Novos conteúdos aparecerão aqui.',
  action
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center">
    <div className="mb-4 rounded-2xl bg-brand-50 p-4">
      <Inbox className="size-7 text-brand-500" />
    </div>
    <h2 className="font-semibold text-slate-800">
      {title}
    </h2>
    <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
      {description}
    </p>
    {action && <div className="mt-5">
      {action}
    </div>}
  </div>;
}
export function Skeleton() {
  return <div role="status" aria-label="Carregando conteúdo" className="space-y-6">
    <span className="sr-only">Carregando conteúdo…</span>
    <div className="h-9 w-60 animate-pulse rounded-lg bg-slate-200" />
    <div className="grid gap-5 sm:grid-cols-3">
      {[1, 2, 3].map(n => <div key={n} className="h-32 animate-pulse rounded-xl bg-slate-200/70" />)}
    </div>
    <div className="h-80 animate-pulse rounded-xl bg-slate-200/70" />
  </div>;
}
export function ErrorState({
  message,
  retry
}: {
  message: string;
  retry: () => void;
}) {
  return <Empty title="Não conseguimos carregar esta página" description={message} action={<Button onClick={retry}><RefreshCw className="size-4" />Tentar novamente</Button>} />;
}
export function Dialog({
  open,
  onClose,
  title,
  children
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const node = ref.current;
    if (open && !node?.open) node?.showModal();else if (!open && node?.open) node.close();
    return () => {
      if (node?.open) node.close();
    };
  }, [open]);
  return <dialog ref={ref} aria-labelledby={id} onCancel={event => {
    event.preventDefault();
    onClose();
  }} onClick={event => {
    if (event.target === ref.current) onClose();
  }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-2xl border-0 bg-white p-0 shadow-2xl backdrop:bg-slate-900/40">
    <div className="p-6 sm:p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 id={id} className="text-xl font-semibold">
          {title}
        </h2>
        <Button variant="ghost" className="px-2" aria-label="Fechar janela" onClick={onClose}>
          <X className="size-5" />
        </Button>
      </div>
      {children}
    </div>
  </dialog>;
}
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
  return <label className="flex min-h-11 items-center gap-3 text-sm text-slate-700">
    <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} disabled={disabled} className="size-4 accent-brand-600" />
    {label}
  </label>;
}

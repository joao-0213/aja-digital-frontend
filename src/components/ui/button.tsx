import { type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonStyles } from './button-styles';

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

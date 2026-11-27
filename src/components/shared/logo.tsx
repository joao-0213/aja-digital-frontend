import Link from 'next/link';
import { cn } from '@/lib/utils';

export function Logo({
  inverted = false,
  symbolOnly = false,
  compact = false
}: {
  inverted?: boolean;
  symbolOnly?: boolean;
  compact?: boolean;
}) {
  return <Link href="/" className="inline-flex items-center gap-2.5" aria-label="AJA Digital — início">
    <img src="/brand/aja-symbol.svg" alt="" width={compact ? 36 : 48} height={compact ? 36 : 48} className={cn('shrink-0', compact ? 'size-9' : 'size-12')} />
    <span aria-hidden={symbolOnly} className={cn('app-sidebar-label flex shrink-0 flex-col', symbolOnly && 'opacity-0')}><span className={cn('flex items-baseline gap-1.5', inverted ? 'text-white' : 'text-brand-900')}><span className={cn('aja-wordmark', compact && '!text-2xl')}>AJA</span><span className={cn('font-medium tracking-wide', compact ? 'text-xs' : 'text-sm')}>digital</span></span><span className={cn('mt-1 text-[10px] tracking-[.08em]', inverted ? 'text-brand-100' : 'text-slate-500')}></span></span>
  </Link>;
}

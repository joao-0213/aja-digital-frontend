import Link from 'next/link';
import { cn } from '@/lib/utils';

export function Logo({
  inverted = false,
  symbolOnly = false
}: {
  inverted?: boolean;
  symbolOnly?: boolean;
}) {
  return <Link href="/" className="inline-flex items-center gap-2.5" aria-label="AJA Digital — início">
    <img src="/brand/aja-symbol.svg" alt="" width={48} height={48} className="size-12 shrink-0" />
    <span aria-hidden={symbolOnly} className={cn('app-sidebar-label flex shrink-0 flex-col', symbolOnly && 'opacity-0')}><span className={cn('flex items-baseline gap-2', inverted ? 'text-white' : 'text-brand-900')}><span className="aja-wordmark">AJA</span><span className="text-sm font-medium tracking-wide">digital</span></span><span className={cn('mt-1 text-[10px] tracking-[.08em]', inverted ? 'text-brand-100' : 'text-slate-500')}></span></span>
  </Link>;
}

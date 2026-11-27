import { cn, initials } from '@/lib/utils';

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 font-semibold text-brand-700',
        size === 'sm' ? 'size-8 text-xs' : size === 'lg' ? 'size-20 text-2xl' : 'size-10 text-sm'
      )}
    >
      {initials(name)}
    </span>
  );
}

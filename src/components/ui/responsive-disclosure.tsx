'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

/** Keep supporting controls available without pushing content down on small screens. */
export function ResponsiveDisclosure({ title, children, breakpoint = 'xl' }: {
  title: ReactNode;
  children: ReactNode;
  breakpoint?: 'lg' | 'xl';
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <>
    <h2 className={cn('mb-4 hidden items-center gap-2 font-semibold', breakpoint === 'lg' ? 'lg:flex' : 'xl:flex')}>{title}</h2>
    <Button variant="ghost" className={cn('w-full !justify-between !px-0', breakpoint === 'lg' ? 'lg:hidden' : 'xl:hidden')} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      <span className="flex items-center gap-2">{title}</span>
      <ChevronDown aria-hidden="true" className={cn('size-4 shrink-0 transition-transform', open && 'rotate-180')} />
    </Button>
    <div id={id} className={cn(open ? 'mt-4' : 'hidden', breakpoint === 'lg' ? 'lg:mt-0 lg:block' : 'xl:mt-0 xl:block')}>{children}</div>
  </>;
}

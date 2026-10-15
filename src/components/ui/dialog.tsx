'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './button';

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

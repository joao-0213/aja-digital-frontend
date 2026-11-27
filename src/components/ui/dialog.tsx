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
    const opener =
      open && document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (open && !node?.open) node?.showModal();
    else if (!open && node?.open) node.close();
    return () => {
      if (node?.open) node.close();
      if (opener)
        requestAnimationFrame(() => {
          const focusedDialog = document.activeElement?.closest('dialog:modal');
          const activeDialog =
            focusedDialog ?? Array.from(document.querySelectorAll('dialog:modal')).at(-1);
          if (opener.isConnected && (!activeDialog || activeDialog.contains(opener)))
            opener.focus({ preventScroll: true });
        });
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      style={{ maxHeight: 'min(85dvh, calc(100dvh - 3rem))' }}
      className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-xl !overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-0 shadow-2xl backdrop:bg-slate-900/45"
    >
      <div style={{ maxHeight: 'min(85dvh, calc(100dvh - 3rem))' }} className="flex flex-col">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-100 bg-white px-6 py-4 sm:px-7">
          <h2 id={id} className="min-w-0 text-xl font-semibold [overflow-wrap:anywhere]">
            {title}
          </h2>
          <Button variant="ghost" className="px-2" aria-label="Fechar janela" onClick={onClose}>
            <X aria-hidden="true" className="size-5" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-7 sm:py-6">{children}</div>
      </div>
    </dialog>
  );
}

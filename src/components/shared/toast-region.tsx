'use client';

import { CheckCircle2, X, AlertCircle } from 'lucide-react';
import type { Toast } from './use-toasts';

export function ToastRegion({ toasts, onDismiss }: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return <div className="fixed bottom-5 right-4 z-[100] flex w-[min(26rem,calc(100vw_-_2rem))] flex-col gap-2" role="status" aria-live="polite">
    {toasts.map(toast => <div key={toast.id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
      {toast.error ? <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-rose-600" /> : <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-emerald-600" />}
      <p className="min-w-0 flex-1 text-sm leading-6 [overflow-wrap:anywhere]">
        {toast.message}
      </p>
      <button type="button" aria-label="Fechar notificação" onClick={() => onDismiss(toast.id)} className="-mr-2 -mt-1.5 flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700">
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>)}
  </div>;
}

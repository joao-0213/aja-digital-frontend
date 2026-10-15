'use client';

import { CheckCircle2, X, AlertCircle } from 'lucide-react';
import type { Toast } from './use-toasts';

export function ToastRegion({ toasts, onDismiss }: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return <div className="fixed bottom-5 right-4 z-[100] flex w-[min(26rem,calc(100vw_-_2rem))] flex-col gap-2" role="status" aria-live="polite">
    {toasts.map(toast => <div key={toast.id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
      {toast.error ? <AlertCircle className="mt-0.5 size-5 shrink-0 text-rose-600" /> : <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />}
      <p className="flex-1 text-sm leading-6">
        {toast.message}
      </p>
      <button aria-label="Fechar notificação" onClick={() => onDismiss(toast.id)}>
        <X className="size-4" />
      </button>
    </div>)}
  </div>;
}

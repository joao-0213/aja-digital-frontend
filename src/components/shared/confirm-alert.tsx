'use client';

import { Button } from '@/components/ui';

export function ConfirmAlert({
  message,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  busy = false
}: {
  message: string;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  return (
    <div role="alert" className="space-y-4">
      <p className="text-sm leading-6 text-slate-600">{message}</p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button autoFocus variant="secondary" disabled={busy} onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant="danger" loading={busy} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Button, Dialog } from '@/components/ui';
import type { AnnouncementDto } from '../api';
import { toErrorMessage } from '@/lib/errors';

function truncateTitle(title: string, maxLength = 80) {
  return title.length > maxLength ? `${title.slice(0, maxLength).trimEnd()}…` : title;
}

export function WithdrawAnnouncementDialog({
  item,
  onClose,
  onWithdraw,
  onWithdrawn,
  onError
}: {
  item: AnnouncementDto | null;
  onClose: () => void;
  onWithdraw: (item: AnnouncementDto) => Promise<unknown>;
  onWithdrawn: () => Promise<unknown> | void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!item || busy) return;
    setBusy(true);
    try {
      await onWithdraw(item);
      await onWithdrawn();
      onError('');
      onClose();
    } catch (error) {
      onError(toErrorMessage(error, 'Não foi possível retirar o aviso.'));
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={!!item}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Retirar aviso"
    >
      {item && (
        <>
          <p className="mb-5 text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">
            Retirar “<strong className="text-slate-900">{truncateTitle(item.title)}</strong>” das
            consultas? O registro e a autoria serão preservados.
          </p>
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" disabled={busy} onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void confirm()}>
              Retirar aviso
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}

'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { brazilDateTimeLabel } from '@/lib/utils';

export function RecordConflict({
  author,
  updatedAt,
  onReviewed,
  children
}: {
  author: string;
  updatedAt?: string;
  onReviewed: () => void;
  children: ReactNode;
}) {
  const [inspecting, setInspecting] = useState(false);
  return (
    <section
      role="alert"
      className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
    >
      <p className="font-semibold">Este registro mudou enquanto você editava.</p>
      <p>
        Última alteração por {author}
        {updatedAt ? ` em ${brazilDateTimeLabel(updatedAt)}` : ''}. Seu preenchimento foi mantido.
        Confira a versão atual e ajuste seu texto antes de tentar salvar novamente.
      </p>
      <Button variant="secondary" onClick={() => setInspecting(true)}>
        Consultar versão atual
      </Button>
      {inspecting && (
        <div className="space-y-3 border-t border-amber-200 pt-3">
          <div className="whitespace-pre-wrap break-words leading-6">{children}</div>
          <Button variant="secondary" onClick={onReviewed}>
            Conferi a versão atual
          </Button>
        </div>
      )}
    </section>
  );
}

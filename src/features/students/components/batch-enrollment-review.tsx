'use client';

import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Badge, Check } from '@/components/ui';
import {
  describePreviewOutcome,
  type BatchEnrollmentItem,
  type BatchSummary
} from '../lib/enrollment-batch';
import type { BatchPhase } from '../hooks/batch-enrollment-state';

/** Displays the pre-confirmation summary badges and select-all toggle during batch review. */
export function BatchEnrollmentReviewSummary({
  summary,
  onToggleAllReady
}: {
  summary: BatchSummary;
  onToggleAllReady: (checked: boolean) => void;
}) {
  const allReadySelected = summary.readyCount > 0 && summary.selectedCount === summary.readyCount;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        {summary.readyCount > 0 && <Badge tone="green">{summary.readyCount} apto(s)</Badge>}
        {summary.blockedCount > 0 && <Badge tone="amber">{summary.blockedCount} impedido(s)</Badge>}
        {summary.previewErrorCount > 0 && (
          <Badge tone="red">{summary.previewErrorCount} erro(s) na conferência</Badge>
        )}
        {summary.invalidCount > 0 && (
          <Badge tone="neutral">{summary.invalidCount} inválido(s)</Badge>
        )}
      </div>
      {summary.readyCount > 0 && (
        <div className="flex items-center gap-2">
          <Check
            label={`Selecionar todos (${summary.selectedCount}/${summary.readyCount})`}
            checked={allReadySelected}
            onChange={onToggleAllReady}
          />
        </div>
      )}
    </div>
  );
}

/** Renders the per-email status list across checking, review, submitting, and done phases. */
export function BatchEnrollmentItemList({
  items,
  phase,
  singleMode,
  onToggleItem
}: {
  items: BatchEnrollmentItem[];
  phase: BatchPhase;
  singleMode: boolean;
  onToggleItem: (email: string, checked: boolean) => void;
}) {
  return (
    <ul
      aria-label="Situação dos e-mails"
      className="max-h-72 divide-y divide-slate-200 overflow-y-auto rounded-xl border border-slate-200 bg-white"
    >
      {items.map((item) => {
        const previewInfo = item.preview ? describePreviewOutcome(item.preview) : null;
        const selectable = phase === 'review' && !singleMode && item.status === 'ready';
        return (
          <li key={item.email} className="flex items-start gap-3 p-3.5 text-sm">
            {selectable && (
              <input
                type="checkbox"
                checked={item.selected}
                aria-label={`Selecionar ${item.email}`}
                onChange={(event) => onToggleItem(item.email, event.target.checked)}
                className="mt-1 size-4 shrink-0 accent-brand-600"
              />
            )}

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="break-all font-semibold text-slate-900">{item.email}</p>
                <ItemStatusBadge item={item} previewInfo={previewInfo} />
              </div>

              {item.status === 'ready' && previewInfo && (
                <p className="text-xs leading-5 text-slate-600">{previewInfo.detail}</p>
              )}

              {item.status === 'blocked' && (
                <div className="space-y-1 text-xs leading-5 text-rose-700">
                  {item.preview?.account && (
                    <p className="text-slate-600">{item.preview.account.name} · Conta existente</p>
                  )}
                  <p>{item.preview?.message ?? item.error}</p>
                  {item.preview?.otherClass && (
                    <p className="text-slate-600">
                      Há vínculo em {item.preview.otherClass.name}. Regularize o destino; não há
                      transferência automática.
                    </p>
                  )}
                </div>
              )}

              {item.status === 'success' && (
                <p className="inline-flex items-center gap-1.5 text-xs leading-5 text-emerald-700">
                  <CheckCircle2 aria-hidden="true" className="size-3.5 shrink-0" />
                  {item.enrollment?.status === 'active'
                    ? 'Aluno vinculado à turma imediatamente.'
                    : 'Matrícula pendente registrada. Aguarda cadastro ou confirmação do e-mail.'}
                </p>
              )}

              {(item.status === 'error' ||
                item.status === 'preview-error' ||
                item.status === 'invalid') &&
                item.error && (
                  <p
                    role="alert"
                    className="inline-flex items-start gap-1.5 text-xs leading-5 text-rose-700"
                  >
                    <XCircle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                    <span>{item.error}</span>
                  </p>
                )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ItemStatusBadge({
  item,
  previewInfo
}: {
  item: BatchEnrollmentItem;
  previewInfo: ReturnType<typeof describePreviewOutcome> | null;
}) {
  switch (item.status) {
    case 'invalid':
      return <Badge tone="red">Formato inválido</Badge>;
    case 'queued':
      return <Badge tone="neutral">Na fila</Badge>;
    case 'checking':
      return (
        <Badge tone="blue">
          <Loader2 aria-hidden="true" className="size-3 animate-spin" />
          Conferindo…
        </Badge>
      );
    case 'ready':
      return <Badge tone={previewInfo?.tone ?? 'green'}>{previewInfo?.badge ?? 'Apto'}</Badge>;
    case 'blocked':
      return <Badge tone="red">Impedido</Badge>;
    case 'preview-error':
      return <Badge tone="red">Erro ao conferir</Badge>;
    case 'submitting':
      return (
        <Badge tone="blue">
          <Loader2 aria-hidden="true" className="size-3 animate-spin" />
          Incluindo…
        </Badge>
      );
    case 'success':
      return (
        <Badge tone={item.enrollment?.status === 'active' ? 'green' : 'purple'}>
          {item.enrollment?.status === 'active' ? 'Vinculado' : 'Pendente'}
        </Badge>
      );
    case 'error':
      return <Badge tone="red">Falhou</Badge>;
  }
}

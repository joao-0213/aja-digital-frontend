'use client';

import { Badge } from '@/components/ui';
import { countLabel } from '@/lib/utils';
import type { BatchSummary } from '../lib/enrollment-batch';

/** Summarizes the outcome of a batch enrollment run after confirmation finishes. */
export function BatchEnrollmentResult({
  summary,
  abortedNotice
}: {
  summary: BatchSummary;
  abortedNotice: string;
}) {
  const headline =
    summary.errorCount === 0 && summary.successCount > 0 && !abortedNotice
      ? `Inclusão concluída: ${countLabel(summary.successCount, 'aluno registrado', 'alunos registrados')}.`
      : summary.successCount > 0 && summary.errorCount > 0
        ? `Processamento concluído com falhas parciais: ${countLabel(summary.successCount, 'incluído', 'incluídos')} e ${countLabel(summary.errorCount, 'falha', 'falhas')}.`
        : summary.successCount > 0
          ? `Processamento interrompido: ${countLabel(summary.successCount, 'aluno registrado', 'alunos registrados')}.`
          : summary.errorCount > 0
            ? `Nenhuma inclusão foi concluída (${countLabel(summary.errorCount, 'falha', 'falhas')}).`
            : 'Processamento interrompido antes de registrar inclusões.';

  return (
    <div role="status" className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-900">{headline}</p>
      <div className="flex flex-wrap gap-2">
        {summary.activeCount > 0 && <Badge tone="green">{summary.activeCount} vinculado(s)</Badge>}
        {summary.pendingCount > 0 && (
          <Badge tone="purple">{summary.pendingCount} pendente(s)</Badge>
        )}
        {summary.errorCount > 0 && <Badge tone="red">{summary.errorCount} falha(s)</Badge>}
        {summary.blockedCount > 0 && <Badge tone="amber">{summary.blockedCount} impedido(s)</Badge>}
        {summary.invalidCount > 0 && (
          <Badge tone="neutral">{summary.invalidCount} inválido(s)</Badge>
        )}
      </div>
    </div>
  );
}

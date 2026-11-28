'use client';

import { Copy, Loader2, PencilLine, RefreshCw } from 'lucide-react';
import { Badge, Button, Dialog, ProgressBar, Textarea } from '@/components/ui';
import { ConfirmAlert } from '@/components/shared/confirm-alert';
import { countLabel, percent } from '@/lib/utils';
import { useBatchEnrollment } from '../hooks/use-batch-enrollment';
import { BatchEnrollmentResult } from './batch-enrollment-result';
import { BatchEnrollmentItemList, BatchEnrollmentReviewSummary } from './batch-enrollment-review';

export function BatchEnrollmentDialog({
  classId,
  className,
  initialIntent,
  close,
  saved,
  onRefresh
}: {
  classId: string;
  className: string;
  initialIntent: string;
  close: () => void;
  saved: () => void;
  onRefresh: () => void;
}) {
  const {
    state,
    parsed,
    summary,
    busy,
    queuedCount,
    pendingPreviewCount,
    setRawEmails,
    removeInvalidEmails,
    toggleItem,
    toggleAllReady,
    backToInput,
    cancelClose,
    closeEditor,
    confirmDiscard,
    finishAndClose,
    stopCurrentRun,
    startPreview,
    retryPreview,
    executeConfirm,
    copyProblemEmails
  } = useBatchEnrollment({ classId, initialIntent, close, saved, onRefresh });

  const { phase, rawEmails, items, progress, inputError, abortedNotice, confirmingClose } = state;
  const singleMode = items.length === 1;
  const progressPercent = percent(progress.completed, progress.total);

  return (
    <Dialog open onClose={closeEditor} title={`Adicionar aluno em ${className}`}>
      {confirmingClose ? (
        <ConfirmAlert
          message={
            parsed.valid.length > 1 || items.length > 1
              ? 'Fechar sem concluir a inclusão destes e-mails?'
              : 'Fechar sem concluir a inclusão deste e-mail?'
          }
          cancelLabel="Continuar"
          confirmLabel="Descartar inclusão"
          onCancel={cancelClose}
          onConfirm={confirmDiscard}
        />
      ) : (
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (phase === 'input') void startPreview();
            else if (phase === 'review') void executeConfirm('selected');
          }}
        >
          <p className="text-sm leading-6 text-slate-600">
            Turma: <strong>{className}</strong>. Cada aluno pode ter apenas uma turma ativa.
          </p>

          {phase === 'input' && (
            <>
              <div className="space-y-2">
                <Textarea
                  label="E-mail do aluno (ou lista de e-mails)"
                  rows={4}
                  placeholder="aluno@escola.edu.br"
                  value={rawEmails}
                  onChange={(event) => setRawEmails(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                      event.preventDefault();
                      void startPreview();
                    }
                  }}
                  aria-describedby="batch-email-hint"
                />
                <p id="batch-email-hint" className="text-xs leading-5 text-slate-500">
                  Separe vários e-mails por linha, vírgula, ponto e vírgula ou espaço.
                </p>
              </div>

              {parsed.totalTokens > 0 && (
                <div
                  role="status"
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={parsed.valid.length > 0 ? 'purple' : 'neutral'}>
                        {countLabel(parsed.valid.length, 'e-mail válido', 'e-mails válidos')}
                      </Badge>
                      {parsed.duplicatesRemoved > 0 && (
                        <Badge tone="neutral">
                          {countLabel(
                            parsed.duplicatesRemoved,
                            'duplicado ignorado',
                            'duplicados ignorados'
                          )}
                        </Badge>
                      )}
                      {parsed.invalid.length > 0 && (
                        <Badge tone="red">
                          {countLabel(
                            parsed.invalid.length,
                            'formato inválido',
                            'formatos inválidos'
                          )}
                        </Badge>
                      )}
                    </div>
                    {parsed.invalid.length > 0 && parsed.valid.length > 0 && (
                      <Button
                        variant="ghost"
                        className="min-h-8 px-2.5 py-1 text-xs"
                        onClick={removeInvalidEmails}
                      >
                        Remover inválidos
                      </Button>
                    )}
                  </div>

                  {parsed.invalid.length > 0 && (
                    <ul className="mt-3 max-h-28 space-y-1 overflow-y-auto border-t border-slate-200 pt-2.5 text-xs text-rose-700">
                      {parsed.invalid.map((entry) => (
                        <li
                          key={entry.email}
                          className="flex flex-wrap items-baseline justify-between gap-2"
                        >
                          <span className="break-all font-medium">{entry.raw}</span>
                          <span className="text-rose-600">{entry.reason}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {inputError && (
                <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
                  {inputError}
                </p>
              )}

              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" onClick={closeEditor}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={!parsed.valid.length}>
                  {parsed.valid.length > 1
                    ? `Conferir ${parsed.valid.length} e-mails`
                    : 'Conferir inclusão'}
                </Button>
              </div>
            </>
          )}

          {phase !== 'input' && (
            <>
              {busy && (
                <div
                  className="space-y-2 rounded-xl border border-brand-200 bg-brand-50/50 p-4"
                  aria-live="polite"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="inline-flex items-center gap-2 font-semibold text-brand-900">
                      <Loader2 aria-hidden="true" className="size-4 animate-spin text-brand-600" />
                      {phase === 'checking'
                        ? `Conferindo ${Math.min(progress.completed + 1, Math.max(progress.total, 1))} de ${progress.total}…`
                        : `Processando ${Math.min(progress.completed + 1, Math.max(progress.total, 1))} de ${progress.total}…`}
                    </span>
                    <span className="text-xs font-medium text-slate-600">
                      {progress.completed}/{progress.total} ({progressPercent}%)
                    </span>
                  </div>
                  <ProgressBar
                    value={progressPercent}
                    label={
                      phase === 'checking' ? 'Progresso da conferência' : 'Progresso da inclusão'
                    }
                  />
                  {progress.currentEmail && (
                    <p className="truncate text-xs text-slate-600">
                      Atual: {progress.currentEmail}
                    </p>
                  )}
                </div>
              )}

              {abortedNotice && (
                <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                  {abortedNotice}
                </p>
              )}

              {phase === 'done' && (
                <BatchEnrollmentResult summary={summary} abortedNotice={abortedNotice} />
              )}

              {phase === 'review' && !singleMode && (
                <BatchEnrollmentReviewSummary summary={summary} onToggleAllReady={toggleAllReady} />
              )}

              <BatchEnrollmentItemList
                items={items}
                phase={phase}
                singleMode={singleMode}
                onToggleItem={toggleItem}
              />

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap gap-2">
                  {phase === 'review' && (
                    <Button variant="ghost" onClick={() => backToInput()}>
                      <PencilLine aria-hidden="true" className="size-4" />
                      Alterar lista
                    </Button>
                  )}
                  {phase === 'review' && pendingPreviewCount > 0 && (
                    <Button variant="secondary" onClick={() => void retryPreview()}>
                      <RefreshCw aria-hidden="true" className="size-4" />
                      {queuedCount > 0 && summary.previewErrorCount === 0
                        ? `Continuar conferência (${queuedCount})`
                        : queuedCount > 0
                          ? `Conferir pendentes (${pendingPreviewCount})`
                          : `Reconsultar falhas (${summary.previewErrorCount})`}
                    </Button>
                  )}
                  {phase === 'done' && summary.problemEmails.length > 0 && (
                    <>
                      <Button
                        variant="secondary"
                        onClick={() => backToInput(summary.problemEmails.join('\n'))}
                      >
                        <PencilLine aria-hidden="true" className="size-4" />
                        Editar e-mails com erro
                      </Button>
                      <Button variant="ghost" onClick={() => void copyProblemEmails()}>
                        <Copy aria-hidden="true" className="size-4" />
                        {state.copiedProblems ? 'Copiados!' : 'Copiar com erro'}
                      </Button>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  {busy && (
                    <Button variant="secondary" onClick={stopCurrentRun}>
                      Interromper
                    </Button>
                  )}

                  {phase === 'review' && (
                    <>
                      <Button variant="secondary" onClick={closeEditor}>
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={summary.selectedCount === 0}>
                        {singleMode
                          ? 'Confirmar inclusão'
                          : summary.selectedCount > 0
                            ? `Confirmar inclusão (${summary.selectedCount})`
                            : 'Confirmar inclusão'}
                      </Button>
                    </>
                  )}

                  {phase === 'done' && (
                    <>
                      {summary.selectedCount > 0 && (
                        <Button variant="secondary" onClick={() => void executeConfirm('selected')}>
                          <RefreshCw aria-hidden="true" className="size-4" />
                          Continuar inclusão ({summary.selectedCount})
                        </Button>
                      )}
                      {summary.errorCount > 0 && (
                        <Button
                          variant="secondary"
                          onClick={() => void executeConfirm('retry-failed')}
                        >
                          <RefreshCw aria-hidden="true" className="size-4" />
                          Tentar falhas novamente ({summary.errorCount})
                        </Button>
                      )}
                      <Button onClick={finishAndClose}>Concluir</Button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </form>
      )}
    </Dialog>
  );
}

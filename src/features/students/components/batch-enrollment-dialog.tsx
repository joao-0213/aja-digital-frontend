'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Copy, Loader2, PencilLine, RefreshCw, XCircle } from 'lucide-react';
import { useApp, useSession } from '@/providers/app-context';
import { Badge, Button, Check, Dialog, ProgressBar, Textarea } from '@/components/ui';
import { ConfirmAlert } from '@/components/shared/confirm-alert';
import { countLabel, percent } from '@/lib/utils';
import { useStudentsApi } from '../hooks/use-students';
import {
  createBatchItems,
  describePreviewOutcome,
  parseBatchEmails,
  runBatchConfirm,
  runBatchPreview,
  summarizeBatch,
  type BatchEnrollmentItem,
  type BatchProgress
} from '../lib/enrollment-batch';

type Phase = 'input' | 'checking' | 'review' | 'submitting' | 'done';

interface SavedDraft {
  fields?: { email?: string };
  rawEmails?: string;
}

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
  const { client, sessionKey } = useSession();
  const { notify } = useApp();
  const api = useStudentsApi();

  const [rawEmails, setRawEmails] = useState(() => {
    const draft = client.readDraft<SavedDraft>('students-fields');
    return draft?.rawEmails ?? draft?.fields?.email ?? '';
  });
  const [phase, setPhase] = useState<Phase>('input');
  const [items, setItems] = useState<BatchEnrollmentItem[]>([]);
  const [progress, setProgress] = useState<BatchProgress>({ completed: 0, total: 0 });
  const [inputError, setInputError] = useState('');
  const [abortedNotice, setAbortedNotice] = useState('');
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [copiedProblems, setCopiedProblems] = useState(false);

  const keysRef = useRef<Map<string, string>>(new Map());
  const runIdRef = useRef(0);
  const abortedRef = useRef(false);
  const mountedRef = useRef(true);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortedRef.current = true;
      runIdRef.current++;
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const parsed = useMemo(() => parseBatchEmails(rawEmails), [rawEmails]);
  const summary = useMemo(() => summarizeBatch(items), [items]);
  const busy = phase === 'checking' || phase === 'submitting';
  const singleMode = items.length === 1;
  const hasUnsavedWork = phase === 'input' ? rawEmails.trim() !== '' : phase === 'review';

  useEffect(() => {
    client.saveDraft('students-fields', { rawEmails, fields: { email: rawEmails } }, sessionKey);
  }, [client, rawEmails, sessionKey]);

  useEffect(() => {
    if (!hasUnsavedWork && !busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedWork, busy]);

  const clearDraft = () => client.clearDraft('students-fields', sessionKey);

  const closeEditor = () => {
    if (busy) return;
    if (confirmingClose) {
      setConfirmingClose(false);
      return;
    }
    if (!hasUnsavedWork) {
      clearDraft();
      close();
      return;
    }
    setConfirmingClose(true);
  };

  const stopCurrentRun = () => {
    abortedRef.current = true;
  };

  const executePreview = async (
    baseItems: BatchEnrollmentItem[],
    onlyStatuses?: BatchEnrollmentItem['status'][]
  ) => {
    const runId = ++runIdRef.current;
    abortedRef.current = false;
    setAbortedNotice('');
    setInputError('');
    setPhase('checking');

    const targetCount = baseItems.filter((item) =>
      (onlyStatuses ?? ['queued', 'preview-error']).includes(item.status)
    ).length;
    setProgress({ completed: 0, total: targetCount });

    const result = await runBatchPreview(baseItems, (email) => api.preview(classId, email), {
      onlyStatuses,
      isAborted: () => abortedRef.current || !mountedRef.current || runIdRef.current !== runId,
      onUpdate: (nextItems, nextProgress) => {
        if (!mountedRef.current || runIdRef.current !== runId) return;
        setItems(nextItems);
        setProgress(nextProgress);
      }
    });

    if (!mountedRef.current || runIdRef.current !== runId) return;
    setItems(result.items);
    setProgress({ completed: result.completed, total: result.total });
    if (result.aborted) {
      setAbortedNotice('Conferência interrompida. Os itens já conferidos foram mantidos.');
    }
    setPhase('review');
  };

  const startPreview = async () => {
    if (busy) return;
    if (!parsed.totalTokens) {
      setInputError('Informe ao menos um e-mail para conferir.');
      return;
    }
    if (!parsed.valid.length) {
      setInputError(
        'Nenhum e-mail com formato válido foi encontrado. Corrija os endereços antes de continuar.'
      );
      return;
    }

    // Preserve the dialog's initial intent key for the first single-email submission,
    // and assign distinct stable UUID keys for all additional emails.
    if (parsed.valid.length === 1 && keysRef.current.size === 0) {
      keysRef.current.set(parsed.valid[0], initialIntent);
    }

    const nextItems = createBatchItems(parsed, keysRef.current);
    for (const item of nextItems) keysRef.current.set(item.email, item.idempotencyKey);
    setItems(nextItems);
    await executePreview(nextItems);
  };

  const executeConfirm = async (mode: 'selected' | 'retry-failed') => {
    if (busy) return;
    const targetCount = items.filter((item) =>
      mode === 'retry-failed' ? item.status === 'error' : item.status === 'ready' && item.selected
    ).length;
    if (!targetCount) return;

    const runId = ++runIdRef.current;
    abortedRef.current = false;
    setAbortedNotice('');
    setPhase('submitting');
    setProgress({ completed: 0, total: targetCount });

    const result = await runBatchConfirm(items, (email, key) => api.add(classId, email, key), {
      mode,
      isAborted: () => abortedRef.current || !mountedRef.current || runIdRef.current !== runId,
      onUpdate: (nextItems, nextProgress) => {
        if (!mountedRef.current || runIdRef.current !== runId) return;
        setItems(nextItems);
        setProgress(nextProgress);
      }
    });

    if (!mountedRef.current || runIdRef.current !== runId) return;
    setItems(result.items);
    setProgress({ completed: result.completed, total: result.total });

    const finalSummary = summarizeBatch(result.items);

    // Preserve exact original UX for the 1-email happy path without double-invalidating queries.
    if (result.items.length === 1 && finalSummary.successCount === 1 && !result.aborted) {
      clearDraft();
      notify('Situação da matrícula registrada. Confira o vínculo na lista.');
      saved();
      return;
    }

    if (result.succeeded > 0) onRefresh();

    if (result.aborted) {
      setAbortedNotice(
        'Processamento interrompido. Os alunos já incluídos permanecem registrados.'
      );
    }

    if (result.succeeded > 0 && finalSummary.errorCount === 0 && !result.aborted) {
      clearDraft();
      notify(
        `${countLabel(finalSummary.successCount, 'matrícula registrada', 'matrículas registradas')}. Confira os vínculos na lista.`
      );
    } else if (result.succeeded > 0 && finalSummary.errorCount > 0) {
      notify(
        `${countLabel(result.succeeded, 'inclusão registrada', 'inclusões registradas')} e ${countLabel(finalSummary.errorCount, 'falha', 'falhas')}. Confira os detalhes na janela.`
      );
    } else if (result.succeeded > 0) {
      notify(
        `${countLabel(result.succeeded, 'inclusão registrada', 'inclusões registradas')} antes da interrupção. Confira os detalhes na janela.`
      );
    }

    setPhase('done');
  };

  const toggleItem = (email: string, checked: boolean) => {
    setItems((current) =>
      current.map((item) =>
        item.email === email && item.status === 'ready' ? { ...item, selected: checked } : item
      )
    );
  };

  const toggleAllReady = (checked: boolean) => {
    setItems((current) =>
      current.map((item) => (item.status === 'ready' ? { ...item, selected: checked } : item))
    );
  };

  const backToInput = (nextRaw?: string) => {
    if (busy) return;
    if (typeof nextRaw === 'string') setRawEmails(nextRaw);
    setItems([]);
    setInputError('');
    setAbortedNotice('');
    setPhase('input');
  };

  const copyProblemEmails = async () => {
    if (!summary.problemEmails.length || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(summary.problemEmails.join('\n'));
      setCopiedProblems(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopiedProblems(false), 2500);
    } catch {
      notify('Não foi possível copiar para a área de transferência.');
    }
  };

  const progressPercent = percent(progress.completed, progress.total);
  const queuedCount = useMemo(
    () => items.filter((item) => item.status === 'queued').length,
    [items]
  );
  const pendingPreviewCount = summary.previewErrorCount + queuedCount;
  const allReadySelected = summary.readyCount > 0 && summary.selectedCount === summary.readyCount;
  const showBatchSelectionControls =
    phase === 'review' && items.length > 1 && summary.readyCount > 0;

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
          onCancel={() => setConfirmingClose(false)}
          onConfirm={() => {
            clearDraft();
            close();
          }}
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
                  onChange={(event) => {
                    setRawEmails(event.target.value);
                    setInputError('');
                  }}
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
                        onClick={() => {
                          setRawEmails(parsed.valid.join('\n'));
                          setInputError('');
                        }}
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

          {(phase === 'checking' ||
            phase === 'review' ||
            phase === 'submitting' ||
            phase === 'done') && (
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
                <div
                  role="status"
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2"
                >
                  <p className="text-sm font-semibold text-slate-900">
                    {summary.errorCount === 0 && summary.successCount > 0 && !abortedNotice
                      ? `Inclusão concluída: ${countLabel(summary.successCount, 'aluno registrado', 'alunos registrados')}.`
                      : summary.successCount > 0 && summary.errorCount > 0
                        ? `Processamento concluído com falhas parciais: ${countLabel(summary.successCount, 'incluído', 'incluídos')} e ${countLabel(summary.errorCount, 'falha', 'falhas')}.`
                        : summary.successCount > 0
                          ? `Processamento interrompido: ${countLabel(summary.successCount, 'aluno registrado', 'alunos registrados')}.`
                          : summary.errorCount > 0
                            ? `Nenhuma inclusão foi concluída (${countLabel(summary.errorCount, 'falha', 'falhas')}).`
                            : 'Processamento interrompido antes de registrar inclusões.'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {summary.activeCount > 0 && (
                      <Badge tone="green">{summary.activeCount} vinculado(s)</Badge>
                    )}
                    {summary.pendingCount > 0 && (
                      <Badge tone="purple">{summary.pendingCount} pendente(s)</Badge>
                    )}
                    {summary.errorCount > 0 && (
                      <Badge tone="red">{summary.errorCount} falha(s)</Badge>
                    )}
                    {summary.blockedCount > 0 && (
                      <Badge tone="amber">{summary.blockedCount} impedido(s)</Badge>
                    )}
                    {summary.invalidCount > 0 && (
                      <Badge tone="neutral">{summary.invalidCount} inválido(s)</Badge>
                    )}
                  </div>
                </div>
              )}

              {phase === 'review' && !singleMode && (
                <div
                  role="status"
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {summary.readyCount > 0 && (
                      <Badge tone="green">{summary.readyCount} apto(s)</Badge>
                    )}
                    {summary.blockedCount > 0 && (
                      <Badge tone="amber">{summary.blockedCount} impedido(s)</Badge>
                    )}
                    {summary.previewErrorCount > 0 && (
                      <Badge tone="red">{summary.previewErrorCount} erro(s) na conferência</Badge>
                    )}
                    {summary.invalidCount > 0 && (
                      <Badge tone="neutral">{summary.invalidCount} inválido(s)</Badge>
                    )}
                  </div>
                  {showBatchSelectionControls && (
                    <div className="flex items-center gap-2">
                      <Check
                        label={`Selecionar todos (${summary.selectedCount}/${summary.readyCount})`}
                        checked={allReadySelected}
                        onChange={toggleAllReady}
                      />
                    </div>
                  )}
                </div>
              )}

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
                          onChange={(event) => toggleItem(item.email, event.target.checked)}
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
                              <p className="text-slate-600">
                                {item.preview.account.name} · Conta existente
                              </p>
                            )}
                            <p>{item.preview?.message ?? item.error}</p>
                            {item.preview?.otherClass && (
                              <p className="text-slate-600">
                                Há vínculo em {item.preview.otherClass.name}. Regularize o destino;
                                não há transferência automática.
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

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap gap-2">
                  {phase === 'review' && (
                    <Button variant="ghost" onClick={() => backToInput()}>
                      <PencilLine aria-hidden="true" className="size-4" />
                      Alterar lista
                    </Button>
                  )}
                  {phase === 'review' && pendingPreviewCount > 0 && (
                    <Button variant="secondary" onClick={() => void executePreview(items)}>
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
                        {copiedProblems ? 'Copiados!' : 'Copiar com erro'}
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
                      <Button
                        onClick={() => {
                          clearDraft();
                          close();
                        }}
                      >
                        Concluir
                      </Button>
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

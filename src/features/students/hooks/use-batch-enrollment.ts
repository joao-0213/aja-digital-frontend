'use client';

import { useEffect, useMemo, useReducer, useRef } from 'react';
import { useApp, useSession } from '@/providers/app-context';
import { countLabel } from '@/lib/utils';
import {
  createBatchItems,
  parseBatchEmails,
  runBatchConfirm,
  runBatchPreview,
  summarizeBatch,
  type BatchEnrollmentItem
} from '../lib/enrollment-batch';
import { useStudentsApi } from './use-students';
import {
  batchEnrollmentReducer,
  countPendingPreview,
  createInitialBatchEnrollmentState,
  hasBatchUnsavedWork,
  isBatchBusy
} from './batch-enrollment-state';

interface SavedDraft {
  fields?: { email?: string };
  rawEmails?: string;
}

/** Coordinates batch enrollment phases, bounded preview concurrency, sequential confirm, and drafts. */
export function useBatchEnrollment({
  classId,
  initialIntent,
  close,
  saved,
  onRefresh
}: {
  classId: string;
  initialIntent: string;
  close: () => void;
  saved: () => void;
  onRefresh: () => void;
}) {
  const { client, sessionKey } = useSession();
  const { notify } = useApp();
  const api = useStudentsApi();

  const [state, dispatch] = useReducer(batchEnrollmentReducer, undefined, () => {
    const draft = client.readDraft<SavedDraft>('students-fields');
    return createInitialBatchEnrollmentState(draft?.rawEmails ?? draft?.fields?.email ?? '');
  });

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

  const parsed = useMemo(() => parseBatchEmails(state.rawEmails), [state.rawEmails]);
  const summary = useMemo(() => summarizeBatch(state.items), [state.items]);
  const busy = isBatchBusy(state.phase);
  const hasUnsavedWork = hasBatchUnsavedWork(state);
  const { queuedCount, pendingPreviewCount } = useMemo(
    () => countPendingPreview(state.items, summary),
    [state.items, summary]
  );

  useEffect(() => {
    client.saveDraft(
      'students-fields',
      { rawEmails: state.rawEmails, fields: { email: state.rawEmails } },
      sessionKey
    );
  }, [client, state.rawEmails, sessionKey]);

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
    if (state.confirmingClose) {
      dispatch({ type: 'CANCEL_CLOSE' });
      return;
    }
    if (!hasUnsavedWork) {
      clearDraft();
      close();
      return;
    }
    dispatch({ type: 'REQUEST_CLOSE' });
  };

  const confirmDiscard = () => {
    clearDraft();
    close();
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

    const targetCount = baseItems.filter((item) =>
      (onlyStatuses ?? ['queued', 'preview-error']).includes(item.status)
    ).length;
    dispatch({ type: 'START_PREVIEW', items: baseItems, total: targetCount });

    const result = await runBatchPreview(baseItems, (email) => api.preview(classId, email), {
      onlyStatuses,
      isAborted: () => abortedRef.current || !mountedRef.current || runIdRef.current !== runId,
      onUpdate: (nextItems, nextProgress) => {
        if (!mountedRef.current || runIdRef.current !== runId) return;
        dispatch({ type: 'UPDATE_PROGRESS', items: nextItems, progress: nextProgress });
      }
    });

    if (!mountedRef.current || runIdRef.current !== runId) return;
    dispatch({
      type: 'FINISH_PREVIEW',
      items: result.items,
      completed: result.completed,
      total: result.total,
      aborted: result.aborted
    });
  };

  const startPreview = async () => {
    if (busy) return;
    if (!parsed.totalTokens) {
      dispatch({ type: 'SET_INPUT_ERROR', message: 'Informe ao menos um e-mail para conferir.' });
      return;
    }
    if (!parsed.valid.length) {
      dispatch({
        type: 'SET_INPUT_ERROR',
        message:
          'Nenhum e-mail com formato válido foi encontrado. Corrija os endereços antes de continuar.'
      });
      return;
    }

    // Preserve the dialog's initial intent key for the first single-email submission,
    // and assign distinct stable UUID keys for all additional emails.
    if (parsed.valid.length === 1 && keysRef.current.size === 0) {
      keysRef.current.set(parsed.valid[0], initialIntent);
    }

    const nextItems = createBatchItems(parsed, keysRef.current);
    for (const item of nextItems) keysRef.current.set(item.email, item.idempotencyKey);
    await executePreview(nextItems);
  };

  const executeConfirm = async (mode: 'selected' | 'retry-failed') => {
    if (busy) return;
    const targetCount = state.items.filter((item) =>
      mode === 'retry-failed' ? item.status === 'error' : item.status === 'ready' && item.selected
    ).length;
    if (!targetCount) return;

    const runId = ++runIdRef.current;
    abortedRef.current = false;
    dispatch({ type: 'START_CONFIRM', total: targetCount });

    const result = await runBatchConfirm(
      state.items,
      (email, key) => api.add(classId, email, key),
      {
        mode,
        isAborted: () => abortedRef.current || !mountedRef.current || runIdRef.current !== runId,
        onUpdate: (nextItems, nextProgress) => {
          if (!mountedRef.current || runIdRef.current !== runId) return;
          dispatch({ type: 'UPDATE_PROGRESS', items: nextItems, progress: nextProgress });
        }
      }
    );

    if (!mountedRef.current || runIdRef.current !== runId) return;
    const finalSummary = summarizeBatch(result.items);

    // Preserve exact original UX for the 1-email happy path without double-invalidating queries.
    if (result.items.length === 1 && finalSummary.successCount === 1 && !result.aborted) {
      clearDraft();
      notify('Situação da matrícula registrada. Confira o vínculo na lista.');
      saved();
      return;
    }

    if (result.succeeded > 0) onRefresh();

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

    dispatch({
      type: 'FINISH_CONFIRM',
      items: result.items,
      completed: result.completed,
      total: result.total,
      aborted: result.aborted
    });
  };

  const copyProblemEmails = async () => {
    if (!summary.problemEmails.length || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(summary.problemEmails.join('\n'));
      dispatch({ type: 'SET_COPIED_PROBLEMS', copied: true });
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(
        () => dispatch({ type: 'SET_COPIED_PROBLEMS', copied: false }),
        2500
      );
    } catch {
      notify('Não foi possível copiar para a área de transferência.');
    }
  };

  return {
    state,
    parsed,
    summary,
    busy,
    queuedCount,
    pendingPreviewCount,
    setRawEmails: (rawEmails: string) => dispatch({ type: 'SET_RAW_EMAILS', rawEmails }),
    removeInvalidEmails: () => dispatch({ type: 'REMOVE_INVALID_EMAILS' }),
    toggleItem: (email: string, checked: boolean) =>
      dispatch({ type: 'TOGGLE_ITEM', email, checked }),
    toggleAllReady: (checked: boolean) => dispatch({ type: 'TOGGLE_ALL_READY', checked }),
    backToInput: (rawEmails?: string) => dispatch({ type: 'BACK_TO_INPUT', rawEmails }),
    cancelClose: () => dispatch({ type: 'CANCEL_CLOSE' }),
    closeEditor,
    confirmDiscard,
    finishAndClose: confirmDiscard,
    stopCurrentRun,
    startPreview,
    retryPreview: () => executePreview(state.items),
    executeConfirm,
    copyProblemEmails
  };
}

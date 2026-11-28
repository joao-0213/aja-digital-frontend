'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toErrorMessage } from '@/lib/errors';
import { HttpError } from '@/lib/http-client';
import {
  readSessionText,
  removeSessionDraft,
  writeSessionDraft,
  writeSessionText
} from '@/lib/session-draft-storage';
import { useSession } from '@/providers/app-context';
import { isStudentAttempt, type AttemptStudent } from '../api';
import {
  attemptRecoveryOwnerFor,
  attemptRecoveryPointerKey,
  attemptRecoveryStorageKey,
  resolveAttemptRecovery,
  shouldLockAttemptInputs,
  type AttemptRecoveryIdentity,
  type AttemptRecoveryOwner
} from '../lib/attempt-recovery';
import { createAttemptSubmitCommand } from '../lib/attempt-submit-command';
import {
  completeQuizAnswers,
  countQuizAnswered,
  hasAttemptSnapshotChanged,
  resolveQuizRecoveryNotice,
  shouldScheduleQuizAutosave,
  type QuizAnswers,
  type QuizSaveStatus
} from './quiz-session-state';
import { useAssessmentsApi } from './use-assessments';

function currentSession(client: ReturnType<typeof useSession>['client'], key: string) {
  const session = client.getSnapshot();
  return session.status === 'authenticated' && session.sessionKey === key;
}

export function useQuizSession({ initialAttempt }: { initialAttempt: AttemptStudent }) {
  const { client, sessionKey, sessionId, status } = useSession();
  const api = useAssessmentsApi();
  const router = useRouter();

  const [initial] = useState(() => {
    const userId = client.getSnapshot().user?.id ?? '';
    const identity: AttemptRecoveryIdentity = {
      userId,
      sessionId: sessionId ?? '',
      attemptId: initialAttempt.id
    };
    const owner = attemptRecoveryOwnerFor(initialAttempt, identity);
    const fresh = resolveAttemptRecovery(initialAttempt, identity, null);
    if (typeof window === 'undefined' || !identity.userId || !identity.sessionId)
      return { ...fresh, restored: false };
    try {
      const pointerKey = attemptRecoveryPointerKey(identity);
      const storedOpenRevision = Number(readSessionText(pointerKey) ?? '');
      const openedRevision =
        Number.isSafeInteger(storedOpenRevision) && storedOpenRevision > 0
          ? storedOpenRevision
          : owner.openedRevision;
      const storedOwner = attemptRecoveryOwnerFor(initialAttempt, identity, openedRevision);
      const stored = readSessionText(attemptRecoveryStorageKey(storedOwner));
      const resolved = resolveAttemptRecovery(initialAttempt, identity, stored);
      return {
        ...resolved,
        restored:
          resolved.status === 'restored' &&
          JSON.stringify(resolved.answers) !== JSON.stringify(initialAttempt.answers)
      };
    } catch {
      return { ...fresh, restored: false };
    }
  });

  const [attempt, setAttempt] = useState(initialAttempt);
  const [recoveryOwner, setRecoveryOwner] = useState<AttemptRecoveryOwner>(initial.owner);
  const [recoveryNotice] = useState(() => resolveQuizRecoveryNotice(initial.status));
  const [answers, setAnswers] = useState<QuizAnswers>(initial.answers);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const [dirty, setDirty] = useState(initial.restored);
  const [index, setIndex] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [reloadPrompt, setReloadPrompt] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<QuizSaveStatus>('saved');
  const [saveError, setSaveError] = useState('');
  const [conflict, setConflict] = useState<AttemptStudent | null>(null);
  const [submitBusy, setSubmitBusy] = useState(false);
  const submitBusyRef = useRef(false);
  const [submitError, setSubmitError] = useState('');
  const [submissionNeedsReview, setSubmissionNeedsReview] = useState(false);

  const revisionRef = useRef(initialAttempt.revision);
  const answerVersion = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const submitCommand = useRef(createAttemptSubmitCommand());
  const finalizedReceipt = useRef(false);
  const saveCallbackRef = useRef<(value: QuizAnswers, version: number) => Promise<AttemptStudent>>(
    async () => initialAttempt
  );

  const recoveryIdentity = useMemo(
    () => ({
      userId: client.getSnapshot().user?.id ?? '',
      sessionId: sessionId ?? '',
      attemptId: attempt.id
    }),
    [attempt.id, client, sessionId]
  );
  const recoveryPointer = useMemo(
    () => attemptRecoveryPointerKey(recoveryIdentity),
    [recoveryIdentity]
  );
  const key = useMemo(() => attemptRecoveryStorageKey(recoveryOwner), [recoveryOwner]);

  const answeredCount = countQuizAnswered(answers);
  const questionId = attempt.questionOrder[index];
  const question = attempt.questions.find((item) => item.id === questionId);
  const hasFrozenIntent = !!submitCommand.current.current();
  const lockInputs = shouldLockAttemptInputs({
    authenticated: status === 'authenticated',
    submitBusy,
    hasFrozenIntent
  });

  const saveAnswers = useCallback(
    (value: QuizAnswers, version: number) => {
      const snapshot = structuredClone(value);
      const task = saveQueue.current
        .catch(() => undefined)
        .then(async () => {
          if (!currentSession(client, sessionKey))
            throw new HttpError('cancelled', 'A sessão mudou durante o salvamento.');
          setSaveStatus('saving');
          setSaveError('');
          try {
            const saved = await api.saveAttemptAnswers(
              attempt.id,
              revisionRef.current,
              snapshot,
              sessionKey
            );
            if (!currentSession(client, sessionKey))
              throw new HttpError('cancelled', 'A sessão mudou durante o salvamento.');
            revisionRef.current = saved.revision;
            setAttempt(saved);
            setConflict(null);
            if (answerVersion.current === version) {
              setDirty(false);
              setSaveStatus('saved');
            }
            return saved;
          } catch (cause: unknown) {
            if (
              cause instanceof HttpError &&
              cause.kind === 'conflict' &&
              currentSession(client, sessionKey)
            ) {
              try {
                const latest = await api.readAttempt(attempt.id, undefined, sessionKey);
                if (currentSession(client, sessionKey) && isStudentAttempt(latest)) {
                  setConflict(latest);
                  setSaveStatus('conflict');
                  setSaveError(
                    'Outra aba ou uma atualização da atividade alterou esta tentativa. Suas respostas locais foram mantidas.'
                  );
                }
              } catch (readCause: unknown) {
                if (currentSession(client, sessionKey)) {
                  setSaveStatus('error');
                  setSaveError(
                    toErrorMessage(readCause, 'Não foi possível consultar a versão salva.')
                  );
                }
              }
            } else if (
              !(cause instanceof HttpError && cause.kind === 'cancelled') &&
              currentSession(client, sessionKey)
            ) {
              setSaveStatus('error');
              setSaveError(toErrorMessage(cause, 'Não foi possível salvar as respostas.'));
            }
            throw cause;
          }
        });
      saveQueue.current = task;
      return task;
    },
    [api, attempt.id, client, sessionKey]
  );
  saveCallbackRef.current = saveAnswers;

  useEffect(() => {
    const sessionUser = client.getSnapshot().user;
    if (!sessionUser || !sessionId) return;
    writeSessionText(recoveryPointer, String(recoveryOwner.openedRevision));
    writeSessionDraft(key, {
      owner: recoveryOwner,
      serverRevision: attempt.revision,
      questionOrder: attempt.questionOrder,
      answers
    });
    if (
      !shouldScheduleQuizAutosave({
        dirty,
        hasConflict: !!conflict,
        submitBusy,
        hasFrozenIntent: !!submitCommand.current.current(),
        authenticated: status === 'authenticated'
      })
    )
      return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const version = answerVersion.current;
    saveTimer.current = setTimeout(() => {
      void saveCallbackRef.current(answersRef.current, version).catch(() => undefined);
    }, 350);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [
    answers,
    attempt,
    client,
    conflict,
    dirty,
    key,
    recoveryOwner,
    recoveryPointer,
    sessionId,
    status,
    submitBusy
  ]);

  const editAnswer = (id: string, value: number | null) => {
    if (lockInputs || conflict) return;
    answerVersion.current++;
    setAnswers((previous) => ({ ...previous, [id]: value }));
    setDirty(true);
  };

  const retrySave = async () => {
    if (saveStatus === 'saving' || submitBusy) return;
    try {
      await saveAnswers(answersRef.current, answerVersion.current);
    } catch {
      /* The local map and recovery key stay available for another explicit retry. */
    }
  };

  const applyLocalAfterReview = async () => {
    if (!conflict) return;
    if (hasAttemptSnapshotChanged(attempt, conflict)) {
      setReloadPrompt(
        'As questões desta tentativa mudaram. As respostas locais antigas serão preservadas na chave anterior e não serão aplicadas à nova ordem. Recarregar a revisão atual?'
      );
      return;
    }
    submitCommand.current.acknowledgeRevisionConflict(conflict.revision);
    revisionRef.current = conflict.revision;
    setRecoveryOwner(attemptRecoveryOwnerFor(conflict, recoveryIdentity, conflict.revision));
    setAttempt(conflict);
    setConflict(null);
    setDirty(true);
    try {
      await saveAnswers(answersRef.current, answerVersion.current);
    } catch {
      /* A new concurrent edit will display another conflict and require review again. */
    }
  };

  const discardLocalAfterReview = () => {
    if (!conflict) return;
    if (hasAttemptSnapshotChanged(attempt, conflict)) {
      setReloadPrompt(
        'A atividade foi atualizada. Recarregar para abrir a nova ordem? As respostas locais incompatíveis não serão aplicadas.'
      );
      return;
    }
    submitCommand.current.acknowledgeRevisionConflict(conflict.revision);
    revisionRef.current = conflict.revision;
    setRecoveryOwner(attemptRecoveryOwnerFor(conflict, recoveryIdentity, conflict.revision));
    setAttempt(conflict);
    setAnswers(structuredClone(conflict.answers));
    answerVersion.current++;
    setDirty(false);
    setConflict(null);
    setSaveStatus('saved');
    setSaveError('');
  };

  const inspectSubmissionState = async () => {
    if (!currentSession(client, sessionKey)) return;
    const latest = await api.readAttempt(attempt.id, undefined, sessionKey);
    if (!currentSession(client, sessionKey)) return;
    if (!isStudentAttempt(latest))
      throw new Error('A resposta atual da tentativa não está disponível.');
    const currentAttempt = latest;
    if (currentAttempt.submittedAt) {
      await api.readAttemptResult(attempt.id, undefined, sessionKey);
      if (!currentSession(client, sessionKey)) return;
      finalizedReceipt.current = true;
      removeSessionDraft(key);
      removeSessionDraft(recoveryPointer);
      router.push(`/questionarios/resultado?id=${encodeURIComponent(attempt.id)}`);
      return;
    }
    setSubmitError('');
    setSubmissionNeedsReview(false);
    setConflict(currentAttempt);
    setSaveStatus('conflict');
    setSaveError(
      'Outra aba atualizou esta tentativa. Confira as respostas mais recentes antes de criar um novo envio; suas respostas locais continuam preservadas.'
    );
  };

  const retrySubmissionReview = async () => {
    if (submitBusyRef.current || !submissionNeedsReview || status !== 'authenticated') return;
    submitBusyRef.current = true;
    setSubmitBusy(true);
    setSubmitError('');
    try {
      await inspectSubmissionState();
    } catch (cause: unknown) {
      if (currentSession(client, sessionKey))
        setSubmitError(
          toErrorMessage(cause, 'Não foi possível consultar o estado atual da tentativa.')
        );
    } finally {
      submitBusyRef.current = false;
      if (currentSession(client, sessionKey)) setSubmitBusy(false);
    }
  };

  const submit = async () => {
    if (submitBusyRef.current || finalizedReceipt.current || conflict || status !== 'authenticated')
      return;
    submitBusyRef.current = true;
    setSubmitBusy(true);
    setSubmitError('');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      await submitCommand.current.submit(
        async () => {
          const saved = await saveAnswers(
            completeQuizAnswers(attempt.questionOrder, answersRef.current),
            answerVersion.current
          );
          if (!currentSession(client, sessionKey))
            throw new HttpError('cancelled', 'A sessão mudou antes do envio.');
          return saved.revision;
        },
        (frozen) => api.submitAttempt(attempt.id, frozen.revision, frozen.key, sessionKey)
      );
      if (!currentSession(client, sessionKey)) return;
      finalizedReceipt.current = true;
      removeSessionDraft(key);
      removeSessionDraft(recoveryPointer);
      router.push(`/questionarios/resultado?id=${encodeURIComponent(attempt.id)}`);
    } catch (cause: unknown) {
      if (
        currentSession(client, sessionKey) &&
        cause instanceof HttpError &&
        cause.code === 'REVISION_CONFLICT'
      ) {
        setSubmissionNeedsReview(true);
        setSubmitError(
          'A tentativa foi alterada em outra sessão. Confira o estado mais recente antes de criar um novo envio.'
        );
        try {
          await inspectSubmissionState();
        } catch (readCause: unknown) {
          if (currentSession(client, sessionKey))
            setSubmitError(
              toErrorMessage(readCause, 'Não foi possível consultar o estado atual da tentativa.')
            );
        }
        return;
      }
      if (currentSession(client, sessionKey))
        setSubmitError(
          toErrorMessage(
            cause,
            'Não foi possível confirmar o envio. Suas respostas foram preservadas.'
          )
        );
    } finally {
      submitBusyRef.current = false;
      if (currentSession(client, sessionKey)) setSubmitBusy(false);
    }
  };

  const snapshotChanged = !!conflict && hasAttemptSnapshotChanged(attempt, conflict);

  return {
    attempt,
    recoveryNotice,
    answers,
    dirty,
    index,
    setIndex,
    confirm,
    setConfirm,
    reloadPrompt,
    setReloadPrompt,
    saveStatus,
    saveError,
    conflict,
    submitBusy,
    submitError,
    submissionNeedsReview,
    answeredCount,
    question,
    lockInputs,
    hasFrozenIntent,
    finalizedReceipt: finalizedReceipt.current,
    snapshotChanged,
    editAnswer,
    retrySave,
    applyLocalAfterReview,
    discardLocalAfterReview,
    retrySubmissionReview,
    submit
  };
}

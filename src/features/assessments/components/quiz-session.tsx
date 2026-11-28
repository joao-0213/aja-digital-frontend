'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Dialog,
  Empty,
  LinkButton,
  PageHeading,
  ProgressBar
} from '@/components/ui';
import { cn, countLabel, percent } from '@/lib/utils';
import {
  attemptRecoveryOwnerFor,
  attemptRecoveryPointerKey,
  attemptRecoveryStorageKey,
  resolveAttemptRecovery,
  shouldLockAttemptInputs,
  type AttemptRecoveryIdentity,
  type AttemptRecoveryOwner
} from '../lib/attempt-recovery';
import { HttpError } from '@/lib/http-client';
import { useSession } from '@/providers/app-context';
import { createAttemptSubmitCommand, type AttemptStudent } from '../api';
import { useAssessmentsApi } from '../hooks/use-assessments';
import { AttemptImage } from './attempt-image';
import { toErrorMessage } from '@/lib/errors';
import {
  readSessionText,
  removeSessionDraft,
  writeSessionDraft,
  writeSessionText
} from '@/lib/session-draft-storage';

type Answers = Record<string, number | null>;
type SaveStatus = 'saved' | 'saving' | 'error' | 'conflict';

function completeAnswers(order: string[], answers: Answers): Answers {
  return Object.fromEntries(order.map((id) => [id, answers[id] ?? null]));
}

function displayChoice(attempt: AttemptStudent, id: string, answer: number | null | undefined) {
  if (answer === null || answer === undefined) return 'Em branco';
  const question = attempt.questions.find((item) => item.id === id);
  return question?.options[answer] ?? 'Alternativa indisponível';
}

function currentSession(client: ReturnType<typeof useSession>['client'], key: string) {
  const session = client.getSnapshot();
  return session.status === 'authenticated' && session.sessionKey === key;
}

export function QuizSession({
  attempt: initialAttempt,
  title,
  deadline,
  allowLate
}: {
  attempt: AttemptStudent;
  title: string;
  deadline: string | null;
  allowLate: boolean;
}) {
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
  const [recoveryNotice] = useState(() =>
    initial.status === 'stale'
      ? 'O rascunho local pertencia a uma revisão anterior e não foi reaplicado. As respostas salvas mais recentes foram carregadas.'
      : initial.status === 'incompatible'
        ? 'O rascunho local não correspondia a esta revisão ou ordem de questões e foi descartado.'
        : ''
  );
  const [answers, setAnswers] = useState<Answers>(initial.answers);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const [dirty, setDirty] = useState(initial.restored);
  const [index, setIndex] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [reloadPrompt, setReloadPrompt] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
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
  const saveCallbackRef = useRef<(value: Answers, version: number) => Promise<AttemptStudent>>(
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
  const answeredCount = Object.values(answers).filter(
    (value) => value !== null && value !== undefined
  ).length;
  const questionId = attempt.questionOrder[index];
  const question = attempt.questions.find((item) => item.id === questionId);
  const lockInputs = shouldLockAttemptInputs({
    authenticated: status === 'authenticated',
    submitBusy,
    hasFrozenIntent: !!submitCommand.current.current()
  });

  const saveAnswers = useCallback(
    (value: Answers, version: number) => {
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
                if (currentSession(client, sessionKey) && 'questionsUpdatedAt' in latest) {
                  setConflict(latest as AttemptStudent);
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
      !dirty ||
      conflict ||
      submitBusy ||
      submitCommand.current.current() ||
      status !== 'authenticated'
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
    if (
      conflict.questionsUpdatedAt !== attempt.questionsUpdatedAt ||
      conflict.questionOrder.join('\u0000') !== attempt.questionOrder.join('\u0000')
    ) {
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
    if (
      conflict.questionsUpdatedAt !== attempt.questionsUpdatedAt ||
      conflict.questionOrder.join('\u0000') !== attempt.questionOrder.join('\u0000')
    ) {
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
    if (!('questionsUpdatedAt' in latest))
      throw new Error('A resposta atual da tentativa não está disponível.');
    const currentAttempt = latest as AttemptStudent;
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
            completeAnswers(attempt.questionOrder, answersRef.current),
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

  if (!question)
    return (
      <Empty
        title="Questão indisponível"
        description="A tentativa mantém suas respostas salvas. Consulte a equipe responsável antes de continuar."
        action={<LinkButton href="/questionarios">Voltar às atividades</LinkButton>}
      />
    );
  const remaining = attempt.questionOrder.length - answeredCount;
  const snapshotChanged =
    !!conflict &&
    (conflict.questionsUpdatedAt !== attempt.questionsUpdatedAt ||
      conflict.questionOrder.join('\u0000') !== attempt.questionOrder.join('\u0000'));
  return (
    <div className="mx-auto max-w-4xl">
      <LinkButton secondary href="/questionarios" className="mb-5">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar para atividades
      </LinkButton>
      {recoveryNotice && (
        <p role="status" className="mb-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
          {recoveryNotice}
        </p>
      )}
      <p className="mb-4 text-sm text-slate-600">
        Prazo:{' '}
        {deadline
          ? `${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(deadline))} (Brasília)`
          : 'sem prazo'}
        {deadline && ` · ${allowLate ? 'aceita atraso' : 'não aceita atraso'}`}
      </p>
      <PageHeading
        eyebrow="Questionário"
        title={title}
        action={
          <Badge tone={saveStatus === 'error' || saveStatus === 'conflict' ? 'red' : 'neutral'}>
            {saveStatus === 'saving'
              ? 'Salvando…'
              : saveStatus === 'error'
                ? 'Falha ao salvar'
                : saveStatus === 'conflict'
                  ? 'Conflito para revisar'
                  : dirty
                    ? 'Respostas locais pendentes'
                    : 'Respostas salvas'}
          </Badge>
        }
      />
      {saveError && (
        <div role="alert" className="mb-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
          {saveError}
        </div>
      )}
      {saveStatus === 'error' && (
        <Button variant="secondary" className="mb-4" onClick={() => void retrySave()}>
          Tentar salvar novamente
        </Button>
      )}
      {conflict && (
        <section
          aria-labelledby="attempt-conflict-title"
          className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
        >
          <h2 id="attempt-conflict-title" className="font-semibold">
            Confira as respostas salvas antes de continuar
          </h2>
          <p className="mt-2">
            As respostas que você estava editando continuam preservadas. A versão atual do servidor
            foi consultada na revisão {conflict.revision}:
          </p>
          <ol className="my-3 list-decimal space-y-1 pl-5">
            {conflict.questionOrder.map((id, position) => (
              <li key={id}>
                Questão {position + 1}: {displayChoice(conflict, id, conflict.answers[id])}
              </li>
            ))}
          </ol>
          {snapshotChanged ? (
            <Button variant="secondary" onClick={discardLocalAfterReview}>
              Conferi a nova revisão; recarregar questões atuais
            </Button>
          ) : (
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={discardLocalAfterReview}>
                Descartar minha edição e carregar respostas salvas
              </Button>
              <Button onClick={() => void applyLocalAfterReview()}>
                Conferi as salvas; usar minhas respostas
              </Button>
            </div>
          )}
        </section>
      )}
      <div className="mb-3 flex justify-between text-sm text-slate-500">
        <span>
          Questão {index + 1} de {attempt.questionOrder.length}
        </span>
        <span>{countLabel(answeredCount, 'respondida', 'respondidas')}</span>
      </div>
      <ProgressBar
        label="Questões respondidas"
        value={percent(answeredCount, attempt.questionOrder.length)}
      />
      <div className="my-6 flex flex-wrap gap-2" aria-label="Navegação entre questões">
        {attempt.questionOrder.map((id, position) => (
          <Button
            key={id}
            disabled={lockInputs || !!conflict}
            variant={index === position ? 'primary' : 'secondary'}
            aria-label={`Questão ${position + 1}${answers[id] !== undefined && answers[id] !== null ? ', respondida' : ', em branco'}`}
            onClick={() => setIndex(position)}
            className={cn(
              '!min-h-10 !px-3',
              index !== position &&
                answers[id] !== undefined &&
                answers[id] !== null &&
                '!border-emerald-300 !bg-emerald-50 !text-emerald-700'
            )}
          >
            {position + 1}
            {answers[id] !== undefined && answers[id] !== null && (
              <CheckCircle2 aria-hidden="true" className="size-3" />
            )}
          </Button>
        ))}
      </div>
      <Card>
        <Badge tone="purple">{question.topic}</Badge>
        <h2 className="mb-7 mt-5 whitespace-pre-wrap text-lg font-semibold leading-8 [overflow-wrap:anywhere]">
          {question.statement}
        </h2>
        {question.image && <AttemptImage image={question.image} />}
        <fieldset className="space-y-3" disabled={lockInputs || !!conflict}>
          <legend className="sr-only">Escolha uma alternativa</legend>
          {question.options.map((option, choice) => (
            <label
              key={choice}
              className={cn(
                'flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition hover:border-brand-200',
                answers[question.id] === choice
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-slate-200'
              )}
            >
              <input
                type="radio"
                name={question.id}
                checked={answers[question.id] === choice}
                onChange={() => editAnswer(question.id, choice)}
                className="mt-1 size-4 shrink-0 accent-brand-600"
              />
              <span className="min-w-0 text-base leading-6 [overflow-wrap:anywhere]">
                <strong className="mr-3 text-slate-500">{String.fromCharCode(65 + choice)}.</strong>
                {option}
              </span>
            </label>
          ))}
        </fieldset>
        <Button
          variant="ghost"
          className="mt-3"
          disabled={
            lockInputs ||
            !!conflict ||
            answers[question.id] === undefined ||
            answers[question.id] === null
          }
          onClick={() => editAnswer(question.id, null)}
        >
          Deixar em branco
        </Button>
      </Card>
      <div className="mt-6 flex flex-wrap justify-between gap-3">
        <Button
          variant="secondary"
          disabled={index === 0 || lockInputs || !!conflict}
          onClick={() => setIndex((value) => value - 1)}
        >
          Questão anterior
        </Button>
        {index < attempt.questionOrder.length - 1 ? (
          <Button
            disabled={lockInputs || !!conflict}
            onClick={() => setIndex((value) => value + 1)}
          >
            Próxima questão
          </Button>
        ) : (
          <Button disabled={!!conflict || lockInputs} onClick={() => setConfirm(true)}>
            Revisar e enviar
          </Button>
        )}
      </div>
      {submitError && (
        <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
          {submitError}
        </p>
      )}
      {submissionNeedsReview && (
        <Button
          variant="secondary"
          className="mt-4"
          loading={submitBusy}
          disabled={submitBusy}
          onClick={() => void retrySubmissionReview()}
        >
          Consultar estado atual da tentativa
        </Button>
      )}
      {submitCommand.current.current() && !finalizedReceipt.current && !submissionNeedsReview && (
        <Button className="mt-4" loading={submitBusy} onClick={() => void submit()}>
          Tentar confirmar este mesmo envio novamente
        </Button>
      )}
      <Dialog
        open={confirm}
        onClose={() => {
          if (!submitBusy) setConfirm(false);
        }}
        title="Enviar suas respostas?"
      >
        <p className="mb-5 leading-7 text-slate-600">
          Você respondeu {answeredCount} de{' '}
          {countLabel(attempt.questionOrder.length, 'questão', 'questões')}. Após o envio
          confirmado, as respostas não poderão ser alteradas.
        </p>
        {remaining > 0 && (
          <p className="mb-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
            {remaining === 1
              ? 'Há 1 questão em branco. Ela será enviada como não respondida e não receberá pontos.'
              : `Há ${remaining} questões em branco. Elas serão enviadas como não respondidas e não receberão pontos.`}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" disabled={submitBusy} onClick={() => setConfirm(false)}>
            Revisar
          </Button>
          <Button
            loading={submitBusy}
            disabled={lockInputs || !!conflict}
            onClick={() => void submit()}
          >
            {submitCommand.current.current() ? 'Confirmar o mesmo envio' : 'Confirmar envio'}
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={!!reloadPrompt}
        onClose={() => setReloadPrompt(null)}
        title="Recarregar revisão atual?"
      >
        <p className="mb-5 text-sm leading-6 text-slate-600">{reloadPrompt}</p>
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" onClick={() => setReloadPrompt(null)}>
            Cancelar
          </Button>
          <Button onClick={() => window.location.reload()}>Recarregar</Button>
        </div>
      </Dialog>
    </div>
  );
}

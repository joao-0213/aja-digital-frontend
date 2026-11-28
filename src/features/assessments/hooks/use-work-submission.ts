'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { toErrorMessage } from '@/lib/errors';
import { HttpError } from '@/lib/http-client';
import {
  readSessionDraft,
  readSessionText,
  removeSessionDraft,
  writeSessionDraft,
  writeSessionText
} from '@/lib/session-draft-storage';
import { useSession } from '@/providers/app-context';
import type {
  AssessmentRead,
  SubmissionAttachment,
  SubmissionStudent,
  WorkFileMetadata
} from '../api';
import { isStudentSubmission } from '../api';
import { resolveWorkUploadBatch, type WorkUploadIntent } from '../lib/work-upload-batch';
import { useAssessmentsApi } from './use-assessments';
import {
  isLocalWorkRecovery,
  isWorkSubmissionDirty,
  resolveInitialWorkRecovery,
  sameWorkAttachments,
  workOwnerKey,
  workRevisionStorageKey,
  type LocalWorkRecovery
} from './work-submission-state';

type SaveCommand = { key: string; attachments: SubmissionAttachment[] };
type PatchCommand = { revision: number; attachments: SubmissionAttachment[] };
const MAX_BYTES = 10 * 1024 * 1024;

async function digestFile(file: File) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
  return Array.from(hash, (value) => value.toString(16).padStart(2, '0')).join('');
}

export function useWorkSubmission({
  activity,
  initialSubmission,
  userId,
  sessionId
}: {
  activity: AssessmentRead;
  initialSubmission: SubmissionStudent | null;
  userId: string;
  sessionId: string;
}) {
  const { client, sessionKey, status } = useSession();
  const api = useAssessmentsApi();
  const ownerKey = workOwnerKey(userId, sessionId, activity.id);
  const serverRevision = initialSubmission?.revision ?? 0;

  const [recoveryBundle] = useState(() => {
    const key = readSessionText(ownerKey) || workRevisionStorageKey(ownerKey, serverRevision);
    const data = readSessionDraft<LocalWorkRecovery>(key, isLocalWorkRecovery);
    return { key, data, resolved: resolveInitialWorkRecovery(data, initialSubmission) };
  });

  const recoveryKey = useRef(recoveryBundle.key);
  const [submission, setSubmission] = useState<SubmissionStudent | null>(initialSubmission);
  const [items, setItems] = useState<SubmissionAttachment[]>(recoveryBundle.resolved.items);
  const [files, setFiles] = useState<Record<string, File>>({});
  const [uploads, setUploads] = useState<Record<string, WorkUploadIntent>>(
    recoveryBundle.resolved.uploads
  );
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [conflict, setConflict] = useState<SubmissionStudent | null>(null);
  const notice = recoveryBundle.resolved.notice;

  const uploadCommands = useRef(new Map<string, WorkUploadIntent>());
  const prepareCommand = useRef<SaveCommand | null>(null);
  const patchCommand = useRef<PatchCommand | null>(null);
  const submitIntent = useRef<{ revision: number; key: string } | null>(
    recoveryBundle.resolved.submitIntent
  );
  const submissionId = useRef<string | null>(initialSubmission?.id ?? null);
  const ambiguousPrepare = useRef(false);
  const ambiguousPatch = useRef(false);

  const isAssigned = 'assigned' in activity && activity.assigned;
  const isSubmitted = !!submission?.submittedAt;
  const isDirty = isWorkSubmissionDirty(submission, items, uploads);
  useUnsavedChanges((isDirty || !!link.trim()) && !isSubmitted);

  const current = useCallback(
    () =>
      status === 'authenticated' &&
      client.getSnapshot().status === 'authenticated' &&
      client.getSnapshot().sessionKey === sessionKey,
    [client, sessionKey, status]
  );

  const submissionRevision = submission?.revision ?? 0;
  const persistRecovery = useCallback(
    (nextItems = items, nextUploads = uploads, revision = submissionRevision) => {
      const storageKey = workRevisionStorageKey(ownerKey, revision);
      recoveryKey.current = storageKey;
      writeSessionDraft(storageKey, {
        revision,
        attachments: nextItems,
        uploads: nextUploads,
        submit: submitIntent.current
      } satisfies LocalWorkRecovery);
      writeSessionText(ownerKey, storageKey);
    },
    [items, uploads, submissionRevision, ownerKey]
  );

  useEffect(() => {
    if (!isSubmitted) persistRecovery();
  }, [isSubmitted, persistRecovery]);

  const addFiles = async (selected: File[]) => {
    setError('');
    const nextItems = [...items],
      nextFiles = { ...files },
      nextUploads = { ...uploads };
    try {
      for (const file of selected) {
        if (file.size > MAX_BYTES) throw new Error('Cada arquivo deve ter até 10 MiB.');
        const digest = await digestFile(file);
        if (!current()) return;
        const recovered = Object.entries(nextUploads).find(
          ([id, intent]) =>
            !nextFiles[id] &&
            intent.name === file.name &&
            intent.size === file.size &&
            intent.type === file.type &&
            intent.digest === digest
        );
        if (recovered) {
          nextFiles[recovered[0]] = file;
          continue;
        }
        if (nextItems.length >= 5) throw new Error('Adicione até 5 arquivos e links no total.');
        const id = `local:${crypto.randomUUID()}`;
        const key = crypto.randomUUID();
        nextItems.push({ kind: 'file', fileId: id, name: file.name });
        nextFiles[id] = file;
        nextUploads[id] = { key, name: file.name, size: file.size, type: file.type, digest };
      }
      setItems(nextItems);
      setFiles(nextFiles);
      setUploads(nextUploads);
      persistRecovery(nextItems, nextUploads);
    } catch (cause: unknown) {
      setError(toErrorMessage(cause, 'Confira os arquivos selecionados.'));
    }
  };

  const addLink = () => {
    try {
      const parsed = new URL(link.trim());
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password)
        throw new Error('Use um link HTTP ou HTTPS sem credenciais.');
      if (items.length >= 5) throw new Error('Adicione até 5 arquivos e links no total.');
      const next = [
        ...items,
        { kind: 'link' as const, name: 'Link do trabalho', url: parsed.href }
      ];
      setItems(next);
      setLink('');
      persistRecovery(next, uploads);
    } catch (cause: unknown) {
      setError(toErrorMessage(cause, 'Informe um link válido.'));
    }
  };

  const remove = (id: string) => {
    if (busy || conflict) return;
    const next = items.filter((item) =>
      item.kind === 'file' ? item.fileId !== id : item.url !== id
    );
    setItems(next);
    const nextFiles = { ...files },
      nextUploads = { ...uploads };
    delete nextFiles[id];
    delete nextUploads[id];
    setFiles(nextFiles);
    setUploads(nextUploads);
    persistRecovery(next, nextUploads);
  };

  const resolveUploads = async (snapshot: SubmissionAttachment[]) => {
    const resolved = await resolveWorkUploadBatch(
      [...snapshot],
      files,
      uploads,
      async (localId, intent, file) => {
        const confirmedDigest = await digestFile(file);
        if (confirmedDigest !== intent.digest)
          throw new Error(
            `O arquivo “${intent.name}” não corresponde ao envio que aguarda confirmação.`
          );
        if (!current())
          throw new HttpError('cancelled', 'A sessão mudou durante o envio do arquivo.');
        const body = new FormData();
        body.set('purpose', 'work');
        body.set('parentId', activity.id);
        body.set('file', file, intent.name);
        uploadCommands.current.set(localId, intent);
        let staged: WorkFileMetadata;
        try {
          staged = await api.uploadWorkFile(body, intent.key, sessionKey);
        } catch (cause: unknown) {
          if (cause instanceof HttpError && cause.kind === 'validation')
            uploadCommands.current.delete(localId);
          throw cause;
        }
        if (!current())
          throw new HttpError('cancelled', 'A sessão mudou durante o envio do arquivo.');
        return staged;
      },
      (resolvedBatch, localId) => {
        setFiles(resolvedBatch.files);
        setUploads(resolvedBatch.uploads);
        setItems(resolvedBatch.items);
        persistRecovery(resolvedBatch.items, resolvedBatch.uploads, submission?.revision ?? 0);
        uploadCommands.current.delete(localId);
      }
    );
    return resolved.items;
  };

  const inspectLatest = async (expected?: SubmissionAttachment[]) => {
    const id = submission?.id ?? submissionId.current;
    if (!id) return null;
    const latest = await api.readSubmission(id, sessionKey);
    if (!current() || !isStudentSubmission(latest)) return null;
    const student = latest;
    if (student.submittedAt) {
      submissionId.current = student.id;
      setSubmission(student);
      setConflict(null);
      submitIntent.current = null;
      return student;
    }
    if (expected && sameWorkAttachments(student.attachments, expected)) {
      submissionId.current = student.id;
      setSubmission(student);
      setConflict(null);
      ambiguousPatch.current = false;
      return student;
    }
    setConflict(student);
    return student;
  };

  const saveDraft = async (snapshot = items): Promise<SubmissionStudent | null> => {
    if (!isAssigned || isSubmitted || busy || conflict || ambiguousPatch.current || !current())
      return null;
    if (submission && !isDirty && !ambiguousPatch.current && !ambiguousPrepare.current)
      return submission;
    setBusy(true);
    setError('');
    try {
      const resolved = await resolveUploads([...snapshot]);
      let saved: SubmissionStudent;
      if (!submission) {
        if (prepareCommand.current && ambiguousPrepare.current) {
          saved = await api.prepareSubmission(
            activity.id,
            prepareCommand.current.attachments,
            prepareCommand.current.key,
            sessionKey
          );
        } else {
          const command = { key: crypto.randomUUID(), attachments: structuredClone(resolved) };
          prepareCommand.current = command;
          ambiguousPrepare.current = false;
          saved = await api.prepareSubmission(
            activity.id,
            command.attachments,
            command.key,
            sessionKey
          );
        }
        ambiguousPrepare.current = false;
      } else {
        const command =
          patchCommand.current && ambiguousPatch.current
            ? patchCommand.current
            : { revision: submission.revision, attachments: structuredClone(resolved) };
        patchCommand.current = command;
        try {
          saved = await api.updateSubmission(
            submission.id,
            command.revision,
            command.attachments,
            sessionKey
          );
        } catch (cause: unknown) {
          if (cause instanceof HttpError && cause.kind === 'conflict') {
            const latest = await inspectLatest(command.attachments);
            if (
              latest &&
              !latest.submittedAt &&
              sameWorkAttachments(latest.attachments, command.attachments)
            ) {
              patchCommand.current = null;
              setError('Rascunho confirmado na revisão atual.');
              return latest;
            }
            if (current())
              setError(
                'Outra sessão alterou o rascunho. Confira a versão atual antes de salvar novamente.'
              );
            return null;
          }
          if (cause instanceof HttpError && ['unavailable', 'timeout'].includes(cause.kind)) {
            ambiguousPatch.current = true;
          }
          throw cause;
        }
      }
      if (!current()) return null;
      submissionId.current = saved.id;
      prepareCommand.current = null;
      patchCommand.current = null;
      ambiguousPatch.current = false;
      setSubmission(saved);
      setItems(saved.attachments);
      setUploads({});
      setFiles({});
      persistRecovery(saved.attachments, {}, saved.revision);
      return saved;
    } catch (cause: unknown) {
      if (!current()) return null;
      if (
        !submission &&
        cause instanceof HttpError &&
        ['unavailable', 'timeout'].includes(cause.kind)
      ) {
        ambiguousPrepare.current = true;
      }
      setError(
        toErrorMessage(
          cause,
          'Não foi possível salvar o rascunho. Seu trabalho local foi preservado.'
        )
      );
      return null;
    } finally {
      if (current()) setBusy(false);
    }
  };

  const reviewUncertainSave = async () => {
    if (busy || !current()) return;
    setBusy(true);
    setError('');
    try {
      const latest = await inspectLatest(patchCommand.current?.attachments);
      if (!current()) return;
      if (
        latest &&
        patchCommand.current &&
        sameWorkAttachments(latest.attachments, patchCommand.current.attachments)
      ) {
        patchCommand.current = null;
        ambiguousPatch.current = false;
      }
    } catch (cause: unknown) {
      if (current()) setError(toErrorMessage(cause, 'Não foi possível consultar o rascunho.'));
    } finally {
      if (current()) setBusy(false);
    }
  };

  const acknowledgeConflict = () => {
    if (!conflict) return;
    submissionId.current = conflict.id;
    setSubmission(conflict);
    setConflict(null);
    patchCommand.current = null;
    ambiguousPatch.current = false;
    setError('');
  };

  const sendSubmit = async (frozen: { revision: number; key: string }) => {
    const id = submission?.id ?? submissionId.current;
    if (!id || busy || !current()) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.submitWork(id, frozen.revision, frozen.key, sessionKey);
      if (!current()) return;
      submissionId.current = result.id;
      setSubmission(result);
      setItems(result.attachments);
      setConfirm(false);
      setConflict(null);
      submitIntent.current = null;
      removeSessionDraft(ownerKey);
    } catch (cause: unknown) {
      if (!current()) return;
      if (cause instanceof HttpError && cause.kind === 'conflict') {
        try {
          const latest = await api.readSubmission(id, sessionKey);
          if (!current() || !isStudentSubmission(latest)) return;
          if (latest.submittedAt) {
            submissionId.current = latest.id;
            setSubmission(latest);
            setItems(latest.attachments);
            submitIntent.current = null;
          } else {
            setConflict(latest);
            setError(
              'Outra sessão alterou o rascunho. Confira a versão atual antes de criar um novo envio.'
            );
          }
        } catch (readCause: unknown) {
          if (current())
            setError(toErrorMessage(readCause, 'Não foi possível consultar o estado do envio.'));
        }
      } else {
        setError(toErrorMessage(cause, 'Não foi possível confirmar o envio.'));
      }
    } finally {
      if (current()) setBusy(false);
    }
  };

  const submit = async () => {
    if (busy || conflict || !isAssigned || isSubmitted || !current()) return;
    if (link.trim()) {
      setError('Adicione o link à lista antes de salvar ou enviar.');
      return;
    }
    if (submitIntent.current) {
      await sendSubmit(submitIntent.current);
      return;
    }
    if (!items.length) {
      setError('Adicione pelo menos um arquivo ou link antes de enviar.');
      return;
    }
    let saved = submission;
    if (isDirty) saved = await saveDraft(items);
    if (!saved || !current()) return;
    const frozen = { revision: saved.revision, key: crypto.randomUUID() };
    submitIntent.current = frozen;
    persistRecovery(saved.attachments, {}, saved.revision);
    await sendSubmit(frozen);
  };

  const retryPrepare = async () => {
    if (ambiguousPrepare.current && !busy) await saveDraft(items);
  };

  const canSubmit =
    isAssigned &&
    !isSubmitted &&
    !busy &&
    !conflict &&
    (items.length > 0 || !!submitIntent.current);
  const frozenPending =
    ambiguousPrepare.current ||
    ambiguousPatch.current ||
    !!submitIntent.current ||
    uploadCommands.current.size > 0;

  return {
    submission,
    items,
    files,
    uploads,
    link,
    setLink,
    busy,
    error,
    confirm,
    setConfirm,
    conflict,
    notice,
    isAssigned,
    isDirty,
    canSubmit,
    frozenPending,
    hasSubmitIntent: !!submitIntent.current,
    hasAmbiguousPatch: ambiguousPatch.current,
    hasAmbiguousPrepare: ambiguousPrepare.current,
    hasPendingUploads: uploadCommands.current.size > 0,
    addFiles,
    addLink,
    remove,
    saveDraft,
    reviewUncertainSave,
    acknowledgeConflict,
    submit,
    retryPrepare
  };
}

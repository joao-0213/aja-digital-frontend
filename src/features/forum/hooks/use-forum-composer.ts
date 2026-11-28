'use client';

import { useEffect, useMemo, useRef, useSyncExternalStore, type FormEvent } from 'react';
import { HttpError } from '@/lib/http-client';
import { toErrorMessage } from '@/lib/errors';
import {
  defaultSessionStorage,
  removeSessionDraft,
  type SessionStorageLike
} from '@/lib/session-draft-storage';
import {
  forumComposeDraftKeys,
  readForumComposeDraft,
  saveForumComposeDraft
} from '../lib/forum-draft';
import type { ForumAttachmentDto, ForumTopicFields } from '../api';
import { useForumApi } from './use-forum';
import type { SubjectOption } from '../components/subject-combobox';

export type LegacyForumAttachment = { id: string; name: string; mime: string; size: number };

export interface ForumComposePendingCreate {
  key: string;
  fields: ForumTopicFields;
}

type ComposeDraft = {
  title?: string;
  body?: string;
  tags?: string;
  reference?: string;
  targetSubject?: string;
  subjectId?: string;
  attachment?: ForumAttachmentDto | LegacyForumAttachment;
  legacyAttachment?: LegacyForumAttachment;
  pendingCreate?: ForumComposePendingCreate;
};

export interface ForumComposerContext {
  materialId: string | null;
  questionId: string | null;
  subjectId: string;
}

export interface ForumComposerState {
  title: string;
  body: string;
  tags: string;
  reference: string;
  targetSubject: string;
  attachment?: ForumAttachmentDto;
  legacyAttachment?: LegacyForumAttachment;
  draftKey: string;
  draftError: string;
  error: string;
  busy: boolean;
  pendingCreate?: ForumComposePendingCreate;
  fileInputVersion: number;
}

export type ForumComposerApi = Pick<
  ReturnType<typeof useForumApi>,
  'upload' | 'readFile' | 'discardFile' | 'create'
>;

export interface ForumComposerControllerOptions {
  api: ForumComposerApi;
  storage?: SessionStorageLike;
  userId?: string;
  materialId: string | null;
  questionId: string | null;
  initialSubjectId?: string;
  subjects: readonly SubjectOption[];
  onPublished: () => void;
  generateKey?: () => string;
}

function initialReference(materialId: string | null, questionId: string | null): string {
  if (materialId) return `material:${materialId}`;
  if (questionId) return `question:${questionId}`;
  return '';
}

export function createForumComposerController(options: ForumComposerControllerOptions) {
  let currentOptions = options;
  const listeners = new Set<() => void>();
  const keyGen = () => currentOptions.generateKey?.() ?? crypto.randomUUID();
  const composeKeyFor = () =>
    currentOptions.userId
      ? forumComposeDraftKeys(
          currentOptions.userId,
          currentOptions.materialId,
          currentOptions.questionId
        ).current
      : '';

  let state: ForumComposerState = {
    title: '',
    body: '',
    tags: '',
    reference: initialReference(options.materialId, options.questionId),
    targetSubject: options.initialSubjectId || options.subjects[0]?.id || '',
    attachment: undefined,
    legacyAttachment: undefined,
    draftKey: '',
    draftError: '',
    error: '',
    busy: false,
    pendingCreate: undefined,
    fileInputVersion: 0
  };

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const setState = (patch: Partial<ForumComposerState>) => {
    state = { ...state, ...patch };
    emit();
  };

  const persistDraft = () => {
    const composeKey = composeKeyFor();
    const storage = currentOptions.storage;
    if (!storage || !composeKey || state.draftKey !== composeKey) return;
    const failure = saveForumComposeDraft(storage, composeKey, {
      title: state.title,
      body: state.body,
      tags: state.tags,
      reference: state.reference,
      targetSubject: state.targetSubject,
      ...(state.attachment
        ? { attachment: state.attachment }
        : state.legacyAttachment
          ? { attachment: state.legacyAttachment }
          : {}),
      pendingCreate: state.pendingCreate
    });
    if (state.draftError !== (failure ?? '')) {
      setState({ draftError: failure ?? '' });
    }
  };

  const restoreDraft = () => {
    const composeKey = composeKeyFor();
    const storage = currentOptions.storage;
    if (!composeKey || !storage || state.draftKey === composeKey) return;
    const restored = readForumComposeDraft(storage, composeKey);
    if (restored.error) {
      setState({ draftError: restored.error });
      return;
    }
    const saved = restored.value as ComposeDraft | null;
    if (saved) {
      const previousAttachment = saved.attachment ?? saved.legacyAttachment;
      const legacy = previousAttachment
        ? {
            id: previousAttachment.id,
            name: previousAttachment.name,
            mime: previousAttachment.mime,
            size: previousAttachment.size
          }
        : undefined;
      setState({
        title: saved.title ?? '',
        body: saved.body ?? '',
        tags: saved.tags ?? '',
        reference: saved.reference ?? '',
        targetSubject: saved.targetSubject ?? saved.subjectId ?? state.targetSubject,
        pendingCreate: saved.pendingCreate,
        legacyAttachment: legacy,
        draftKey: composeKey,
        draftError: ''
      });
      if (previousAttachment && 'downloadUrl' in previousAttachment) {
        void currentOptions.api
          .readFile(previousAttachment.id)
          .then((item) => {
            setState({ attachment: item, legacyAttachment: undefined });
            persistDraft();
          })
          .catch(() => {});
      }
      return;
    }
    setState({ draftKey: composeKey, draftError: '' });
  };

  const removeFile = async () => {
    if (!state.attachment || state.busy) return;
    setState({ busy: true });
    try {
      await currentOptions.api.discardFile(state.attachment.id);
      setState({
        attachment: undefined,
        fileInputVersion: state.fileInputVersion + 1
      });
      persistDraft();
    } catch (cause) {
      setState({ error: toErrorMessage(cause, 'Não foi possível remover o anexo.') });
    } finally {
      setState({ busy: false });
    }
  };

  const chooseFile = async (file?: File) => {
    if (!file || !state.targetSubject) return;
    setState({ busy: true, error: '' });
    try {
      if (
        file.size < 1 ||
        file.size > 5 * 1024 * 1024 ||
        !['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(file.type)
      ) {
        throw new Error('Escolha um PDF, PNG, JPEG ou WebP de até 5 MB.');
      }
      const uploaded = await currentOptions.api.upload(state.targetSubject, file, keyGen());
      setState({ attachment: uploaded, legacyAttachment: undefined });
      persistDraft();
    } catch (cause) {
      setState({ error: toErrorMessage(cause, 'Não foi possível enviar o anexo.') });
    } finally {
      setState({ busy: false });
    }
  };

  const publish = async () => {
    setState({ error: '' });
    const subject = currentOptions.subjects.find((item) => item.id === state.targetSubject);
    if (!subject) {
      setState({ error: 'Selecione uma disciplina ativa.' });
      return false;
    }
    const target = state.reference
      ? {
          type: state.reference.startsWith('material:')
            ? ('material' as const)
            : ('question' as const),
          id: state.reference.slice(state.reference.indexOf(':') + 1)
        }
      : null;
    if (target && !target.id.trim()) {
      setState({ error: 'Confira a referência escolhida.' });
      return false;
    }
    const fields: ForumTopicFields = state.pendingCreate?.fields ?? {
      classId: subject.classId,
      subjectId: subject.id,
      title: state.title.trim(),
      body: state.body.trim(),
      tags: [
        ...new Set(
          state.tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean)
        )
      ].slice(0, 5),
      target,
      attachmentId: state.attachment?.id ?? null
    };
    const intent = state.pendingCreate ?? { key: keyGen(), fields };
    setState({ pendingCreate: intent, busy: true });
    persistDraft();
    try {
      await currentOptions.api.create(fields, intent.key);
      const composeKey = composeKeyFor();
      if (composeKey) removeSessionDraft(composeKey, currentOptions.storage);
      setState({
        title: '',
        body: '',
        tags: '',
        reference: '',
        attachment: undefined,
        legacyAttachment: undefined,
        pendingCreate: undefined,
        draftKey: '',
        busy: false
      });
      currentOptions.onPublished();
      return true;
    } catch (cause) {
      const clearPending =
        cause instanceof HttpError &&
        ['forbidden', 'not-found', 'validation', 'conflict'].includes(cause.kind);
      setState({
        ...(clearPending ? { pendingCreate: undefined } : {}),
        error: toErrorMessage(
          cause,
          'Não foi possível publicar a pergunta. Tente novamente para conferir o resultado.'
        ),
        busy: false
      });
      if (clearPending) persistDraft();
      return false;
    }
  };

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => state,
    updateOptions: (nextOptions: ForumComposerControllerOptions) => {
      currentOptions = nextOptions;
      if (!state.targetSubject && nextOptions.subjects[0]) {
        setState({ targetSubject: nextOptions.subjects[0].id });
      }
    },
    restoreDraft,
    setTitle: (title: string) => {
      setState({ title });
      persistDraft();
    },
    setBody: (body: string) => {
      setState({ body });
      persistDraft();
    },
    setTags: (tags: string) => {
      setState({ tags });
      persistDraft();
    },
    clearReference: () => {
      setState({ reference: '' });
      persistDraft();
    },
    clearLegacyAttachment: () => {
      setState({ legacyAttachment: undefined });
      persistDraft();
    },
    clearError: () => {
      if (state.error) setState({ error: '' });
    },
    changeSubject: (next: string) => {
      setState({ targetSubject: next });
      persistDraft();
      if (state.attachment) void removeFile();
    },
    chooseFile,
    removeFile,
    publish
  };
}

export function useForumComposer({
  userId,
  initialContext,
  subjects,
  onPublished
}: {
  userId?: string;
  initialContext: ForumComposerContext;
  subjects: readonly SubjectOption[];
  onPublished: () => void;
}) {
  const api = useForumApi();
  const storage = useMemo(() => defaultSessionStorage(), []);
  const controllerRef = useRef<ReturnType<typeof createForumComposerController> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createForumComposerController({
      api,
      storage,
      userId,
      materialId: initialContext.materialId,
      questionId: initialContext.questionId,
      initialSubjectId: initialContext.subjectId,
      subjects,
      onPublished
    });
  }
  const controller = controllerRef.current;

  useEffect(() => {
    controller.updateOptions({
      api,
      storage,
      userId,
      materialId: initialContext.materialId,
      questionId: initialContext.questionId,
      initialSubjectId: initialContext.subjectId,
      subjects,
      onPublished
    });
    controller.restoreDraft();
  }, [
    api,
    controller,
    initialContext.materialId,
    initialContext.questionId,
    initialContext.subjectId,
    onPublished,
    storage,
    subjects,
    userId
  ]);

  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );

  return {
    ...state,
    hasPendingCreate: !!state.pendingCreate,
    setTitle: controller.setTitle,
    setBody: controller.setBody,
    setTags: controller.setTags,
    clearReference: controller.clearReference,
    clearLegacyAttachment: controller.clearLegacyAttachment,
    clearError: controller.clearError,
    changeSubject: controller.changeSubject,
    chooseFile: (file?: File) => void controller.chooseFile(file),
    removeFile: () => void controller.removeFile(),
    submit: (event: FormEvent) => {
      event.preventDefault();
      void controller.publish();
    }
  };
}

'use client';

import { useEffect, useMemo, useRef, useSyncExternalStore, type FormEvent } from 'react';
import { HttpError } from '@/lib/http-client';
import { toErrorMessage } from '@/lib/errors';
import {
  defaultSessionStorage,
  removeSessionDraft,
  type SessionStorageLike
} from '@/lib/session-draft-storage';
import { forumReplyDraftKey, readForumDraft, saveForumDraft } from '../lib/forum-draft';
import { useForumApi } from './use-forum';

export interface ForumReplyPending {
  key: string;
  body: string;
}

export type ForumWithdrawTarget = { kind: 'topic' } | { kind: 'reply'; replyId: string } | null;

export interface ForumReplyState {
  body: string;
  pendingReply?: ForumReplyPending;
  loadedKey: string;
  draftError: string;
  error: string;
  busy: boolean;
  withdrawTarget: ForumWithdrawTarget;
}

export type ForumReplyApi = Pick<ReturnType<typeof useForumApi>, 'reply'>;

export interface ForumReplyControllerOptions {
  api: ForumReplyApi;
  storage?: SessionStorageLike;
  userId?: string;
  topicId: string;
  onInvalidate: () => void;
  generateKey?: () => string;
}

export function createForumReplyController(options: ForumReplyControllerOptions) {
  let currentOptions = options;
  const listeners = new Set<() => void>();
  const keyGen = () => currentOptions.generateKey?.() ?? crypto.randomUUID();
  const draftKeyFor = () =>
    currentOptions.userId && currentOptions.topicId
      ? forumReplyDraftKey(currentOptions.userId, currentOptions.topicId)
      : '';

  let state: ForumReplyState = {
    body: '',
    pendingReply: undefined,
    loadedKey: '',
    draftError: '',
    error: '',
    busy: false,
    withdrawTarget: null
  };

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const setState = (patch: Partial<ForumReplyState>) => {
    state = { ...state, ...patch };
    emit();
  };

  const persistDraft = () => {
    const draftKey = draftKeyFor();
    const storage = currentOptions.storage;
    if (!storage || !draftKey || state.loadedKey !== draftKey) return;
    const failure = saveForumDraft(
      storage,
      draftKey,
      JSON.stringify({ body: state.body, pendingReply: state.pendingReply })
    );
    if (state.draftError !== (failure ?? '')) {
      setState({ draftError: failure ?? '' });
    }
  };

  const restoreDraft = () => {
    const draftKey = draftKeyFor();
    const storage = currentOptions.storage;
    if (!draftKey || !storage || state.loadedKey === draftKey) return;
    const restored = readForumDraft(storage, draftKey);
    if (restored.error) {
      setState({ draftError: restored.error });
      return;
    }
    const text = restored.value ?? '';
    let nextBody = text;
    let nextPending: ForumReplyPending | undefined;
    try {
      const saved = JSON.parse(text) as {
        body?: string;
        pendingReply?: ForumReplyPending;
      };
      if (saved && typeof saved === 'object' && typeof saved.body === 'string') {
        nextBody = saved.body;
        nextPending = saved.pendingReply;
      }
    } catch {
      /* Preserve plain-text draft fallback. */
    }
    setState({
      body: nextBody,
      pendingReply: nextPending,
      loadedKey: draftKey,
      draftError: ''
    });
  };

  const updateTopic = async (action: () => Promise<unknown>, clearReply = false) => {
    if (state.busy) return false;
    setState({ busy: true, error: '' });
    try {
      await action();
      if (clearReply) {
        const draftKey = draftKeyFor();
        if (draftKey) removeSessionDraft(draftKey, currentOptions.storage);
        setState({ body: '', pendingReply: undefined });
      }
      currentOptions.onInvalidate();
      return true;
    } catch (cause) {
      const clearPending =
        clearReply &&
        cause instanceof HttpError &&
        ['forbidden', 'not-found', 'validation', 'conflict'].includes(cause.kind);
      setState({
        ...(clearPending ? { pendingReply: undefined } : {}),
        error: toErrorMessage(
          cause,
          'Não foi possível salvar a alteração. Tente novamente para conferir o resultado.'
        )
      });
      if (clearPending) persistDraft();
      return false;
    } finally {
      setState({ busy: false });
    }
  };

  const submitReply = async (hasTopic = true) => {
    if (!hasTopic || !state.body.trim()) return false;
    const intent = state.pendingReply ?? { key: keyGen(), body: state.body.trim() };
    setState({ pendingReply: intent });
    persistDraft();
    return updateTopic(
      () => currentOptions.api.reply(currentOptions.topicId, intent.body, intent.key),
      true
    );
  };

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => state,
    updateOptions: (nextOptions: ForumReplyControllerOptions) => {
      currentOptions = nextOptions;
    },
    restoreDraft,
    setBody: (body: string) => {
      setState({ body });
      persistDraft();
    },
    setError: (error: string) => {
      setState({ error });
    },
    setWithdrawTarget: (withdrawTarget: ForumWithdrawTarget) => {
      setState({ withdrawTarget });
    },
    updateTopic,
    submitReply
  };
}

export function useForumReply({
  userId,
  topicId,
  onInvalidate
}: {
  userId?: string;
  topicId: string;
  onInvalidate: () => void;
}) {
  const api = useForumApi();
  const storage = useMemo(() => defaultSessionStorage(), []);
  const controllerRef = useRef<ReturnType<typeof createForumReplyController> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createForumReplyController({
      api,
      storage,
      userId,
      topicId,
      onInvalidate
    });
  }
  const controller = controllerRef.current;

  useEffect(() => {
    controller.updateOptions({
      api,
      storage,
      userId,
      topicId,
      onInvalidate
    });
    controller.restoreDraft();
  }, [api, controller, onInvalidate, storage, topicId, userId]);

  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );

  return {
    ...state,
    setBody: controller.setBody,
    setError: controller.setError,
    setWithdrawTarget: controller.setWithdrawTarget,
    updateTopic: controller.updateTopic,
    submitReply: (event: FormEvent, hasTopic: boolean) => {
      event.preventDefault();
      void controller.submitReply(hasTopic);
    }
  };
}

import { defaultSessionStorage } from '@/lib/session-draft-storage';

/** Returns a visible recovery message instead of silently claiming a saved draft. */
export function saveForumDraft(
  storage: Pick<Storage, 'setItem'> | undefined = defaultSessionStorage(),
  key: string,
  value: string
): string | undefined {
  if (!storage) {
    return 'Não foi possível guardar o rascunho. Mantenha esta tela aberta para não perder o preenchimento.';
  }
  try {
    storage.setItem(key, value);
  } catch {
    return 'Não foi possível guardar o rascunho. Mantenha esta tela aberta para não perder o preenchimento.';
  }
}

export function readForumDraft(
  storage: Pick<Storage, 'getItem'> | undefined = defaultSessionStorage(),
  key: string
): { value?: string | null; error?: string } {
  if (!storage) return { value: null };
  try {
    return { value: storage.getItem(key) };
  } catch {
    return {
      error:
        'Não foi possível retomar o rascunho desta sessão. Mantenha esta tela aberta e recarregue para tentar recuperar antes de continuar.'
    };
  }
}

export interface ForumComposeDraftKeys {
  current: string;
}
export type ForumComposeDraft = Record<string, unknown> & {
  targetSubject?: string;
  subjectId?: string;
};

export function forumReplyDraftKey(userId: string, topicId: string): string {
  return `aja-http-forum-reply:${userId}:${topicId}`;
}

/** HTTP drafts use a new namespace so the legacy browser profile remains untouched. */
export function forumComposeDraftKeys(
  userId: string,
  materialId: string | null,
  questionId: string | null
): ForumComposeDraftKeys {
  const context = materialId
    ? `material:${materialId}`
    : questionId
      ? `question:${questionId}`
      : 'new';
  return { current: `aja-http-forum-compose:${userId}:${context}` };
}

/** Read only the key produced by the current HTTP namespace. */
export function readForumComposeDraft(
  storage: Pick<Storage, 'getItem'> | undefined = defaultSessionStorage(),
  key: string
): { value?: ForumComposeDraft | null; error?: string } {
  const stored = readForumDraft(storage, key);
  if (stored.error) return { error: stored.error };
  if (!stored.value) return { value: null };
  try {
    const parsed: unknown = JSON.parse(stored.value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('invalid forum composition');
    const draft = parsed as ForumComposeDraft;
    return {
      value:
        typeof draft.targetSubject === 'string' || typeof draft.subjectId !== 'string'
          ? draft
          : { ...draft, targetSubject: draft.subjectId }
    };
  } catch {
    return {
      error:
        'Não foi possível retomar o rascunho desta sessão. Mantenha esta tela aberta e recarregue para tentar recuperar antes de continuar.'
    };
  }
}

/** Serialize exactly the visible composition so removal of optional metadata is durable. */
export function saveForumComposeDraft(
  storage: Pick<Storage, 'setItem'> | undefined = defaultSessionStorage(),
  key: string,
  draft: ForumComposeDraft
): string | undefined {
  try {
    return saveForumDraft(storage, key, JSON.stringify(draft));
  } catch {
    return 'Não foi possível guardar o rascunho. Mantenha esta tela aberta para não perder o preenchimento.';
  }
}

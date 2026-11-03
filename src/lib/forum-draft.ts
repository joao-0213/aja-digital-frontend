/** Returns a visible recovery message instead of silently claiming a saved draft. */
export function saveForumDraft(storage: Pick<Storage, 'setItem'>, key: string, value: string): string | undefined {
  try { storage.setItem(key, value); }
  catch { return 'Não foi possível guardar o rascunho. Mantenha esta tela aberta para não perder o preenchimento.'; }
}

export function readForumDraft(storage: Pick<Storage, 'getItem'>, key: string): { value?: string | null; error?: string } {
  try { return { value: storage.getItem(key) }; }
  catch { return { error: 'Não foi possível retomar o rascunho desta sessão. Mantenha esta tela aberta e recarregue para tentar recuperar antes de continuar.' }; }
}

export interface ForumComposeDraftKeys { legacy: string; compatible: string }
export type ForumComposeDraft = Record<string, unknown> & { targetSubject?: string; subjectId?: string };

/** Keep the pre-HTTP raw context key while also accepting keys written by an interim client. */
export function forumComposeDraftKeys(userId: string, materialId: string | null, questionId: string | null): ForumComposeDraftKeys {
  const context = materialId ? `material:${materialId}` : questionId ? `question:${questionId}` : 'new';
  const legacyContext = materialId ?? questionId ?? 'new';
  return { legacy: `aja-forum-compose:${userId}:${legacyContext}`, compatible: `aja-forum-compose:${userId}:${context}` };
}

/** Read a legacy draft first and normalize its audience field without changing its contents. */
export function readForumComposeDraft(storage: Pick<Storage, 'getItem'>, keys: ForumComposeDraftKeys): { value?: ForumComposeDraft | null; error?: string } {
  const legacy = readForumDraft(storage, keys.legacy);
  if (legacy.error) return { error: legacy.error };
  const stored = legacy.value === null && keys.compatible !== keys.legacy ? readForumDraft(storage, keys.compatible) : legacy;
  if (stored.error) return { error: stored.error };
  if (!stored.value) return { value: null };
  try {
    const parsed: unknown = JSON.parse(stored.value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid forum composition');
    const draft = parsed as ForumComposeDraft;
    return { value: typeof draft.targetSubject === 'string' || typeof draft.subjectId !== 'string' ? draft : { ...draft, targetSubject: draft.subjectId } };
  } catch {
    return { error: 'Não foi possível retomar o rascunho desta sessão. Mantenha esta tela aberta e recarregue para tentar recuperar antes de continuar.' };
  }
}

/** Serialize exactly the visible composition so removal of optional metadata is durable. */
export function saveForumComposeDraft(storage: Pick<Storage, 'setItem'>, key: string, draft: ForumComposeDraft): string | undefined {
  try { return saveForumDraft(storage, key, JSON.stringify(draft)); }
  catch { return 'Não foi possível guardar o rascunho. Mantenha esta tela aberta para não perder o preenchimento.'; }
}

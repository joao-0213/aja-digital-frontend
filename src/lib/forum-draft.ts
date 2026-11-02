/** Returns a visible recovery message instead of silently claiming a saved draft. */
export function saveForumDraft(storage: Pick<Storage, 'setItem'>, key: string, value: string): string | undefined {
  try { storage.setItem(key, value); }
  catch { return 'Não foi possível guardar o rascunho. Mantenha esta tela aberta para não perder o preenchimento.'; }
}

export function readForumDraft(storage: Pick<Storage, 'getItem'>, key: string): { value?: string | null; error?: string } {
  try { return { value: storage.getItem(key) }; }
  catch { return { error: 'Não foi possível retomar o rascunho desta sessão. Mantenha esta tela aberta e recarregue para tentar recuperar antes de continuar.' }; }
}

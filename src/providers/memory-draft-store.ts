/** Session-scoped in-memory draft store; never persists to browser storage. */
export function createMemoryDraftStore() {
  let owner: string | undefined;
  const compositions = new Map<string, unknown>();
  const extras = new Map<string, unknown>();

  const clearAll = () => {
    owner = undefined;
    compositions.clear();
    extras.clear();
  };

  const setOwner = (nextOwner: string | undefined) => {
    if (!nextOwner) {
      clearAll();
      return;
    }
    if (nextOwner !== owner) {
      compositions.clear();
      extras.clear();
      owner = nextOwner;
    }
  };

  return {
    getOwner: () => owner,
    setOwner,
    clearAll,
    readDraft: <T>(context: string): T | undefined =>
      owner ? (structuredClone(compositions.get(context)) as T | undefined) : undefined,
    saveDraft: <T>(context: string, value: T) => {
      if (owner) compositions.set(context, structuredClone(value));
    },
    readDraftExtra: <T>(context: string): T | undefined =>
      owner ? (structuredClone(extras.get(context)) as T | undefined) : undefined,
    saveDraftExtra: <T>(context: string, value: T) => {
      if (owner) extras.set(context, structuredClone(value));
    },
    clearDraft: (context: string) => {
      compositions.delete(context);
      extras.delete(context);
    }
  };
}

export type MemoryDraftStore = ReturnType<typeof createMemoryDraftStore>;

export interface FrozenAttemptSubmitIntent {
  revision: number;
  key: string;
}

/** Freeze the submit body and key after the final autosave; retries replay only that POST. */
export function createAttemptSubmitCommand(makeKey: () => string = () => crypto.randomUUID()) {
  let intent: FrozenAttemptSubmitIntent | null = null;
  let preparing: Promise<FrozenAttemptSubmitIntent> | null = null;
  let pendingSends = 0;
  return {
    current: () => (intent ? { ...intent } : null),
    acknowledgeRevisionConflict(reviewedRevision: number) {
      if (!intent) return;
      if (preparing || pendingSends > 0)
        throw new Error('Wait for the current submit request before reviewing its revision.');
      if (!Number.isSafeInteger(reviewedRevision) || reviewedRevision <= intent.revision)
        throw new RangeError(
          'The reviewed revision must be newer than the frozen submit revision.'
        );
      intent = null;
    },
    async submit<T>(
      prepare: () => Promise<number>,
      send: (frozen: FrozenAttemptSubmitIntent) => Promise<T>
    ) {
      if (!intent) {
        preparing ??= (async () => {
          const revision = await prepare();
          if (!Number.isSafeInteger(revision) || revision < 1)
            throw new TypeError('A revisão salva da tentativa é inválida.');
          intent = { revision, key: makeKey() };
          return intent;
        })().finally(() => {
          preparing = null;
        });
        await preparing;
      }
      pendingSends++;
      try {
        if (!intent) throw new Error('Intenção de envio indisponível.');
        return await send({ ...intent });
      } finally {
        pendingSends--;
      }
    }
  };
}

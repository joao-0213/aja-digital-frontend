export interface HttpQueryIdentity {
  /** Must change on every login/logout, including a new session for the same account. */
  sessionKey: string;
  /** Includes every parameter/filter that changes the result. */
  key: string;
}

export interface HttpQueryState<T> {
  status: 'idle' | 'loading' | 'success' | 'error';
  data?: T;
  error?: Error;
}

export type HttpQueryLoader<T> = (signal: AbortSignal) => Promise<T>;

/** One active query; no cross-session cache or local institutional fallback. */
export function createHttpQuery<T>() {
  let state: HttpQueryState<T> = { status: 'idle' };
  let generation = 0;
  let controller: AbortController | undefined;
  let current: { identity: HttpQueryIdentity; load: HttpQueryLoader<T> } | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: HttpQueryState<T>) => {
    state = next;
    for (const listener of listeners) listener();
  };

  async function run(identity: HttpQueryIdentity, load: HttpQueryLoader<T>) {
    const version = ++generation;
    controller?.abort();
    const active = new AbortController();
    controller = active;
    current = { identity: { ...identity }, load };
    publish({ status: 'loading' });
    try {
      const data = await load(active.signal);
      if (version === generation && !active.signal.aborted) publish({ status: 'success', data });
    } catch (error: unknown) {
      if (version === generation && !active.signal.aborted)
        publish({
          status: 'error',
          error: error instanceof Error ? error : new Error('Falha ao carregar.')
        });
    }
  }

  const retry = async () => {
    if (current) await run(current.identity, current.load);
  };
  return {
    run,
    retry,
    invalidate: retry,
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    cancel: () => {
      generation++;
      controller?.abort();
      controller = undefined;
      current = undefined;
      publish({ status: 'idle' });
    }
  };
}

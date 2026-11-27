import { toErrorMessage } from './errors';

export type QueryKey = string | readonly unknown[];

export interface HttpQueryIdentity {
  /** Must change on every login/logout, including a new session for the same account. */
  sessionKey: string;
  /** Includes every parameter/filter that changes the result. */
  key: QueryKey;
}

export interface HttpQueryState<T> {
  status: 'idle' | 'loading' | 'success' | 'error';
  data?: T;
  error?: Error;
  revalidating: boolean;
}

export type HttpQueryLoader<T> = (signal: AbortSignal) => Promise<T>;

const IDLE_STATE: HttpQueryState<never> = Object.freeze({ status: 'idle', revalidating: false });

function canonicalizeValue(value: unknown): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : canonicalizeValue(item)));
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const entry = record[key];
      if (entry !== undefined) normalized[key] = canonicalizeValue(entry);
    }
    return normalized;
  }
  return String(value);
}

export function normalizeQueryKeyParts(key: QueryKey): string[] {
  const list = typeof key === 'string' ? [key] : key;
  return list.map((part) => JSON.stringify(canonicalizeValue(part)));
}

export function serializeQueryKey(key: QueryKey): string {
  return `[${normalizeQueryKeyParts(key).join(',')}]`;
}

function matchesPrefix(keyParts: readonly string[], prefixParts: readonly string[]): boolean {
  return (
    prefixParts.length <= keyParts.length &&
    prefixParts.every((part, index) => part === keyParts[index])
  );
}

interface CacheEntry<T> {
  keyParts: string[];
  serializedKey: string;
  state: HttpQueryState<T>;
  generation: number;
  controller?: AbortController;
  inFlight?: Promise<void>;
  lastLoad?: HttpQueryLoader<T>;
  subscribers: Set<() => void>;
}

/** Session-scoped in-memory query cache with deduplication, SWR revalidation, and prefix invalidation. */
export function createHttpQueryCache() {
  let currentSessionKey = '';
  const entries = new Map<string, CacheEntry<unknown>>();

  const notify = (entry: CacheEntry<unknown>) => {
    for (const listener of entry.subscribers) listener();
  };

  const getOrCreateEntry = <T>(key: QueryKey): CacheEntry<T> => {
    const keyParts = normalizeQueryKeyParts(key);
    const serializedKey = `[${keyParts.join(',')}]`;
    let entry = entries.get(serializedKey) as CacheEntry<T> | undefined;
    if (!entry) {
      entry = {
        keyParts,
        serializedKey,
        state: IDLE_STATE as HttpQueryState<T>,
        generation: 0,
        subscribers: new Set()
      };
      entries.set(serializedKey, entry as CacheEntry<unknown>);
    }
    return entry;
  };

  const abortEntry = (entry: CacheEntry<unknown>) => {
    entry.generation++;
    entry.controller?.abort();
    entry.controller = undefined;
    entry.inFlight = undefined;
  };

  const setSessionKey = (nextSessionKey: string) => {
    if (nextSessionKey === currentSessionKey) return;
    currentSessionKey = nextSessionKey;
    const previous = [...entries.values()];
    entries.clear();
    for (const entry of previous) {
      abortEntry(entry);
      entry.state = IDLE_STATE;
      notify(entry);
    }
  };

  const executeEntry = <T>(
    sessionKey: string,
    entry: CacheEntry<T>,
    load: HttpQueryLoader<T>,
    silent: boolean
  ): Promise<void> => {
    entry.lastLoad = load;
    const hadData = silent && entry.state.status === 'success' && entry.state.data !== undefined;
    const previousData = entry.state.data;
    abortEntry(entry);
    const version = entry.generation;
    const controller = new AbortController();
    entry.controller = controller;
    entry.state = hadData
      ? { status: 'success', data: previousData, revalidating: true }
      : { status: 'loading', revalidating: false };
    notify(entry as CacheEntry<unknown>);

    const promise = (async () => {
      try {
        const data = await load(controller.signal);
        if (
          currentSessionKey === sessionKey &&
          entries.get(entry.serializedKey) === (entry as CacheEntry<unknown>) &&
          entry.generation === version &&
          !controller.signal.aborted
        ) {
          entry.controller = undefined;
          entry.inFlight = undefined;
          entry.state = { status: 'success', data, revalidating: false };
          notify(entry as CacheEntry<unknown>);
        }
      } catch (error: unknown) {
        if (
          currentSessionKey === sessionKey &&
          entries.get(entry.serializedKey) === (entry as CacheEntry<unknown>) &&
          entry.generation === version &&
          !controller.signal.aborted
        ) {
          entry.controller = undefined;
          entry.inFlight = undefined;
          entry.state = {
            status: 'error',
            error:
              error instanceof Error
                ? error
                : new Error(toErrorMessage(error, 'Falha ao carregar.')),
            revalidating: false
          };
          notify(entry as CacheEntry<unknown>);
        }
      }
    })();

    entry.inFlight = promise;
    return promise;
  };

  const ensure = <T>(
    sessionKey: string,
    key: QueryKey,
    load: HttpQueryLoader<T>,
    options: { force?: boolean; silent?: boolean } = {}
  ): Promise<void> => {
    if (sessionKey !== currentSessionKey) return Promise.resolve();
    const entry = getOrCreateEntry<T>(key);
    entry.lastLoad = load;
    if (!options.force && entry.inFlight) return entry.inFlight;
    if (!options.force && entry.state.status === 'success') return Promise.resolve();
    return executeEntry(sessionKey, entry, load, Boolean(options.silent));
  };

  const retry = <T>(
    sessionKey: string,
    key: QueryKey,
    load?: HttpQueryLoader<T>
  ): Promise<void> => {
    if (sessionKey !== currentSessionKey) return Promise.resolve();
    const entry = getOrCreateEntry<T>(key);
    const loader = load ?? entry.lastLoad;
    if (!loader) return Promise.resolve();
    return executeEntry(sessionKey, entry, loader, false);
  };

  const invalidateQueries = async (prefix?: QueryKey): Promise<void> => {
    const prefixParts = prefix === undefined ? undefined : normalizeQueryKeyParts(prefix);
    const matching = [...entries.values()].filter(
      (entry) => !prefixParts || matchesPrefix(entry.keyParts, prefixParts)
    );
    const tasks: Promise<void>[] = [];
    for (const entry of matching) {
      if (entry.subscribers.size > 0 && entry.lastLoad) {
        tasks.push(executeEntry(currentSessionKey, entry, entry.lastLoad, true));
      } else {
        abortEntry(entry);
        entries.delete(entry.serializedKey);
      }
    }
    await Promise.all(tasks);
  };

  const revalidateActiveQueries = async (): Promise<void> => {
    const active = [...entries.values()].filter(
      (entry) => entry.subscribers.size > 0 && entry.lastLoad
    );
    await Promise.all(
      active.map((entry) => executeEntry(currentSessionKey, entry, entry.lastLoad!, true))
    );
  };

  const getSnapshot = <T>(sessionKey: string, key: QueryKey): HttpQueryState<T> => {
    if (sessionKey !== currentSessionKey) return IDLE_STATE as HttpQueryState<T>;
    const entry = entries.get(serializeQueryKey(key)) as CacheEntry<T> | undefined;
    return entry?.state ?? (IDLE_STATE as HttpQueryState<T>);
  };

  const subscribe = (sessionKey: string, key: QueryKey, listener: () => void): (() => void) => {
    if (sessionKey !== currentSessionKey) return () => {};
    const entry = getOrCreateEntry(key);
    entry.subscribers.add(listener);
    return () => {
      entry.subscribers.delete(listener);
      if (entry.subscribers.size === 0 && entry.inFlight) {
        abortEntry(entry);
        entry.state = IDLE_STATE;
      }
    };
  };

  const clear = () => {
    const previous = [...entries.values()];
    entries.clear();
    for (const entry of previous) {
      abortEntry(entry);
      entry.state = IDLE_STATE;
      notify(entry);
    }
  };

  return {
    getSessionKey: () => currentSessionKey,
    setSessionKey,
    getSnapshot,
    subscribe,
    ensure,
    retry,
    invalidateQueries,
    revalidateActiveQueries,
    clear
  };
}

export type HttpQueryCache = ReturnType<typeof createHttpQueryCache>;

/** One active query; no cross-session cache or local institutional fallback. */
export function createHttpQuery<T>() {
  let state: HttpQueryState<T> = { status: 'idle', revalidating: false };
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
    publish({ status: 'loading', revalidating: false });
    try {
      const data = await load(active.signal);
      if (version === generation && !active.signal.aborted)
        publish({ status: 'success', data, revalidating: false });
    } catch (error: unknown) {
      if (version === generation && !active.signal.aborted)
        publish({
          status: 'error',
          error: error instanceof Error ? error : new Error('Falha ao carregar.'),
          revalidating: false
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
      publish({ status: 'idle', revalidating: false });
    }
  };
}

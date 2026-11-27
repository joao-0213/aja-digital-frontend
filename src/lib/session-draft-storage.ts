export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function defaultSessionStorage(): SessionStorageLike | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

export function readSessionDraft<T>(
  key: string,
  validate?: (value: unknown) => value is T,
  storage: SessionStorageLike | undefined = defaultSessionStorage()
): T | null {
  if (!key || !storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (validate && !validate(parsed)) return null;
    return parsed as T;
  } catch {
    return null;
  }
}

export function writeSessionDraft<T>(
  key: string,
  value: T,
  storage: SessionStorageLike | undefined = defaultSessionStorage()
): boolean {
  if (!key || !storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeSessionDraft(
  key: string,
  storage: SessionStorageLike | undefined = defaultSessionStorage()
): void {
  if (!key || !storage) return;
  try {
    storage.removeItem(key);
  } catch {
    /* Ignore unavailable browser storage. */
  }
}

export function readSessionText(
  key: string,
  storage: SessionStorageLike | undefined = defaultSessionStorage()
): string | null {
  if (!key || !storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSessionText(
  key: string,
  value: string,
  storage: SessionStorageLike | undefined = defaultSessionStorage()
): boolean {
  if (!key || !storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

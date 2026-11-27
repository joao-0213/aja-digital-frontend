export function publicationPreparation<T>(
  moduleId: string,
  editing: boolean,
  storage: {
    read: (key: string) => T | undefined;
    save: (key: string, value: T) => void;
    clear: (key: string) => void;
  }
) {
  const key = `material-preparation:${moduleId}`;
  return {
    read: () => (editing ? undefined : storage.read(key)),
    save: (value: T) => {
      if (!editing) storage.save(key, value);
    },
    clear: () => {
      if (!editing) storage.clear(key);
    },
    discard: async (discard: () => Promise<unknown>) => {
      if (!editing) await discard();
    }
  };
}

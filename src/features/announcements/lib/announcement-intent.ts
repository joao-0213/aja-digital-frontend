interface DraftIntentClient {
  readDraftExtra<T>(context: string): T | undefined;
  saveDraftExtra<T>(context: string, value: T, expectedSessionKey: string): void;
}

interface AnnouncementIntent {
  fingerprint: string;
  key: string;
}

export function getOrCreateAnnouncementIntent(
  client: DraftIntentClient,
  context: string,
  sessionKey: string,
  fingerprint: string
) {
  const saved = client.readDraftExtra<AnnouncementIntent>(context);
  if (saved?.fingerprint === fingerprint && saved.key) return saved.key;
  const key = crypto.randomUUID();
  client.saveDraftExtra(context, { fingerprint, key }, sessionKey);
  return key;
}

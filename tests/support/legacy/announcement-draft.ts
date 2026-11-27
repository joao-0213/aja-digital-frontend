const prefix = 'aja-notice-draft:';
type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export interface NoticeDraft {
  title: string;
  body: string;
  classId: string;
  subject: string;
  notify: boolean;
  calendar: boolean;
  date: string;
  time: string;
  allDay: boolean;
  revision: number;
}
export const draftKey = (userId: string, id?: string, subjectId?: string) =>
  `${prefix}${JSON.stringify([userId, id ? 'edit' : 'new', id ?? subjectId ?? 'general'])}`;

export function readDraft(storage: DraftStorage, key: string): NoticeDraft | undefined {
  const saved = storage.getItem(key);
  if (!saved) return;
  try {
    const value = JSON.parse(saved);
    if (!value || typeof value !== 'object') return;
    if (
      !['title', 'body', 'classId', 'subject', 'date', 'time'].every(
        (k) => typeof value[k] === 'string'
      ) ||
      !['notify', 'calendar', 'allDay'].every((k) => typeof value[k] === 'boolean') ||
      !Number.isInteger(value.revision) ||
      value.revision < 0
    )
      return;
    const { title, body, classId, subject, notify, calendar, date, time, allDay, revision } = value;
    return { title, body, classId, subject, notify, calendar, date, time, allDay, revision };
  } catch {
    return;
  }
}
export function writeDraft(storage: DraftStorage, key: string, value?: NoticeDraft) {
  if (value) storage.setItem(key, JSON.stringify(value));
  else storage.removeItem(key);
}
export function clearDrafts(storage: DraftStorage & Pick<Storage, 'length' | 'key'>) {
  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i);
    if (key?.startsWith(prefix)) storage.removeItem(key);
  }
}

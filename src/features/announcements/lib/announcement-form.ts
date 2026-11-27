import type { AnnouncementDto, AnnouncementFields } from '../api';

export function initialAnnouncementFields(
  item?: AnnouncementDto,
  subjectId?: string,
  classId?: string
): AnnouncementFields {
  return {
    classId: item?.classId ?? classId ?? '',
    subjectId: item ? item.subjectId : (subjectId ?? null),
    title: item?.title ?? '',
    body: item?.body ?? '',
    notify: item?.notify ?? true,
    occurrence: item?.occurrence ?? null
  };
}

export function announcementSubjectAfterClassChange(
  currentSubjectId: string | null,
  subjects: { id: string; classId: string }[],
  classId: string,
  contextualSubjectId?: string
): string | null {
  const contextual = subjects.find(
    (subject) => subject.id === contextualSubjectId && subject.classId === classId
  );
  return (
    contextual?.id ??
    subjects.find((subject) => subject.id === currentSubjectId && subject.classId === classId)
      ?.id ??
    null
  );
}

export function canManageAnnouncementItem(
  role: string | undefined,
  canManageContent: boolean,
  itemSubjectId: string | null,
  subjectId: string
): boolean {
  return canManageContent && (role === 'admin' || itemSubjectId === subjectId);
}

const brasiliaDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

const brasiliaTimeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

export function brasiliaTodayDate(nowMs = Date.now()): string {
  return brasiliaDateFormat.format(new Date(nowMs));
}

export function brasiliaMinTimeForDate(date: string, nowMs = Date.now()): string | undefined {
  if (!date || date !== brasiliaTodayDate(nowMs)) return undefined;
  const roundedMs = Math.ceil(nowMs / 60_000) * 60_000;
  if (brasiliaTodayDate(roundedMs) !== date) return '23:59';
  return brasiliaTimeFormat.format(new Date(roundedMs));
}

export function isOccurrenceInPast(
  occurrence: { date: string; time?: string; allDay: boolean } | null | undefined,
  nowMs = Date.now()
): boolean {
  if (!occurrence || !/^\d{4}-\d{2}-\d{2}$/.test(occurrence.date)) return false;
  const today = brasiliaTodayDate(nowMs);
  if (occurrence.date < today) return true;
  if (occurrence.allDay || occurrence.date > today) return false;
  if (!occurrence.time || !/^\d{2}:\d{2}$/.test(occurrence.time)) return false;
  const parsed = Date.parse(`${occurrence.date}T${occurrence.time}:00-03:00`);
  return Number.isFinite(parsed) && parsed < nowMs;
}

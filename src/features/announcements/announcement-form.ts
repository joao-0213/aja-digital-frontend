import type { AnnouncementDto, AnnouncementFields } from './api';

export function initialAnnouncementFields(item?: AnnouncementDto, subjectId?: string): AnnouncementFields {
  return {
    classId: item?.classId ?? '', subjectId: item ? item.subjectId : subjectId ?? null,
    title: item?.title ?? '', body: item?.body ?? '', notify: item?.notify ?? true,
    occurrence: item?.occurrence ?? null
  };
}

export function announcementSubjectAfterClassChange(currentSubjectId: string | null, subjects: { id: string; classId: string }[], classId: string, contextualSubjectId?: string): string | null {
  const contextual = subjects.find(subject => subject.id === contextualSubjectId && subject.classId === classId);
  return contextual?.id ?? subjects.find(subject => subject.id === currentSubjectId && subject.classId === classId)?.id ?? null;
}

export function canManageAnnouncementItem(role: string | undefined, canManageContent: boolean, itemSubjectId: string | null, subjectId: string): boolean {
  return canManageContent && (role === 'admin' || itemSubjectId === subjectId);
}

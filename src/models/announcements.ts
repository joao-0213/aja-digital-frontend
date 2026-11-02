import type { RecordMeta } from './audit';

export interface Announcement extends RecordMeta {
  id: string;
  classId: string;
  subjectId?: string;
  authorId: string;
  title: string;
  body: string;
  createdAt: string;
  notify: boolean;
  occurrence?: { date: string; time?: string; allDay?: boolean };
  legacyEventId?: string;
}

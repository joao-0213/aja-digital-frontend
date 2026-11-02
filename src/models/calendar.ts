import type { RecordMeta } from './audit';

export interface CalendarEvent extends RecordMeta {
  id: string;
  title: string;
  kind: 'class' | 'exam' | 'event';
  date: string;
  time: string;
  description: string;
  subjectId?: string;
}

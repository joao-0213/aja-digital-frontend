export interface CalendarEvent {
  id: string;
  title: string;
  kind: 'class' | 'exam' | 'event';
  date: string;
  time: string;
  description: string;
  subjectId?: string;
}

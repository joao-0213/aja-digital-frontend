export interface Attendance {
  id: string;
  subjectId: string;
  date: string;
  time: string;
  records: Record<string, boolean>;
}

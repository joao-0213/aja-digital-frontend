import type { RecordMeta } from './audit';

export interface Attendance extends RecordMeta {
  id: string;
  subjectId: string;
  date: string;
  time: string;
  records: Record<string, boolean>;
}

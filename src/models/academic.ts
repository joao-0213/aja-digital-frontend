import type { RecordMeta } from './audit';

export type SubjectIcon = 'book' | 'calculator' | 'atom' | 'flask' | 'leaf' | 'globe' | 'languages' | 'landmark' | 'palette' | 'graduation';

export interface SchoolClass extends RecordMeta {
  id: string;
  name: string;
  code: string;
  year: number;
  shift: 'Manhã' | 'Tarde' | 'Noite';
  active: boolean;
  studentIds: string[];
}

export interface Subject extends RecordMeta {
  id: string;
  classId: string;
  name: string;
  teacherIds: string[];
  color: 'violet' | 'blue' | 'amber' | 'green';
  icon?: SubjectIcon;
  description: string;
}

export interface TrailModule extends RecordMeta {
  id: string;
  subjectId: string;
  title: string;
  description: string;
  order: number;
}

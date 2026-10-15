export type SubjectIcon = 'book' | 'calculator' | 'atom' | 'flask' | 'leaf' | 'globe' | 'languages' | 'landmark' | 'palette' | 'graduation';

export interface SchoolClass {
  id: string;
  name: string;
  code: string;
  year: number;
  shift: 'Manhã' | 'Tarde' | 'Noite';
  active: boolean;
  studentIds: string[];
}

export interface Subject {
  id: string;
  classId: string;
  name: string;
  teacherId: string;
  color: 'violet' | 'blue' | 'amber' | 'green';
  icon?: SubjectIcon;
  description: string;
}

export interface TrailModule {
  id: string;
  subjectId: string;
  title: string;
  description: string;
  order: number;
}

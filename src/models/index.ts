export type Role = 'student' | 'teacher' | 'admin';
export type DocumentStatus = 'pending' | 'approved' | 'rejected';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type MaterialKind = 'lesson' | 'pdf' | 'video';
export type SubjectIcon = 'book' | 'calculator' | 'atom' | 'flask' | 'leaf' | 'globe' | 'languages' | 'landmark' | 'palette' | 'graduation';
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  course: string;
  institution: string;
  quota: 'none' | 'public_school' | 'income' | 'racial' | 'disability';
  bio: string;
  avatar?: string;
}
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
export interface Material {
  id: string;
  moduleId: string;
  title: string;
  kind: MaterialKind;
  duration: number;
  content: string;
  fileName?: string;
  localFileId?: string;
  fileSize?: number;
  createdAt?: string;
  authorId?: string;
  order: number;
}
export interface Question {
  id: string;
  subject: string;
  topic: string;
  difficulty: Difficulty;
  institution: string;
  year: number;
  statement: string;
  options: string[];
  correct: number;
  explanation: string;
}
export interface Assessment {
  id: string;
  publishedAt?: string;
  moduleId: string;
  title: string;
  description: string;
  questionIds: string[];
  deadline: string;
  attempts: number;
  shuffle: boolean;
  status: 'draft' | 'published';
}
export interface Attempt {
  id: string;
  assessmentId: string;
  userId: string;
  startedAt: string;
  submittedAt?: string;
  answers: Record<string, number>;
  questionOrder: string[];
}
export interface ForumReply {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
  votes: Record<string, -1 | 1>;
  accepted: boolean;
}
export interface ForumTopic {
  id: string;
  classId: string;
  subjectId: string;
  authorId: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: string;
  replies: ForumReply[];
  readBy: string[];
  reference?: string;
  attachmentName?: string;
}
export interface Announcement {
  id: string;
  classId: string;
  subjectId?: string;
  authorId: string;
  title: string;
  body: string;
  createdAt: string;
  notify: boolean;
}
export interface CalendarEvent {
  id: string;
  title: string;
  kind: 'class' | 'exam' | 'event';
  date: string;
  time: string;
  description: string;
  subjectId?: string;
}
export interface Attendance {
  id: string;
  subjectId: string;
  date: string;
  time: string;
  records: Record<string, boolean>;
}
export interface StudentDocument {
  id: string;
  userId: string;
  name: string;
  size: number;
  status: DocumentStatus;
  uploadedAt: string;
  reason?: string;
}
export interface Progress {
  userId: string;
  materialId: string;
  completed: boolean;
  lastAccess: string;
}
export interface MockDatabase {
  version: 1;
  users: User[];
  classes: SchoolClass[];
  subjects: Subject[];
  modules: TrailModule[];
  materials: Material[];
  questions: Question[];
  assessments: Assessment[];
  attempts: Attempt[];
  topics: ForumTopic[];
  announcements: Announcement[];
  events: CalendarEvent[];
  attendance: Attendance[];
  documents: StudentDocument[];
  progress: Progress[];
}

import type { RecordMeta } from './audit';
import type { Question } from './questions';

export interface AuditEvent {
  id: string;
  actorId: string;
  action: 'create' | 'update' | 'delete';
  collection: string;
  targetId: string;
  createdAt: string;
}

export interface Material extends RecordMeta {
  id: string;
  moduleId: string;
  title: string;
  kind: 'lesson' | 'pdf' | 'video';
  duration: number;
  content: string;
  fileName?: string;
  localFileId?: string;
  fileSize?: number;
  videoUrl?: string;
  createdAt?: string;
  authorId?: string;
  order: number;
}

export interface Progress extends RecordMeta {
  userId: string;
  materialId: string;
  completed: boolean;
  lastAccess: string;
}

export type WorkAttachment =
  | { id: string; kind: 'file'; name: string; size: number; mime: string }
  | { id: string; kind: 'link'; name: string; url: string };

export interface FeedbackPublication {
  comment: string;
  grade?: number;
  authorId: string;
  createdAt: string;
}

export interface WorkSubmission extends RecordMeta {
  feedbackUpdated?: boolean;
  id: string;
  assessmentId: string;
  userId: string;
  attachments: WorkAttachment[];
  submittedAt?: string;
  feedbackDraft?: FeedbackPublication;
  feedbackPublished?: FeedbackPublication;
  feedbackHistory: FeedbackPublication[];
}

export interface Attempt extends RecordMeta {
  questionsUpdatedAt?: string;
  id: string;
  assessmentId: string;
  userId: string;
  startedAt: string;
  submittedAt?: string;
  answers: Record<string, number>;
  questionOrder: string[];
  questions?: Question[];
}

export interface ForumReply extends RecordMeta {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
  votes: Record<string, 1>;
  accepted: boolean;
}

export interface ForumTopic extends RecordMeta {
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
  target?: { type: 'question' | 'material'; id: string };
  attachment?: { id: string; name: string; mime: string; size: number };
  attachmentName?: string;
}

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

export interface CalendarEvent extends RecordMeta {
  id: string;
  title: string;
  kind: 'class' | 'exam' | 'event';
  date: string;
  time: string;
  description: string;
  subjectId?: string;
}

export interface Attendance extends RecordMeta {
  id: string;
  subjectId: string;
  date: string;
  time: string;
  records: Record<string, boolean>;
}

import type { RecordMeta } from './audit';

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

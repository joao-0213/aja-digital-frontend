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

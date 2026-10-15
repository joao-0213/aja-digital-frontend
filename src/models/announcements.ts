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

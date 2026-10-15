import type { User, StudentDocument } from './user';
import type { SchoolClass, Subject, TrailModule } from './academic';
import type { Material, Progress } from './materials';
import type { Question } from './questions';
import type { Assessment, Attempt } from './assessments';
import type { ForumTopic } from './forum';
import type { Announcement } from './announcements';
import type { CalendarEvent } from './calendar';
import type { Attendance } from './attendance';

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

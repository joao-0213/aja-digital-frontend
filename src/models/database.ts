import type { User } from './user';
import type { SchoolClass, Subject, TrailModule } from './academic';
import type { Question } from './questions';
import type { Assessment } from './assessments';
import type { Enrollment } from './enrollment';
import type {
  Announcement,
  Attempt,
  Attendance,
  AuditEvent,
  CalendarEvent,
  ForumTopic,
  Material,
  Progress,
  WorkSubmission
} from './legacy';

export interface MockDatabase {
  version: 1;
  audit: AuditEvent[];
  enrollments: Enrollment[];
  users: User[];
  classes: SchoolClass[];
  subjects: Subject[];
  modules: TrailModule[];
  materials: Material[];
  questions: Question[];
  assessments: Assessment[];
  attempts: Attempt[];
  submissions?: WorkSubmission[];
  topics: ForumTopic[];
  announcements: Announcement[];
  events: CalendarEvent[];
  attendance: Attendance[];
  progress: Progress[];
}

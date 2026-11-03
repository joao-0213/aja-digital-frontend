import type { SubjectIcon } from '@/models';
import type { SessionClient } from '@/providers/session-client';

export interface DashboardSubject {
  id: string; revision: number; createdAt: string; updatedAt: string; updatedBy: string; classId: string; className: string;
  name: string; teacherIds: string[]; color: 'violet' | 'blue' | 'amber' | 'green'; icon: SubjectIcon; description: string;
  teachers: { id: string; name: string }[]; canManageContent: boolean; hasUpdates: boolean;
}
export interface DashboardAnnouncement {
  id: string; createdAt: string; classId: string; subjectId: string | null; title: string; body: string;
}
export interface DashboardAssessment {
  id: string; moduleId: string; title: string; description: string; kind: 'quiz' | 'work'; deadline: string | null;
  required: boolean; questionCount: number; subjectName?: string;
}
export interface DashboardTopic { id: string; title: string; subjectName: string; replyCount: number; href: string }
export interface DashboardItem {
  id: string; title: string; kind: 'class' | 'exam' | 'event'; date: string; time: string | null; allDay: boolean;
  description: string; subjectId: string | null; source: 'announcement' | 'assessment'; sourceId: string; href: string;
}
export interface StudentDashboardDto {
  role: 'student'; subjects: DashboardSubject[]; resume: { id: string; title: string; moduleId: string; kind: string } | null;
  pendingEnrollmentCount: number; assessments: DashboardAssessment[]; pendingAssessmentCount: number;
  announcements: DashboardAnnouncement[]; upcoming: DashboardItem[]; topics: DashboardTopic[];
  progress: { id: string; materialId: string; completed: boolean; lastAccess: string }[];
  completedMaterials: number; totalMaterials: number;
}
export interface StaffDashboardDto {
  role: 'teacher' | 'admin'; subjects: DashboardSubject[];
  classes: { id: string; name: string; code: string; year: number; shift: string; active: boolean; studentCount: number }[];
  pendingEnrollmentCount: number; assessments: DashboardAssessment[];
  announcements: DashboardAnnouncement[]; upcoming: DashboardItem[]; topics: DashboardTopic[];
  studentCount: number; pendingFeedbackCount: number;
}
export type DashboardDto = StudentDashboardDto | StaffDashboardDto;

export function createDashboardApi(client: Pick<SessionClient, 'request'>) {
  return {
    read: (signal?: AbortSignal) => client.request<DashboardDto>('/me/dashboard', { signal })
  };
}

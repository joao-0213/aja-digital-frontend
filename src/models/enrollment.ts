import type { RecordMeta } from './audit';

export interface Enrollment extends RecordMeta {
  id: string;
  classId: string;
  email: string;
  studentId?: string;
  status: 'pending' | 'active' | 'ended' | 'cancelled';
  createdAt: string;
  createdBy: string;
  enrolledAt?: string;
  endedAt?: string;
  /** Existing memberships have no trustworthy enrollment date. */
  legacy?: boolean;
  unassignedAssessmentIds: string[];
}

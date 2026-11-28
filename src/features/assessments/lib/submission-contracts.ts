import type { PaginatedResponse } from '@/models';

export type SubmissionAttachment =
  | { kind: 'file'; fileId: string; name: string }
  | { kind: 'link'; name: string; url: string };

export interface WorkFeedback {
  comment: string;
  grade: number | null;
  author: { id: string; name: string };
  createdAt: string;
}

export interface SubmissionReceipt {
  id: string;
  resourceId: string;
  submittedAt: string;
}

interface SubmissionBase {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  assessmentId: string;
  userId: string;
  attachments: SubmissionAttachment[];
  submittedAt: string | null;
  receipt: SubmissionReceipt | null;
  feedbackPublished: WorkFeedback | null;
  feedbackUpdated: boolean;
}

export interface SubmissionStudent extends SubmissionBase {}

export interface SubmissionStaff extends SubmissionBase {
  studentName: string;
  feedbackDraft: WorkFeedback | null;
  feedbackHistory: WorkFeedback[];
}

export type SubmissionRead = SubmissionStudent | SubmissionStaff;
export type SubmissionPage = PaginatedResponse<SubmissionRead>;

export interface WorkFileMetadata {
  id: string;
  name: string;
  size: number;
  mime: string;
  purpose: 'work';
  parentId: string;
  status: 'staged' | 'attached';
  downloadUrl: string;
}

export function isStaffSubmission(
  value: SubmissionRead | undefined | null
): value is SubmissionStaff {
  return Boolean(value && 'studentName' in value);
}

export function isStudentSubmission(
  value: SubmissionRead | undefined | null
): value is SubmissionStudent {
  return Boolean(value && !('studentName' in value));
}

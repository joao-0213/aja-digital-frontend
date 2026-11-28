import type { SubjectSummary } from '@/features/subjects';
import type { PaginatedResponse } from '@/models';
import type { TrailModule } from '@/models/academic';
import type { Question } from '@/models/questions';

export interface AssessmentSnapshot extends Omit<Question, 'image'> {
  origin: 'bank' | 'author';
  image?: { src: string; alt: string } | null;
}

export interface AssessmentBase {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  moduleId: string;
  title: string;
  description: string;
  kind: 'quiz' | 'work';
  maxGrade: number | null;
  deadline: string | null;
  required: boolean;
  allowLate: boolean;
  status: 'draft' | 'published';
  publishedAt: string | null;
}

export interface AssessmentStaff extends AssessmentBase {
  questionIds: string[];
  questions: AssessmentSnapshot[];
  hasSubmissions: boolean;
}

export interface AssessmentStudent extends Omit<AssessmentBase, 'status' | 'publishedAt'> {
  status: 'published';
  publishedAt: string;
  questionCount: number;
  assigned: boolean;
}

export type AssessmentRead = AssessmentStaff | AssessmentStudent;
export type AssessmentPage = PaginatedResponse<AssessmentRead>;

export type AssessmentQuestionEntry =
  | { source: 'bank'; questionId: string }
  | {
      source: 'authored';
      clientKey: string;
      questionId: string | null;
      question: Omit<AssessmentSnapshot, 'id' | 'origin'>;
    };

export interface AssessmentFields {
  moduleId: string;
  title: string;
  description: string;
  kind: 'quiz' | 'work';
  maxGrade: number | null;
  deadline: string | null;
  required: boolean;
  allowLate: boolean;
  questions: AssessmentQuestionEntry[];
  confirmResetDrafts?: boolean;
}

export type AssessmentCreate = Omit<AssessmentFields, 'confirmResetDrafts'>;
export type AssessmentEdit = Partial<AssessmentFields> & { expectedRevision: number };
export type AssessmentSubject = SubjectSummary;

export interface AssessmentContext {
  modules: TrailModule[];
  subjects: AssessmentSubject[];
}

export interface AssessmentOverview extends AssessmentContext {
  assessments: AssessmentRead[];
}

export function isStaffAssessment(
  value: AssessmentRead | undefined | null
): value is AssessmentStaff {
  return Boolean(value && 'questionIds' in value);
}

export function toAssessmentCreate(fields: AssessmentFields): AssessmentCreate {
  const { confirmResetDrafts: _discarded, ...payload } = fields;
  return payload;
}

import type { SessionClient } from '@/providers/session-client';
import type { Enrollment } from '@/models/enrollment';
import type { User } from '@/models/user';

export interface EnrollmentDto extends Enrollment {
  className?: string | null;
}
export interface StudentDto {
  id: string;
  name: string;
  email: string;
  active: boolean;
  enrollment: EnrollmentDto | null;
  attendance?: { present: number; total: number };
}
export interface StudentAttendanceHistory {
  id: string;
  revision: number;
  subjectId: string;
  subjectName: string;
  date: string;
  time: string;
  present: boolean;
}
export interface StudentDetailDto {
  student: StudentDto;
  enrollments: EnrollmentDto[];
  attendance: StudentAttendanceHistory[];
}
export interface EnrollmentPreview {
  email: string;
  classId: string;
  canEnroll: boolean;
  message: string;
  account: User | null;
  existingEnrollment: EnrollmentDto | null;
  otherClass: { id: string; name: string } | null;
}
export interface StudentsPageDto {
  items: StudentDto[];
  page: number;
  pageSize: number;
  total: number;
}
export interface EnrollmentsPageDto {
  items: EnrollmentDto[];
  page: number;
  pageSize: number;
  total: number;
}

export function createStudentsApi(client: Pick<SessionClient, 'request'>) {
  return {
    list: (classId: string, q: string, history: boolean, page: number, signal?: AbortSignal) => {
      const search = new URLSearchParams({
        classId,
        history: String(history),
        page: String(page),
        pageSize: '20'
      });
      if (q.trim()) search.set('q', q.trim());
      return client.request<StudentsPageDto>(`/students?${search}`, { signal });
    },
    read: (id: string, signal?: AbortSignal) =>
      client.request<StudentDetailDto>(`/students/${encodeURIComponent(id)}`, { signal }),
    enrollments: (
      classId: string,
      q: string,
      history: boolean,
      page: number,
      signal?: AbortSignal
    ) => {
      const search = new URLSearchParams({
        classId,
        status: history ? 'pending,cancelled' : 'pending',
        page: String(page),
        pageSize: '20'
      });
      if (q.trim()) search.set('q', q.trim());
      return client.request<EnrollmentsPageDto>(`/enrollments?${search}`, { signal });
    },
    readEnrollment: (id: string) =>
      client.request<EnrollmentDto>(`/enrollments/${encodeURIComponent(id)}`),
    preview: (classId: string, email: string) =>
      client.request<EnrollmentPreview>(
        `/enrollments/preview?${new URLSearchParams({ classId, email })}`
      ),
    add: (classId: string, email: string, key: string) =>
      client.request<EnrollmentDto>('/enrollments', {
        method: 'POST',
        json: { classId, email },
        headers: { 'Idempotency-Key': key }
      }),
    command: (
      id: string,
      action: 'cancel' | 'end' | 'activate',
      expectedRevision: number,
      key: string
    ) =>
      client.request<EnrollmentDto>(`/enrollments/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
        json: { expectedRevision },
        headers: { 'Idempotency-Key': key }
      })
  };
}

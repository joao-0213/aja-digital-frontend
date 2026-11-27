import type { SessionClient } from '@/providers/session-client';
import type { PaginatedResponse } from '@/models';
import { collectAllPages } from '@/lib/http-pagination';

export interface AttendanceSubject {
  id: string;
  classId: string;
  name: string;
  className: string;
  canManageContent: boolean;
}
export interface AttendanceEligibleStudent {
  id: string;
  name: string;
  eligible: boolean;
  reason: string | null;
}
export interface AttendanceStudent extends AttendanceEligibleStudent {
  present: boolean | null;
}
export interface AttendanceLesson {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  subjectId: string;
  date: string;
  time: string;
  records: Record<string, boolean>;
}
type AttendancePage<T> = PaginatedResponse<T>;
export interface AttendanceRoster {
  items: AttendanceStudent[];
}
export interface AttendanceHistoryEntry {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  subjectId: string;
  subjectName: string;
  date: string;
  time: string;
  present: boolean;
}
export type AttendanceHistoryPage = PaginatedResponse<AttendanceHistoryEntry>;
type AttendanceStaffHistoryRead =
  | AttendanceLesson
  | (Omit<AttendanceHistoryEntry, 'subjectName'> & { subjectName?: string });
export interface AttendanceFields {
  subjectId: string;
  date: string;
  time: string;
  records: Record<string, boolean>;
}

export function createAttendanceApi(client: Pick<SessionClient, 'request'>) {
  return {
    subjects: (signal?: AbortSignal) =>
      collectAllPages(
        (page, pageSignal) =>
          client.request<{ items: AttendanceSubject[]; total: number }>(
            `/subjects?page=${page}&pageSize=100`,
            { signal: pageSignal }
          ),
        { signal }
      ),
    eligible: (subjectId: string, date: string, time: string, signal?: AbortSignal) =>
      collectAllPages<AttendanceEligibleStudent>(
        (page, pageSignal) =>
          client.request<AttendancePage<AttendanceEligibleStudent>>(
            `/attendance/eligible?${new URLSearchParams({ subjectId, date, time, page: String(page), pageSize: '100' })}`,
            { signal: pageSignal }
          ),
        { signal }
      ),
    lesson: (subjectId: string, date: string, _time: string, signal?: AbortSignal) =>
      collectAllPages<AttendanceLesson>(
        (page, pageSignal) =>
          client.request<AttendancePage<AttendanceLesson>>(
            `/attendance?${new URLSearchParams({ subjectId, from: date, to: date, page: String(page), pageSize: '100', sort: 'date' })}`,
            { signal: pageSignal }
          ),
        { signal }
      ),
    subjectLessons: (subjectId: string, signal?: AbortSignal) =>
      collectAllPages<AttendanceLesson>(
        (page, pageSignal) =>
          client.request<AttendancePage<AttendanceLesson>>(
            `/attendance?${new URLSearchParams({ subjectId, page: String(page), pageSize: '100', sort: 'date' })}`,
            { signal: pageSignal }
          ),
        { signal }
      ),
    read: (id: string, signal?: AbortSignal) =>
      client.request<AttendanceLesson>(`/attendance/${encodeURIComponent(id)}`, { signal }),
    create: (fields: AttendanceFields, intent = crypto.randomUUID()) =>
      client.request<AttendanceLesson>('/attendance', {
        method: 'POST',
        json: fields,
        headers: { 'Idempotency-Key': intent }
      }),
    update: (id: string, records: Record<string, boolean>, expectedRevision: number) =>
      client.request<AttendanceLesson>(`/attendance/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        json: { records, expectedRevision }
      }),
    history: (studentId: string, signal?: AbortSignal) =>
      client.request<AttendanceHistoryPage>(`/attendance?${new URLSearchParams({ studentId })}`, {
        signal
      }),
    staffHistory: (studentId: string, signal?: AbortSignal) =>
      collectAllPages<AttendanceStaffHistoryRead>(
        (page, pageSignal) =>
          client.request<AttendancePage<AttendanceStaffHistoryRead>>(
            `/attendance?${new URLSearchParams({ studentId, page: String(page), pageSize: '100', sort: 'date' })}`,
            { signal: pageSignal }
          ),
        { signal }
      ).then((rows) =>
        rows.flatMap((row) => {
          const present = 'present' in row ? row.present : row.records[studentId];
          if (typeof present !== 'boolean') return [];
          return [
            {
              id: row.id,
              revision: row.revision,
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
              updatedBy: row.updatedBy,
              subjectId: row.subjectId,
              subjectName: ('present' in row ? row.subjectName : undefined) ?? row.subjectId,
              date: row.date,
              time: row.time,
              present
            }
          ];
        })
      )
  };
}

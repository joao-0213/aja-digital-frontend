import type { SessionClient } from '../../providers/session-client.ts';

export interface AttendanceSubject {
  id: string;
  classId: string;
  name: string;
  className: string;
  canManageContent: boolean;
}
export interface AttendanceEligibleStudent { id: string; name: string; eligible: boolean; reason: string | null }
export interface AttendanceStudent extends AttendanceEligibleStudent { present: boolean | null }
export interface AttendanceLesson {
  id: string; revision: number; createdAt: string; updatedAt: string; updatedBy: string;
  subjectId: string; date: string; time: string; records: Record<string, boolean>;
}
interface AttendancePage<T> { items: T[]; page: number; pageSize: number; total: number }
export interface AttendanceRoster { items: AttendanceStudent[] }
export interface AttendanceHistoryEntry {
  id: string; revision: number; createdAt: string; updatedAt: string; updatedBy: string;
  subjectId: string; subjectName: string; date: string; time: string; present: boolean;
}
export interface AttendanceHistoryPage { items: AttendanceHistoryEntry[]; page: number; pageSize: number; total: number }
export interface AttendanceFields { subjectId: string; date: string; time: string; records: Record<string, boolean> }

async function allPages<T>(request: (page: number) => Promise<AttendancePage<T>>) {
  const items: T[] = [];
  let page = 1;
  let total = 0;
  do {
    const result = await request(page);
    items.push(...result.items);
    total = result.total;
    if (!result.items.length) break;
    page += 1;
  } while (items.length < total);
  return items;
}

export function createAttendanceApi(client: Pick<SessionClient, 'request'>) {
  return {
    subjects: async (signal?: AbortSignal) => {
      const items: AttendanceSubject[] = [];
      for (let page = 1; ; page++) {
        const result = await client.request<{ items: AttendanceSubject[]; total: number }>(`/subjects?page=${page}&pageSize=100`, { signal });
        items.push(...result.items);
        if (items.length >= result.total || !result.items.length) return items;
      }
    },
    eligible: (subjectId: string, date: string, time: string, signal?: AbortSignal) => allPages<AttendanceEligibleStudent>(page => client.request<{ items: AttendanceEligibleStudent[]; page: number; pageSize: number; total: number }>(`/attendance/eligible?${new URLSearchParams({ subjectId, date, time, page: String(page), pageSize: '100' })}`, { signal })),
    lesson: (subjectId: string, date: string, _time: string, signal?: AbortSignal) => allPages<AttendanceLesson>(page => client.request<AttendancePage<AttendanceLesson>>(`/attendance?${new URLSearchParams({ subjectId, from: date, to: date, page: String(page), pageSize: '100', sort: 'date' })}`, { signal })),
    read: (id: string, signal?: AbortSignal) => client.request<AttendanceLesson>(`/attendance/${encodeURIComponent(id)}`, { signal }),
    create: (fields: AttendanceFields, intent = crypto.randomUUID()) => client.request<AttendanceLesson>('/attendance', { method: 'POST', json: fields, headers: { 'Idempotency-Key': intent } }),
    update: (id: string, records: Record<string, boolean>, expectedRevision: number) => client.request<AttendanceLesson>(`/attendance/${encodeURIComponent(id)}`, { method: 'PATCH', json: { records, expectedRevision } }),
    history: (studentId: string, signal?: AbortSignal) => client.request<AttendanceHistoryPage>(`/attendance?${new URLSearchParams({ studentId })}`, { signal })
  };
}

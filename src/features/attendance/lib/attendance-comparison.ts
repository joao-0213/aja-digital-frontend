import type { User } from '@/models';

/** Present both versions per student; equal totals do not imply equal attendance. */
export function compareAttendanceRecords(saved: Readonly<Record<string, boolean>>, local: Readonly<Record<string, boolean>>, students: readonly Pick<User, 'id' | 'name'>[]) {
  const names = new Map(students.map(student => [student.id, student.name]));
  return [...new Set([...Object.keys(saved), ...Object.keys(local)])].map(studentId => ({
    studentId,
    name: names.get(studentId) ?? 'Aluno indisponível',
    saved: saved[studentId],
    local: local[studentId],
    changed: saved[studentId] !== local[studentId]
  }));
}

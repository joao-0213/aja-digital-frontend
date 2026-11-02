import type { Attendance, MockDatabase, User } from '@/models';

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

/** The natural lesson key must remain unique even if two editors opened an unsaved lesson. */
export function recordAttendance(db: MockDatabase, input: Pick<Attendance, 'id' | 'subjectId' | 'date' | 'time' | 'records'>, openedId?: string) {
  const current = db.attendance.find(item => item.subjectId === input.subjectId && item.date === input.date && item.time === input.time);
  if (current?.deletedAt || openedId && !current) throw new Error('Esta chamada está indisponível. O histórico deve ser preservado.');
  if (current && current.id !== openedId) throw new Error('Esta chamada foi criada por outro docente. Seu preenchimento foi preservado; consulte e confira a versão atual antes de salvar.');
  if (current) current.records = { ...input.records };
  else db.attendance.push({ ...input, records: { ...input.records } });
}

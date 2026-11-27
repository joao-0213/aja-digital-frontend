export function aggregateAttendanceByStudent(lessons: readonly { records: Record<string, boolean> }[]) {
  const totals = new Map<string, { present: number; total: number }>();
  for (const lesson of lessons) {
    for (const [studentId, present] of Object.entries(lesson.records)) {
      if (typeof present !== 'boolean') continue;
      const entry = totals.get(studentId) ?? { present: 0, total: 0 };
      entry.total += 1;
      if (present) entry.present += 1;
      totals.set(studentId, entry);
    }
  }
  return totals;
}

import type { MockDatabase, Role } from '@/models';
import { assessmentQuestions, attemptQuestions } from './question-composition.ts';

// Preserve the persisted demo contract across internal reorganizations.
export const DEMO_DATABASE_KEY = 'aja-digital-demo-v1';
export const DEMO_ROLE_KEY = 'aja-demo-role';
export const DEMO_USER_KEY = 'aja-demo-user';

type DemoStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Database writes and session reads fail independently. Keep migrated data in memory. */
export function readDemoState(local: DemoStorage, session: Pick<Storage, 'getItem'>) {
  const restored: { database?: MockDatabase; role?: Role; userId?: string; storageError: boolean } = { storageError: false };
  try {
    const saved = local.getItem(DEMO_DATABASE_KEY);
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (isDatabase(parsed)) {
        restored.database = migrateDatabase(parsed);
        const normalized = JSON.stringify(restored.database);
        if (normalized !== saved) local.setItem(DEMO_DATABASE_KEY, normalized);
      } else local.removeItem(DEMO_DATABASE_KEY);
    }
  } catch { restored.storageError = true; }
  try {
    const role = session.getItem(DEMO_ROLE_KEY);
    if (role === 'student' || role === 'teacher' || role === 'admin') restored.role = role;
  } catch { restored.storageError = true; }
  try {
    const userId = session.getItem(DEMO_USER_KEY);
    if (userId) restored.userId = userId;
  } catch { restored.storageError = true; }
  return restored;
}

export function isDatabase(value: unknown): value is MockDatabase {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<MockDatabase>;
  return item.version === 1 && ['users', 'classes', 'subjects', 'modules', 'materials', 'questions', 'assessments', 'attempts', 'topics', 'announcements', 'events', 'attendance', 'progress'].every(key => Array.isArray(item[key as keyof MockDatabase]));
}

/** PP01: keep compatible records and historical attempt order, discard retired data. */
export function migrateDatabase(value: MockDatabase): MockDatabase {
  const db = structuredClone(value);
  db.users = db.users.map(({ id, name, email, role, active, emailConfirmedAt, deletedAt, revision, updatedAt, updatedBy }) => ({
    id, name, email, role,
    ...(active !== undefined && { active }),
    ...(emailConfirmedAt !== undefined && { emailConfirmedAt }),
    ...(deletedAt !== undefined && { deletedAt }),
    ...(revision !== undefined && { revision }),
    ...(updatedAt !== undefined && { updatedAt }),
    ...(updatedBy !== undefined && { updatedBy })
  }));
  db.audit ??= [];
  db.enrollments ??= [];
  db.submissions ??= [];
  // Retire manual event sources without losing dates or their original evidence.
  for (const event of db.events.filter(e => !e.deletedAt)) {
    const subject = db.subjects.find(s => s.id === event.subjectId);
    const destinations = event.subjectId ? subject ? [subject.classId] : [] : db.classes.filter(c => c.active && !c.deletedAt).map(c => c.id);
    for (const classId of destinations) {
      const seedNoticeId = event.id === 'e1' && event.title === 'Plantão de Matemática' ? 'n2' : event.id === 'e2' && event.title === 'Simulado presencial AJA' ? 'n1' : undefined;
      const seedNotice = db.announcements.find(a => a.id === seedNoticeId && a.classId === classId && !a.deletedAt);
      if (seedNotice) {
        seedNotice.occurrence ??= { date: event.date, ...(event.time ? { time: event.time } : { allDay: true }) };
        seedNotice.legacyEventId = event.id;
        continue;
      }
      const id = `legacy-event-${event.id}-${classId}`;
      if (db.announcements.some(a => a.id === id || a.legacyEventId === event.id && a.classId === classId)) continue;
      db.announcements.push({ id, classId, subjectId: event.subjectId, legacyEventId: event.id,
        authorId: subject?.teacherIds?.[0] ?? db.users.find(u => u.role === 'admin')?.id ?? 'legacy',
        title: event.title, body: event.description, createdAt: event.updatedAt ?? '2026-10-01T12:00:00-03:00', notify: false,
        occurrence: { date: event.date, ...(event.time ? { time: event.time } : { allDay: true }) } });
    }
    if (destinations.length) event.deletedAt = '2026-11-02T00:00:00-03:00';
  }
  for (const schoolClass of db.classes) {
    for (const studentId of schoolClass.studentIds) {
      const student = db.users.find(u => u.id === studentId);
      if (!student || db.enrollments.some(e => e.classId === schoolClass.id && e.studentId === studentId)) continue;
      db.enrollments.push({ id: `legacy-${schoolClass.id}-${studentId}`, classId: schoolClass.id, studentId, email: student.email.trim().toLowerCase(), status: schoolClass.active && !schoolClass.deletedAt ? 'active' : 'ended', createdAt: '1970-01-01T00:00:00.000Z', createdBy: 'legacy', enrolledAt: '1970-01-01T00:00:00.000Z', legacy: true, unassignedAssessmentIds: [] });
    }
  }
  db.subjects = db.subjects.map(subject => {
    const record = subject as typeof subject & { teacherId?: string };
    record.teacherIds = [...new Set(Array.isArray(record.teacherIds) ? record.teacherIds : record.teacherId ? [record.teacherId] : [])];
    delete record.teacherId;
    return record;
  });
  delete (db as MockDatabase & { documents?: unknown }).documents;
  // Legacy builder generated these IDs and this topic for questionnaire-only originals.
  for (const q of db.questions) if (q.id.startsWith('question-') && q.topic === 'Questão original') q.origin = 'author';
  for (const a of db.assessments) a.questions ??= structuredClone(assessmentQuestions(db, a));
  for (const t of db.attempts) t.questions ??= structuredClone(attemptQuestions(db, t));
  db.questions = db.questions.filter(q => q.origin !== 'author');
  db.assessments = db.assessments.map(assessment => {
    const record = assessment as typeof assessment & { shuffle?: unknown; attempts?: unknown };
    delete record.shuffle;
    delete record.attempts;
    return record;
  });
  for (const topic of db.topics) {
    for (const reply of topic.replies) {
      reply.votes = Object.fromEntries(Object.entries(reply.votes).filter(([, vote]) => vote === 1));
    }
  }
  return db;
}

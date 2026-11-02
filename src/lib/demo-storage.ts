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

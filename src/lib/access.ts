import type { MockDatabase, Subject, User } from '@/models';
import { activeEnrollment, enrolledForLesson, hasEnrollmentConflict } from './enrollment.ts';

export function isActiveUser(user: User | undefined): user is User {
  return !!user && user.active !== false && !user.deletedAt;
}

export function canAccessSubject(db: MockDatabase, user: User, subjectId: string): boolean {
  if (!isActiveUser(user)) return false;
  const subject = db.subjects.find(s => s.id === subjectId && !s.deletedAt);
  if (!subject) return false;
  const schoolClass = db.classes.find(c => c.id === subject.classId && !c.deletedAt);
  if (!schoolClass) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'teacher') return subject.teacherIds.includes(user.id);
  return user.emailConfirmedAt !== null && !hasEnrollmentConflict(db, user.id) && schoolClass.active && schoolClass.studentIds.includes(user.id) && (!db.enrollments?.some(e => e.studentId === user.id && e.classId === schoolClass.id) || !!activeEnrollment(db, user.id, schoolClass.id));
}

export function canManageSubject(db: MockDatabase, user: User, subjectId: string): boolean {
  const subject = db.subjects.find(s => s.id === subjectId);
  return user.role !== 'student' && canAccessSubject(db, user, subjectId) && !!db.classes.find(c => c.id === subject?.classId && c.active && !c.deletedAt);
}

export function visibleSubjects(db: MockDatabase, user: User): Subject[] {
  return db.subjects.filter(s => canAccessSubject(db, user, s.id));
}

export function visibleClasses(db: MockDatabase, user: User) {
  if (!isActiveUser(user)) return [];
  if (user.role === 'admin') return db.classes.filter(c => !c.deletedAt);
  const subjects = visibleSubjects(db, user);
  return db.classes.filter(c => !c.deletedAt && (user.role === 'teacher' ? subjects.some(s => s.classId === c.id) : user.emailConfirmedAt !== null && !hasEnrollmentConflict(db, user.id) && c.active && c.studentIds.includes(user.id) && (!db.enrollments?.some(e => e.studentId === user.id && e.classId === c.id) || !!activeEnrollment(db, user.id, c.id))));
}

export function canAccessStudent(db: MockDatabase, user: User, studentId: string): boolean {
  if (!isActiveUser(user)) return false;
  if (user.role === 'admin' || user.id === studentId) return true;
  return user.role === 'teacher' && visibleClasses(db, user).some(c => c.studentIds.includes(studentId) || db.enrollments?.some(e => e.classId === c.id && e.studentId === studentId && e.enrolledAt));
}

/** A projection for UI queries. The demo still stores fictitious data locally, not server authorization. */
export function scopeDatabase(db: MockDatabase, user: User): MockDatabase {
  const admin = isActiveUser(user) && user.role === 'admin';
  const subjects = visibleSubjects(db, user);
  const subjectIds = new Set(subjects.map(s => s.id));
  const classes = visibleClasses(db, user);
  const classIds = new Set(classes.map(c => c.id));
  const modules = db.modules.filter(m => !m.deletedAt && subjectIds.has(m.subjectId));
  const moduleIds = new Set(modules.map(m => m.id));
  const materials = db.materials.filter(m => !m.deletedAt && moduleIds.has(m.moduleId));
  const assessments = db.assessments.filter(a => !a.deletedAt && moduleIds.has(a.moduleId) && (user.role !== 'student' || a.status === 'published'));
  const assessmentIds = new Set(assessments.map(a => a.id));
  const materialIds = new Set(materials.map(m => m.id));
  const submissions = (db.submissions ?? []).filter(s => !s.deletedAt && assessmentIds.has(s.assessmentId) && (user.role === 'student' ? s.userId === user.id : !!s.submittedAt));
  const active = isActiveUser(user);
  const announcements = db.announcements.filter(a => !a.deletedAt && classIds.has(a.classId) && (!a.subjectId || subjectIds.has(a.subjectId)));
  const topics = db.topics.filter(t => !t.deletedAt && classIds.has(t.classId) && (!t.subjectId || subjectIds.has(t.subjectId)));
  const authors = new Set([
    ...materials.map(m => m.authorId), ...assessments.map(a => a.authorId),
    ...announcements.map(a => a.authorId), ...topics.flatMap(t => [t.authorId, ...t.replies.map(r => r.authorId)]),
    ...subjects.flatMap(s => s.teacherIds),
    ...submissions.flatMap(s => [s.userId, s.feedbackPublished?.authorId, s.feedbackDraft?.authorId]),
    ...[...modules, ...materials, ...assessments, ...announcements].map(row => row.updatedBy)
  ]);
  return {
    ...db,
    audit: admin ? db.audit : [],
    enrollments: (db.enrollments ?? []).filter(e => admin || active && (user.role === 'student' ? e.studentId === user.id || e.status === 'pending' && e.email === user.email.trim().toLowerCase() : !!e.studentId && !!e.enrolledAt && classIds.has(e.classId))),
    users: db.users.filter(person => admin || person.id === user.id || active && (authors.has(person.id) || user.role === 'teacher' && person.role === 'student' && canAccessStudent(db, user, person.id))).map(person => ({ ...person, email: admin || active && (person.id === user.id || user.role === 'teacher' && person.role === 'student' && canAccessStudent(db, user, person.id)) ? person.email : '' })),
    classes: classes.map(c => user.role === 'student' ? { ...c, studentIds: c.studentIds.filter(id => id === user.id) } : c),
    subjects, modules, materials, assessments,
    submissions: submissions.map(s => user.role === 'student' ? { ...s, feedbackDraft: undefined, feedbackUpdated: s.feedbackHistory.length > 1, feedbackHistory: [] } : s),
    questions: active ? db.questions.filter(q => !q.deletedAt) : [],
    attempts: db.attempts.filter(a => !a.deletedAt && assessmentIds.has(a.assessmentId) && (user.role === 'student' ? a.userId === user.id : !!a.submittedAt)),
    progress: db.progress.filter(p => materialIds.has(p.materialId) && p.userId === user.id),
    attendance: db.attendance.filter(a => !a.deletedAt && subjectIds.has(a.subjectId)).map(a => user.role === 'student' ? { ...a, records: Object.fromEntries(Object.entries(a.records).filter(([id]) => id === user.id && enrolledForLesson(db, db.subjects.find(s => s.id === a.subjectId)!.classId, id, a.date))) } : a),
    announcements, topics: topics.map(t => ({ ...t, readBy: t.readBy.filter(id => id === user.id), replies: t.replies.filter(r => !r.deletedAt) })),
    events: db.events.filter(e => !e.deletedAt && (e.subjectId ? subjectIds.has(e.subjectId) : active && classes.length > 0))
  };
}

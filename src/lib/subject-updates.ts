import type { MockDatabase } from '../models/index.ts';

// Publication identity is independent of module order and browser clock.
export function subjectPublications(db: MockDatabase, subjectId: string): string[] {
  const subject = db.subjects.find(s => s.id === subjectId);
  if (!subject) return [];
  const modules = new Set(db.modules.filter(m => m.subjectId === subjectId).map(m => m.id));
  return [
    ...db.materials.filter(m => modules.has(m.moduleId)).map(m => `material:${m.id}`),
    ...db.announcements.filter(a => a.classId === subject.classId && (!a.subjectId || a.subjectId === subjectId)).map(a => `notice:${a.id}`),
    ...db.assessments.filter(a => modules.has(a.moduleId) && a.status === 'published').map(a => `assessment:${a.id}`)
  ].sort();
}

export function hasUnseenPublications(publications: string[], seen: string[]): boolean {
  const known = new Set(seen);
  return publications.some(id => !known.has(id));
}

import type { Announcement, CalendarEvent, MockDatabase, User } from '@/models';
import { scopeDatabase } from './access.ts';
import { isAssessmentAssigned } from './enrollment.ts';

export type CalendarEntry = CalendarEvent & { classId: string; announcementId?: string; assessmentId?: string };

export function validateAnnouncement(a: Announcement, db: MockDatabase) {
  if (!db.classes.some(c => c.id === a.classId && c.active && !c.deletedAt)) throw new Error('Selecione uma turma ativa.');
  if (a.subjectId && !db.subjects.some(s => s.id === a.subjectId && s.classId === a.classId && !s.deletedAt)) throw new Error('A disciplina não pertence à turma selecionada.');
  if (!a.title.trim() || !a.body.trim()) throw new Error('Informe título e mensagem do aviso.');
  const o = a.occurrence;
  if (!o) return;
  const parsed = new Date(`${o.date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== o.date) throw new Error('Informe uma data válida para o acontecimento.');
  if (!o.allDay && !/^([01]\d|2[0-3]):[0-5]\d$/.test(o.time ?? '')) throw new Error('Informe o horário ou marque Dia inteiro.');
}

/** One derived view for calendar and dashboard; sources retain their own identity. */
export function calendarEntries(database: MockDatabase, user: User): CalendarEntry[] {
  const db = scopeDatabase(database, user);
  return [
    ...db.announcements.filter(a => a.occurrence).map(a => ({
      id: `notice-${a.id}`, announcementId: a.id, classId: a.classId, subjectId: a.subjectId,
      title: a.title, description: a.body, kind: 'event' as const,
      date: a.occurrence!.date, time: a.occurrence!.allDay ? 'Dia inteiro' : a.occurrence!.time!
    })),
    ...db.assessments.filter(a => a.status === 'published' && a.deadline && (user.role !== 'student' || isAssessmentAssigned(db, a, user.id))).map(a => {
      const subject = db.subjects.find(s => db.modules.some(m => m.id === a.moduleId && m.subjectId === s.id))!;
      return { id: `activity-${a.id}`, assessmentId: a.id, classId: subject.classId, subjectId: subject.id,
        title: `${a.title} · ${a.required === false ? 'Opcional' : 'Obrigatória'}`, description: a.description,
        kind: 'exam' as const, date: a.deadline.slice(0, 10), time: a.deadline.slice(11, 16) || 'Dia inteiro' };
    })
  ].sort((a, b) => `${a.date}${a.time}${a.id}`.localeCompare(`${b.date}${b.time}${b.id}`));
}

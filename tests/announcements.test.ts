import test from 'node:test';
import assert from 'node:assert/strict';
import type { MockDatabase } from '../src/models/database.ts';
const seed: MockDatabase = {
  version: 1, audit: [], enrollments: [], submissions: [],
  users: [
    { id: 'u1', role: 'student', name: 'Aluno', email: 'aluno@example.org' },
    { id: 'u2', role: 'teacher', name: 'Professor', email: 'prof@example.org' },
    { id: 'u3', role: 'admin', name: 'Admin', email: 'admin@example.org' }
  ],
  classes: [{ id: 'c1', name: 'Turma', code: 'T', year: 2026, shift: 'Noite', active: true, studentIds: ['u1'] }],
  subjects: [{ id: 's1', classId: 'c1', name: 'Matem?tica', teacherIds: ['u2'], color: 'blue', description: '' }],
  modules: [{ id: 'm1', subjectId: 's1', title: 'M?dulo', description: '', order: 1 }],
  assessments: [{ id: 'q1', moduleId: 'm1', title: 'Quiz', description: '', status: 'published', deadline: '2026-12-01T18:00', questionIds: [] }],
  announcements: [{ id: 'n2', classId: 'c1', subjectId: 's1', authorId: 'u2', title: 'Aviso', body: 'Mensagem', createdAt: '2026-10-03', notify: true }],
  events: [{ id: 'e1', subjectId: 's1', title: 'Plant?o', description: 'Sala 2', kind: 'class', date: '2026-10-07', time: '18:30' }],
  questions: [], materials: [], attempts: [], topics: [], attendance: [], progress: []
};
import { migrateDatabase } from '../src/lib/demo-storage.ts';
import { applyDemoMutation } from '../src/lib/demo-mutations.ts';
import { calendarEntries } from '../src/lib/announcement-calendar.ts';

test('legacy events migrate once to scoped announcements, preserving dates and history', () => {
  const db = migrateDatabase(seed);
  assert.equal(db.events.filter(e => !e.deletedAt).length, 0);
  assert.deepEqual(migrateDatabase(db), db);
  for (const event of seed.events) assert.ok(calendarEntries(db, db.users.find(u => u.id === 'u1')!).some(e => e.date === event.date && e.time === event.time));
});

test('announcement calendar derives updates and withdrawal without orphan or duplicate', () => {
  let db = migrateDatabase(seed);
  db = applyDemoMutation(db, 'u2', d => { d.announcements.push({ id: 'pp07', classId: 'c1', subjectId: 's1', authorId: 'u2', title: 'Plantão', body: 'Orientações', createdAt: '2026-11-02', notify: false, occurrence: { date: '2026-11-10', time: '18:30' } }); });
  const student = db.users.find(u => u.id === 'u1')!;
  assert.equal(calendarEntries(db, student).filter(e => e.announcementId === 'pp07').length, 1);
  const updated = applyDemoMutation(db, 'u2', d => { d.announcements.find(a => a.id === 'pp07')!.occurrence = { date: '2026-11-11', allDay: true }; });
  assert.equal(calendarEntries(updated, student).find(e => e.announcementId === 'pp07')!.time, 'Dia inteiro');
  assert.throws(() => applyDemoMutation(updated, 'u2', d => { d.announcements.find(a => a.id === 'pp07')!.title = 'Obsoleto'; }, { expected: [{ collection: 'announcements', id: 'pp07', revision: 1 }] }), /alterado/);
  const removed = applyDemoMutation(updated, 'u2', d => { delete d.announcements.find(a => a.id === 'pp07')!.occurrence; });
  assert.ok(removed.announcements.some(a => a.id === 'pp07'));
  assert.ok(!calendarEntries(removed, student).some(e => e.announcementId === 'pp07'));
  const deleted = applyDemoMutation(updated, 'u2', d => { d.announcements.find(a => a.id === 'pp07')!.deletedAt = '2026-11-02'; });
  assert.ok(!calendarEntries(deleted, student).some(e => e.announcementId === 'pp07'));
  assert.ok(deleted.audit.some(a => a.targetId === 'pp07' && a.action === 'delete'));
});

test('invalid date, destination and revoked permissions reject atomically', () => {
  const db = migrateDatabase(seed);
  for (const occurrence of [{ date: '2026-02-30', time: '18:30' }, { date: '2026-11-10' }, { date: '2026-11-10', time: '25:00' }]) {
    assert.throws(() => applyDemoMutation(db, 'u3', d => { Object.assign(d.announcements[0], { occurrence }); }), /data|horário/);
  }
  assert.throws(() => applyDemoMutation(db, 'u3', d => { d.announcements[0].classId = ''; }), /turma/);
  const revoked = structuredClone(db);
  revoked.subjects.find(s => s.id === 's1')!.teacherIds = [];
  assert.throws(() => applyDemoMutation(revoked, 'u2', d => { d.announcements.find(a => a.subjectId === 's1')!.body = 'Sem acesso'; }), /permissão/);
  assert.deepEqual(db, migrateDatabase(seed));
});

test('calendar scopes notices and published deadlines; no dates invented', () => {
  const db = migrateDatabase(seed);
  db.assessments[0].deadline = '';
  db.announcements.push({ id: 'other', classId: 'other', authorId: 'u3', title: 'Privado', body: 'Outra turma', createdAt: '2026-11-02', notify: true, occurrence: { date: '2026-11-10', allDay: true } });
  const entries = calendarEntries(db, db.users.find(u => u.id === 'u1')!);
  assert.ok(!entries.some(e => e.announcementId === 'other' || e.assessmentId === db.assessments[0].id));
  assert.ok(entries.every(e => e.announcementId || e.assessmentId));
});

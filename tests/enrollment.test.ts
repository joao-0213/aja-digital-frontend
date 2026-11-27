import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDemoMutation, type MutationOptions } from '../src/lib/demo-mutations.ts';
import { migrateDatabase } from '../src/lib/demo-storage.ts';
import { canAccessSubject, scopeDatabase } from '../src/lib/access.ts';
import type { MockDatabase } from '../src/models/database.ts';
import { enrolledForLesson, isAssessmentAssigned } from '../src/lib/enrollment.ts';

const now = '2026-11-02T12:00:00.000Z';

test('Brasília civil enrollment day includes a late-night entry regardless of server timezone', () => {
  const db = fixture();
  db.enrollments = [{ id: 'tz-entry', classId: 'c1', studentId: 'student', email: 'aluno@exemplo.com', status: 'active', createdAt: '2031-06-15T23:30:00-03:00', enrolledAt: '2031-06-15T23:30:00-03:00', createdBy: 'admin', unassignedAssessmentIds: [] }];
  assert.equal(enrolledForLesson(db, 'c1', 'student', '2031-06-15'), true);
  assert.equal(enrolledForLesson(db, 'c1', 'student', '2031-06-14'), false);
});

test('Brasília civil exit day never grants attendance on the next day in a UTC server', () => {
  const db = fixture();
  db.enrollments = [{ id: 'tz-exit', classId: 'c1', studentId: 'student', email: 'aluno@exemplo.com', status: 'ended', createdAt: '2031-06-01T12:00:00-03:00', enrolledAt: '2031-06-01T12:00:00-03:00', endedAt: '2031-06-15T23:30:00-03:00', createdBy: 'admin', unassignedAssessmentIds: [] }];
  assert.equal(enrolledForLesson(db, 'c1', 'student', '2031-06-15'), true);
  assert.equal(enrolledForLesson(db, 'c1', 'student', '2031-06-16'), false);
});

test('Brasília exit also bounds dateless legacy marks independently of the host timezone', () => {
  const db = fixture();
  db.enrollments = [{ id: 'tz-legacy-exit', classId: 'c1', studentId: 'student', email: 'aluno@exemplo.com', status: 'ended', legacy: true, createdAt: '2031-06-15T23:30:00-03:00', endedAt: '2031-06-15T23:30:00-03:00', createdBy: 'admin', unassignedAssessmentIds: [] }];
  db.attendance = ['2031-06-15', '2031-06-16'].map(date => ({ id: `lesson-${date}`, subjectId: 's1', date, time: '19:00', records: { student: false } }));
  assert.equal(enrolledForLesson(db, 'c1', 'student', '2031-06-15'), true);
  assert.equal(enrolledForLesson(db, 'c1', 'student', '2031-06-16'), false);
});

function fixture(): MockDatabase {
  return migrateDatabase({
    version: 1, audit: [], enrollments: [],
    users: [
      { id: 'admin', name: 'Admin fictício', email: 'admin@exemplo.com', role: 'admin' },
      { id: 'teacher', name: 'Docente fictício', email: 'docente@exemplo.com', role: 'teacher' },
      { id: 'student', name: 'Aluno fictício', email: 'aluno@exemplo.com', role: 'student' }
    ],
    classes: ['c1', 'c2'].map(id => ({ id, name: id, code: id, year: 2026, shift: 'Noite', active: true, studentIds: [] })),
    subjects: [{ id: 's1', classId: 'c1', name: 'Disciplina', teacherIds: ['teacher'], color: 'blue', description: '' }],
    modules: [{ id: 'm1', subjectId: 's1', title: 'Módulo', description: '', order: 1 }],
    assessments: [
      { id: 'expired', moduleId: 'm1', title: 'Antiga', description: '', questionIds: [], deadline: '2026-11-01T12:00:00Z', status: 'published', allowLate: true },
      { id: 'open', moduleId: 'm1', title: 'Aberta', description: '', questionIds: [], deadline: '2026-11-03T12:00:00Z', status: 'published', required: false },
      { id: 'no-date', moduleId: 'm1', title: 'Sem prazo', description: '', questionIds: [], deadline: '', status: 'published' }
    ],
    materials: [], questions: [], attempts: [], topics: [], announcements: [], events: [], attendance: [], progress: []
  });
}
function command(db: MockDatabase, enrollment: NonNullable<MutationOptions['enrollment']>, actor = 'admin', timestamp = now) {
  return applyDemoMutation(db, actor, () => {}, { enrollment }, timestamp);
}
const add = (email = 'aluno@exemplo.com', classId = 'c1') => ({ type: 'add' as const, email, classId });

test('a reused old email cannot silently match the membership of another account', () => {
  const linked = command(fixture(), add());
  const changed = applyDemoMutation(linked, 'admin', d => { d.users[2].email = 'alterado@exemplo.com'; });
  const registered = command(changed, { type: 'register', id: 'new', name: 'Outra pessoa', email: 'aluno@exemplo.com' });
  const confirmed = command(registered, { type: 'confirm' }, 'new');
  assert.throws(() => command(confirmed, add()), /outra conta|histórico/i);
  assert.deepEqual(confirmed.classes[0].studentIds, ['student']);
});

test('legacy ended membership with unknown exit date never creates future attendance after class reactivation', () => {
  const legacy = fixture();
  legacy.classes[0].studentIds = ['student'];
  legacy.classes[0].active = false;
  legacy.attendance.push({ id: 'historic', subjectId: 's1', date: '2025-10-01', time: '19:00', records: { student: true } });
  const migrated = migrateDatabase(legacy);
  const reopened = applyDemoMutation(migrated, 'admin', d => { d.classes[0].active = true; });
  assert.equal(enrolledForLesson(reopened, 'c1', 'student', '2026-11-02'), false);
  assert.equal(enrolledForLesson(reopened, 'c1', 'student', '2025-10-01'), true);
  assert.throws(() => applyDemoMutation(reopened, 'teacher', d => { d.attendance.push({ id: 'future', subjectId: 's1', date: '2026-11-02', time: '19:00', records: { student: false } }); }), /matrícula/i);
});

test('administrator links an existing confirmed student exactly once using normalized email', () => {
  const db = command(fixture(), add('  ALUNO@exemplo.com '));
  assert.deepEqual(db.classes[0].studentIds, ['student']);
  assert.equal(db.enrollments[0].enrolledAt, now);
  assert.equal(db.enrollments[0].status, 'active');
  assert.deepEqual(command(db, add()), db);
  assert.ok(db.audit.some(e => e.collection === 'enrollments' && e.actorId === 'admin'));
  assert.equal(JSON.stringify(db.audit).includes('aluno@'), false);
});

test('reservation does not create a user or an active participant and duplicate click is idempotent', () => {
  const db = command(fixture(), add('futuro@exemplo.com'));
  assert.equal(db.users.length, 3);
  assert.equal(db.enrollments[0].status, 'pending');
  assert.deepEqual(db.classes[0].studentIds, []);
  assert.deepEqual(command(db, add('FUTURO@exemplo.com')), db);
});

test('registration then simulated confirmation consumes the reservation and never duplicates account or link', () => {
  const reserved = command(fixture(), add('futuro@exemplo.com'));
  const registered = command(reserved, { type: 'register', id: 'new', name: 'Aluno novo', email: 'futuro@exemplo.com' }, 'student');
  const person = registered.users.find(u => u.id === 'new')!;
  assert.equal(person.emailConfirmedAt, null);
  assert.equal(canAccessSubject(registered, person, 's1'), false);
  const confirmed = command(registered, { type: 'confirm' }, 'new');
  assert.equal(confirmed.users.find(u => u.id === 'new')!.emailConfirmedAt, now);
  assert.equal(confirmed.enrollments[0].status, 'active');
  assert.equal(canAccessSubject(confirmed, confirmed.users.find(u => u.id === 'new')!, 's1'), true);
  assert.deepEqual(command(confirmed, { type: 'confirm' }, 'new'), confirmed);
  assert.throws(() => command(confirmed, { type: 'register', id: 'another', name: 'Outro', email: 'futuro@exemplo.com' }), /cadastrado/i);
});

test('registration without reservation stays without class after confirmation until administrative inclusion', () => {
  const db = command(fixture(), { type: 'register', id: 'new', name: 'Aluno novo', email: 'novo@exemplo.com' });
  const confirmed = command(db, { type: 'confirm' }, 'new');
  assert.equal(confirmed.enrollments.length, 0);
  assert.equal(scopeDatabase(confirmed, confirmed.users.find(u => u.id === 'new')!).classes.length, 0);
  const linked = command(confirmed, add('novo@exemplo.com'));
  assert.deepEqual(linked.classes[0].studentIds, ['new']);
});

test('invalid email, nonstudent account, unavailable class and nonadministrative inclusion are denied', () => {
  const db = fixture();
  for (const email of ['invalid', 'docente@exemplo.com', 'admin@exemplo.com']) assert.throws(() => command(db, add(email)), /e-mail|aluno|cargo/i);
  for (const actor of ['student', 'teacher']) assert.throws(() => command(db, add(), actor), /administr|permiss/i);
  db.classes[0].active = false;
  assert.throws(() => command(db, add()), /turma|inativa/i);
  assert.throws(() => command(db, add('aluno@exemplo.com', 'missing')), /turma/i);
});

test('one active class is enforced against latest state without automatic transfer', () => {
  const db = command(fixture(), add());
  const snapshot = structuredClone(db);
  assert.throws(() => command(db, add('aluno@exemplo.com', 'c2')), /c1|outra turma/i);
  assert.deepEqual(db, snapshot);
  assert.throws(() => applyDemoMutation(db, 'admin', d => { d.classes[1].studentIds.push('student'); }), /turma/i);
});

test('cancelled reservation remains audited and cannot be consumed or silently restored', () => {
  const db = command(fixture(), add('errado@exemplo.com'));
  const cancelled = command(db, { type: 'cancel', id: db.enrollments[0].id });
  assert.equal(cancelled.enrollments[0].status, 'cancelled');
  assert.ok(cancelled.enrollments[0].deletedAt);
  assert.throws(() => command(cancelled, add('errado@exemplo.com')), /cancelad|excluíd/i);
  const corrected = command(cancelled, add('correto@exemplo.com'));
  assert.equal(corrected.enrollments.length, 2);
  const registered = command(corrected, { type: 'register', id: 'new', name: 'Aluno novo', email: 'errado@exemplo.com' });
  const confirmed = command(registered, { type: 'confirm' }, 'new');
  assert.deepEqual(confirmed.classes[0].studentIds, []);
  assert.equal(confirmed.enrollments[0].status, 'cancelled');
});

test('class closure cancels pending reservations and ends membership without deleting history', () => {
  const reserved = command(command(fixture(), add()), add('pendente@exemplo.com'));
  const closed = applyDemoMutation(reserved, 'admin', d => { d.classes[0].active = false; }, {}, now);
  assert.equal(closed.enrollments.find(e => e.status === 'pending'), undefined);
  assert.ok(closed.enrollments.some(e => e.status === 'cancelled'));
  assert.ok(closed.enrollments.some(e => e.status === 'ended'));
  assert.equal(canAccessSubject(closed, closed.users[2], 's1'), false);
  const reopened = applyDemoMutation(closed, 'admin', d => { d.classes[0].active = true; });
  assert.equal(canAccessSubject(reopened, reopened.users[2], 's1'), false);
  assert.equal(reopened.enrollments.length, 2);
});

test('confirmation conflict is atomic: account and pending records survive for explicit recovery', () => {
  let db = command(command(fixture(), add('novo@exemplo.com')), add('novo@exemplo.com', 'c2'));
  db = command(db, { type: 'register', id: 'new', name: 'Aluno novo', email: 'novo@exemplo.com' });
  const snapshot = structuredClone(db);
  assert.throws(() => command(db, { type: 'confirm' }, 'new'), /turma|pendência/i);
  assert.deepEqual(db, snapshot);
  const regularized = command(db, { type: 'cancel', id: db.enrollments.find(e => e.classId === 'c2')!.id });
  const retried = command(regularized, { type: 'confirm' }, 'new');
  assert.equal(retried.enrollments.filter(e => e.status === 'active').length, 1);
  assert.equal(retried.users.filter(u => u.email === 'novo@exemplo.com').length, 1);
});

test('late entrant can consult expired activity but cannot create or submit an attempt even with late acceptance', () => {
  const db = command(fixture(), add());
  assert.equal(scopeDatabase(db, db.users[2]).assessments.length, 3);
  assert.throws(() => applyDemoMutation(db, 'student', d => {
    d.attempts.push({ id: 'try', assessmentId: 'expired', userId: 'student', answers: {}, questionOrder: [], startedAt: now });
  }, {}, now), /consulta|matrícula/i);
  for (const id of ['open', 'no-date']) {
    const changed = applyDemoMutation(db, 'student', d => { d.attempts.push({ id: 'try', assessmentId: id, userId: 'student', answers: {}, questionOrder: [], startedAt: now }); }, {}, now);
    assert.equal(changed.attempts.length, 1);
  }
  assert.equal(db.assessments.find(a => a.id === 'open')!.required, false);
});

test('attendance before enrollment is not recorded as absence and new calls only include eligible students', () => {
  const db = command(fixture(), add());
  assert.throws(() => applyDemoMutation(db, 'teacher', d => {
    d.attendance.push({ id: 'old', subjectId: 's1', date: '2026-11-01', time: '19:00', records: { student: false } });
  }), /matrícula|anterio/i);
  const saved = applyDemoMutation(db, 'teacher', d => {
    d.attendance.push({ id: 'today', subjectId: 's1', date: '2026-11-02', time: '19:00', records: { student: true } });
  });
  assert.equal(saved.attendance.length, 1);
});

test('ending a link revokes open actions and preserves attempts and staff history', () => {
  const db = command(fixture(), add());
  db.attempts.push({ id: 'draft', assessmentId: 'open', userId: 'student', answers: { x: 0 }, questionOrder: [], startedAt: now });
  const ended = command(db, { type: 'end', id: db.enrollments[0].id });
  assert.equal(scopeDatabase(ended, ended.users[2]).subjects.length, 0);
  assert.throws(() => applyDemoMutation(ended, 'student', d => { d.attempts[0].submittedAt = now; }), /permiss|acesso/i);
  assert.deepEqual(ended.attempts, db.attempts);
  assert.equal(scopeDatabase(ended, ended.users[1]).enrollments.length, 1);
});

test('migration is idempotent and preserves legacy access, accounts, answers and original dates', () => {
  const db = fixture();
  delete (db as Partial<MockDatabase>).enrollments;
  db.classes[0].studentIds = ['student'];
  const migrated = migrateDatabase(db);
  assert.equal(migrated.enrollments.length, 1);
  assert.equal(canAccessSubject(migrated, migrated.users[2], 's1'), true);
  assert.equal(migrated.enrollments[0].legacy, true);
  assert.deepEqual(migrateDatabase(migrated), migrated);
  assert.deepEqual(migrated.users.map(u => u.id), db.users.map(u => u.id));
});

test('deleted and inactive accounts are never reactivated by inclusion or registration', () => {
  const db = fixture();
  db.users[2].deletedAt = now;
  assert.throws(() => command(db, add()), /conta|excluíd/i);
  assert.throws(() => command(db, { type: 'register', id: 'new', name: 'Aluno novo', email: 'aluno@exemplo.com' }), /cadastrado|conta/i);
  assert.equal(db.users[2].deletedAt, now);
});

test('pending emails and audit are private and confirmation cannot change another account', () => {
  const db = command(fixture(), add('secreto@exemplo.com'));
  assert.deepEqual(scopeDatabase(db, db.users[1]).enrollments, []);
  assert.deepEqual(scopeDatabase(db, db.users[2]).enrollments, []);
  assert.throws(() => applyDemoMutation(db, 'student', d => { d.users[1].emailConfirmedAt = now; }), /permiss|confirma/i);
});

test('all self-registration paths require confirmation and public registration survives an unavailable demo persona', () => {
  const db = fixture();
  const registered = applyDemoMutation(db, 'student', d => { d.users.push({ id: 'new', name: 'Aluno novo', email: 'novo@exemplo.com', role: 'student' }); });
  assert.equal(registered.users.find(u => u.id === 'new')!.emailConfirmedAt, null);
  db.users[2].active = false;
  const retried = command(db, { type: 'register', id: 'public', name: 'Cadastro público', email: 'publico@exemplo.com' }, 'student');
  assert.equal(retried.users.find(u => u.id === 'public')!.emailConfirmedAt, null);
});

test('late assignment snapshot survives deadline changes and excludes stale draft submissions', () => {
  const db = command(fixture(), add());
  const extended = applyDemoMutation(db, 'teacher', d => { d.assessments[0].deadline = '2026-12-01'; });
  assert.equal(isAssessmentAssigned(extended, extended.assessments[0], 'student'), false);
  assert.equal(isAssessmentAssigned(extended, extended.assessments[1], 'student'), true);
  extended.attempts.push({ id: 'stale', assessmentId: 'expired', userId: 'student', answers: { x: 0 }, questionOrder: [], startedAt: now });
  assert.throws(() => applyDemoMutation(extended, 'student', d => { d.attempts[0].submittedAt = now; }), /consulta|matrícula/i);
});

test('email changes require reconfirmation without automatically consuming another reservation', () => {
  const db = command(command(fixture(), add()), add('alterado@exemplo.com', 'c2'));
  const changed = applyDemoMutation(db, 'admin', d => { d.users[2].email = 'alterado@exemplo.com'; });
  assert.equal(changed.users[2].emailConfirmedAt, null);
  assert.equal(canAccessSubject(changed, changed.users[2], 's1'), false);
  assert.equal(changed.enrollments[1].status, 'pending');
  assert.throws(() => command(changed, { type: 'confirm' }, 'student'), /turma|vínculo/i);
  assert.equal(changed.users[2].emailConfirmedAt, null);
});

test('closed membership admits historical lesson review but excludes lessons before entry and after exit', () => {
  const db = command(fixture(), add());
  const ended = command(db, { type: 'end', id: db.enrollments[0].id }, 'admin', '2026-11-04T12:00:00Z');
  assert.equal(enrolledForLesson(ended, 'c1', 'student', '2026-11-01'), false);
  assert.equal(enrolledForLesson(ended, 'c1', 'student', '2026-11-03'), true);
  assert.equal(enrolledForLesson(ended, 'c1', 'student', '2026-11-05'), false);
  const saved = applyDemoMutation(ended, 'teacher', d => { d.attendance.push({ id: 'past', subjectId: 's1', date: '2026-11-03', time: '19:00', records: { student: true } }); });
  assert.equal(saved.attendance[0].records.student, true);
});

test('invalid registration, unavailable commands and stale cancellation fail without changing the source', () => {
  const db = fixture();
  for (const input of [{ name: 'A', email: 'ok@exemplo.com' }, { name: 'Aluno', email: 'invalid' }]) assert.throws(() => command(db, { type: 'register', id: 'new', ...input }), /válid/i);
  assert.throws(() => command(db, { type: 'confirm' }), /conta de aluno/i);
  assert.throws(() => command(db, { type: 'cancel', id: 'missing' }), /indisponível/i);
  const linked = command(db, add());
  assert.throws(() => command(linked, { type: 'cancel', id: linked.enrollments[0].id }), /mudou/i);
  assert.throws(() => applyDemoMutation(linked, 'admin', () => {}, { enrollment: { type: 'end', id: linked.enrollments[0].id }, expected: [{ collection: 'enrollments', id: linked.enrollments[0].id, revision: 0 }] }), /alterad/i);
  assert.deepEqual(db.classes[0].studentIds, []);
});

test('legacy multiple-class memberships require explicit regularization without blocking unrelated administration', () => {
  const legacy = fixture();
  legacy.classes[0].studentIds = ['student'];
  legacy.classes[1].studentIds = ['student'];
  delete (legacy as Partial<MockDatabase>).enrollments;
  const db = migrateDatabase(legacy);
  assert.equal(db.enrollments.length, 2);
  assert.equal(canAccessSubject(db, db.users[2], 's1'), false);
  assert.equal(scopeDatabase(db, db.users[2]).classes.length, 0);
  const unrelated = command(db, add('outra-pessoa@exemplo.com'));
  assert.deepEqual(unrelated.classes.map(c => c.studentIds), [['student'], ['student']]);
  const resolved = command(unrelated, { type: 'end', id: unrelated.enrollments.find(e => e.classId === 'c2')!.id });
  assert.equal(canAccessSubject(resolved, resolved.users[2], 's1'), true);
  assert.equal(resolved.enrollments.filter(e => e.status === 'ended').length, 1);
});

test('reconfirmed email keeps the same account membership and enrollment date on repeated inclusion', () => {
  const linked = command(fixture(), add());
  const changed = applyDemoMutation(linked, 'admin', d => { d.users[2].email = 'novo-endereco@exemplo.com'; });
  const confirmed = command(changed, { type: 'confirm' }, 'student');
  assert.deepEqual(command(confirmed, add('novo-endereco@exemplo.com')), confirmed);
  assert.equal(confirmed.enrollments[0].enrolledAt, now);
});

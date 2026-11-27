import test from 'node:test';
import assert from 'node:assert/strict';
import type { MockDatabase } from '../src/models/database.ts';
import { canAccessSubject, canManageSubject, scopeDatabase } from '../src/lib/access.ts';
import { applyDemoMutation } from './support/legacy/demo-mutations.ts';
import { migrateDatabase } from './support/legacy/demo-storage.ts';
import { saveAttemptAnswers, submitAttempt } from './support/legacy/assessment-attempts.ts';

function fixture(): MockDatabase {
  return {
    version: 1, audit: [], enrollments: [],
    users: [
      { id: 'a', name: 'Admin', email: 'admin@exemplo.com', role: 'admin' },
      { id: 't1', name: 'Docente Um', email: 'um@exemplo.com', role: 'teacher' },
      { id: 't2', name: 'Docente Dois', email: 'dois@exemplo.com', role: 'teacher' },
      { id: 's1', name: 'Aluno Um', email: 'aluno@exemplo.com', role: 'student' },
      { id: 's2', name: 'Aluno Dois', email: 'outro@exemplo.com', role: 'student' }
    ],
    classes: [
      { id: 'c1', name: 'Turma', code: 'T1', year: 2026, shift: 'Noite', active: true, studentIds: ['s1'] },
      { id: 'c2', name: 'Outra', code: 'T2', year: 2026, shift: 'Tarde', active: true, studentIds: ['s2'] }
    ],
    subjects: [
      { id: 'd1', classId: 'c1', name: 'Uma', teacherIds: ['t1', 't2'], color: 'blue', description: '' },
      { id: 'd2', classId: 'c2', name: 'Outra', teacherIds: ['t2'], color: 'blue', description: '' }
    ],
    modules: [{ id: 'm1', subjectId: 'd1', title: 'Módulo', description: '', order: 1 }, { id: 'm2', subjectId: 'd2', title: 'Outro', description: '', order: 1 }],
    materials: [{ id: 'p1', moduleId: 'm1', title: 'Texto', content: '', kind: 'lesson', duration: 1, order: 1, authorId: 't1' }],
    assessments: [{ id: 'q1', moduleId: 'm1', title: 'Questões', description: '', questionIds: [], deadline: '2026-12-01', status: 'published' }],
    attempts: [{ id: 'try1', assessmentId: 'q1', userId: 's1', answers: {}, questionOrder: [], startedAt: '2026-11-01' }],
    questions: [], topics: [], announcements: [], events: [], attendance: [], progress: []
  };
}

test('video mutations reject unsafe sources without changing existing data and preserve legacy materials', () => {
  const db = fixture();
  const original = structuredClone(db);
  assert.throws(() => applyDemoMutation(db, 't1', d => { Object.assign(d.materials[0], { kind: 'video', videoUrl: 'javascript:alert(1)' }); }), /URL HTTPS/);
  assert.deepEqual(db, original);
  const legacy = applyDemoMutation(db, 't1', d => { d.materials[0].kind = 'video'; });
  assert.equal(legacy.materials[0].videoUrl, undefined);
  const valid = applyDemoMutation(db, 't1', d => { Object.assign(d.materials[0], { kind: 'video', videoUrl: 'https://example.org/video' }); });
  assert.equal(valid.materials[0].videoUrl, 'https://example.org/video');
  assert.equal(migrateDatabase(valid).materials[0].videoUrl, 'https://example.org/video');
});

test('material editing preserves colleagues changes, refuses revoked access and hides soft deleted content', () => {
  const db = fixture();
  const first = applyDemoMutation(db, 't1', d => { d.materials[0].title = 'Versão atual'; }, { expected: [{ collection: 'materials', id: 'p1', revision: 0 }] });
  assert.throws(() => applyDemoMutation(first, 't2', d => { d.materials[0].content = 'Local'; }, { expected: [{ collection: 'materials', id: 'p1', revision: 0 }] }), /alterad|versão/i);
  assert.equal(first.materials[0].title, 'Versão atual');
  const revoked = structuredClone(first);
  revoked.subjects[0].teacherIds = ['t1'];
  assert.throws(() => applyDemoMutation(revoked, 't2', d => { d.materials[0].title = 'Sem acesso'; }), /permissão/);
  const removed = applyDemoMutation(first, 't1', d => { d.materials[0].deletedAt = '2026-11-02T08:00:00Z'; });
  assert.equal(removed.materials.length, 1);
  assert.equal(scopeDatabase(removed, removed.users[3]).materials.length, 0);
  assert.equal(removed.audit.at(-1)?.action, 'delete');
});

test('assigned colleagues have equal access without gaining another discipline', () => {
  const db = fixture();
  assert.equal(canManageSubject(db, db.users[1], 'd1'), true);
  assert.equal(canManageSubject(db, db.users[2], 'd1'), true);
  assert.equal(canAccessSubject(db, db.users[1], 'd2'), false);
  assert.equal(canManageSubject(db, db.users[3], 'd1'), false);
  const scoped = scopeDatabase(db, db.users[1]);
  assert.deepEqual(scoped.subjects.map(s => s.id), ['d1']);
  assert.equal(scoped.users.find(u => u.id === 's2')?.email ?? '', '');
});

test('students see only their own academic data and lose direct access after unlinking', () => {
  const db = fixture();
  db.attempts.push({ ...db.attempts[0], id: 'private', userId: 's2' });
  db.attendance.push({ id: 'roll', subjectId: 'd1', date: '2026-11-01', time: '19:00', records: { s1: true, s2: false } });
  const scoped = scopeDatabase(db, db.users[3]);
  assert.deepEqual(scoped.attempts.map(a => a.id), ['try1']);
  assert.deepEqual(scoped.attendance[0].records, { s1: true });
  assert.equal(scoped.users.find(u => u.id === 's2')?.email ?? '', '');
  db.classes[0].studentIds = [];
  assert.equal(canAccessSubject(db, db.users[3], 'd1'), false);
  assert.equal(scopeDatabase(db, db.users[3]).assessments.length, 0);
});

test('migration preserves singular teaching assignments and operational state without retired fields', () => {
  const db = fixture();
  const legacy = db.subjects[0] as unknown as Record<string, unknown>;
  delete legacy.teacherIds;
  legacy.teacherId = 't1';
  Object.assign(db.users[1], { active: false, revision: 2, deletedAt: '2026-10-01', avatar: 'private' });
  const migrated = migrateDatabase(db);
  assert.deepEqual(migrated.subjects[0].teacherIds, ['t1']);
  assert.equal('teacherId' in migrated.subjects[0], false);
  assert.equal(migrated.users[1].active, false);
  assert.equal(migrated.users[1].revision, 2);
  assert.equal('avatar' in migrated.users[1], false);
});

test('mutations enforce current assignments, administrative boundaries and preserve authorship', () => {
  const db = fixture();
  const changed = applyDemoMutation(db, 't2', d => { d.materials[0].title = 'Atualizado'; });
  assert.equal(changed.materials[0].authorId, 't1');
  assert.equal(changed.materials[0].updatedBy, 't2');
  assert.equal(changed.materials[0].revision, 1);
  assert.throws(() => applyDemoMutation(db, 't1', d => { d.subjects[0].name = 'Proibido'; }), /permiss|administr/i);
  db.subjects[0].teacherIds = ['t2'];
  assert.throws(() => applyDemoMutation(db, 't1', d => { d.materials[0].title = 'Revogado'; }), /permiss|acesso/i);
  assert.equal(db.materials[0].title, 'Texto');
});

test('stale revision rejects saving without losing local input or changing latest record', () => {
  const db = applyDemoMutation(fixture(), 't1', d => { d.modules[0].title = 'Primeira edição'; });
  const local = 'Texto mantido pelo segundo editor';
  assert.throws(() => applyDemoMutation(db, 't2', d => { d.modules[0].title = local; }, { expected: [{ collection: 'modules', id: 'm1', revision: 0 }] }), /alterad|versão|conflito/i);
  assert.equal(db.modules[0].title, 'Primeira edição');
  const saved = applyDemoMutation(db, 't2', d => { d.modules[0].title = local; }, { expected: [{ collection: 'modules', id: 'm1', revision: 1 }] });
  assert.equal(saved.modules[0].title, local);
  assert.equal(saved.modules[0].revision, 2);
});

test('logical teacher deletion revokes assignments but preserves academic history and minimal audit', () => {
  const db = fixture();
  const next = applyDemoMutation(db, 'a', d => { d.users[1].active = false; d.users[1].deletedAt = '2026-11-01'; });
  assert.deepEqual(next.subjects[0].teacherIds, ['t2']);
  assert.equal(next.materials[0].authorId, 't1');
  assert.equal(next.attempts.length, 1);
  assert.equal(canAccessSubject(next, next.users[1], 'd1'), false);
  assert.ok(next.audit.some(event => event.actorId === 'a' && event.targetId === 't1'));
  assert.ok(next.audit.some(event => event.collection === 'teachingAssignments' && event.targetId === 'd1:t1' && event.action === 'delete'));
  assert.equal(JSON.stringify(next.audit).includes('um@exemplo.com'), false);
  assert.throws(() => applyDemoMutation(db, 'a', d => { d.users[0].active = false; }), /administrador/i);
  assert.throws(() => applyDemoMutation(db, 'a', d => { d.users.splice(1, 1); }), /lógica/i);
});

test('submitted answers cannot be overwritten by stale autosave or a second submission', () => {
  const db = fixture();
  const submitted = applyDemoMutation(db, 's1', d => { d.attempts[0].submittedAt = '2026-11-01T10:00:00Z'; d.attempts[0].answers = { x: 0 }; });
  assert.throws(() => applyDemoMutation(submitted, 's1', d => { d.attempts[0].answers = { x: 1 }; delete d.attempts[0].submittedAt; }), /enviado/i);
  assert.equal(submitted.attempts[0].submittedAt, '2026-11-01T10:00:00Z');
});

test('later independent operations preserve the first submission and revalidate concurrent sends', () => {
  const original = fixture();
  const firstTab = applyDemoMutation(original, 's1', d => { d.attempts[0].submittedAt = '2026-11-01T10:00:00Z'; d.attempts[0].answers = { x: 0 }; });
  const originalSubmission = structuredClone(firstTab.attempts[0]);
  assert.throws(() => applyDemoMutation(firstTab, 's1', d => { d.attempts[0].submittedAt = '2026-11-01T10:00:01Z'; }), /enviado/i);
  const unrelated = applyDemoMutation(firstTab, 't2', d => { d.materials[0].title = 'Outro trabalho'; });
  assert.deepEqual(unrelated.attempts[0], originalSubmission);
  assert.equal(original.attempts[0].submittedAt, undefined);
});

test('deleted content is absent for every role and teacher drafts never expose answers', () => {
  const db = fixture();
  db.materials[0].deletedAt = '2026-11-01';
  db.announcements.push({ id: 'gone', classId: 'c1', authorId: 't1', title: 'Excluído', body: '', createdAt: '2026-11-01', notify: false, deletedAt: '2026-11-01' });
  for (const person of db.users.slice(0, 4)) {
    const scoped = scopeDatabase(db, person);
    assert.equal(scoped.materials.length, 0);
    assert.equal(scoped.announcements.length, 0);
  }
  assert.equal(scopeDatabase(db, db.users[1]).attempts.length, 0);
  assert.equal(scopeDatabase(db, db.users[3]).attempts.length, 1);
  db.users[1].active = false;
  assert.equal(scopeDatabase(db, db.users[1]).subjects.length, 0);
  assert.throws(() => applyDemoMutation(db, 't1', d => { d.materials[0].title = 'Inativo'; }), /inativa/i);
});

test('registration and edit commands reject escalation, mismatched context and invalid assignments', () => {
  const db = fixture();
  assert.throws(() => applyDemoMutation(db, 's1', d => { d.users.push({ id: 'hack', name: 'Outro', email: 'novo@exemplo.com', role: 'admin' }); }), /permiss/i);
  assert.throws(() => applyDemoMutation(db, 'a', d => { d.subjects[0].teacherIds.push('s1'); }), /docentes/i);
  assert.throws(() => applyDemoMutation(db, 't1', d => { d.announcements.push({ id: 'wrong', classId: 'c2', subjectId: 'd1', authorId: 't1', title: 'Aviso', body: 'Texto', createdAt: '2026-11-01', notify: false }); }), /turma/i);
  assert.throws(() => applyDemoMutation(db, 'a', d => { d.users[1].email = db.users[0].email.toUpperCase(); }), /e-mail/i);
  const registered = applyDemoMutation(db, 's1', d => { d.users.push({ id: 'new', name: 'Novo Aluno', email: 'novo@exemplo.com', role: 'student' }); });
  assert.equal(registered.users.at(-1)?.role, 'student');
  assert.equal(registered.classes.some(c => c.studentIds.includes('new')), false);
});

test('question edits reset unfinished drafts and submitted content blocks structural edits', () => {
  const db = fixture();
  db.questions = [{ id: 'different', subject: 'Matemática', topic: 'Funções', difficulty: 'easy', institution: 'AJA', year: 2026, statement: 'Enunciado', options: ['A', 'B'], correct: 0, explanation: 'Resolução' }];
  db.attempts[0].answers = { old: 0 };
  const updated = applyDemoMutation(db, 't2', d => { d.assessments[0].questionIds = ['different']; });
  assert.deepEqual(updated.attempts[0].answers, {});
  assert.deepEqual(updated.attempts[0].questionOrder, ['different']);
  assert.ok(updated.attempts[0].questionsUpdatedAt);
  assert.equal(updated.attempts[0].id, db.attempts[0].id);
  assert.equal(updated.attempts[0].startedAt, db.attempts[0].startedAt);
  assert.throws(() => applyDemoMutation(updated, 's1', d => { d.attempts[0].answers = { old: 0 }; }, { expected: [{ collection: 'attempts', id: 'try1', revision: 0 }] }), /alterado/i);
  const corrected = applyDemoMutation(db, 't2', d => { d.assessments[0].title = 'Título corrigido'; d.assessments[0].deadline = '2026-12-02'; });
  assert.equal(corrected.assessments[0].title, 'Título corrigido');
  assert.deepEqual(corrected.attempts[0].answers, { old: 0 });
  db.attempts[0].submittedAt = '2026-11-01';
  assert.throws(() => applyDemoMutation(db, 't2', d => { d.assessments[0].questionIds = ['different']; }), /entrega/i);
  db.classes[0].active = false;
  assert.equal(canAccessSubject(db, db.users[1], 'd1'), true);
  assert.equal(canManageSubject(db, db.users[1], 'd1'), false);
});

test('last active administrator cannot be demoted, inactivated or logically deleted', () => {
  const db = fixture();
  db.users.push({ id: 'inactive-admin', name: 'Admin Inativo', email: 'inativo@exemplo.com', role: 'admin', active: false });
  const original = structuredClone(db);
  for (const change of [
    (d: MockDatabase) => { d.users[0].role = 'teacher'; },
    (d: MockDatabase) => { d.users[0].active = false; },
    (d: MockDatabase) => { d.users[0].deletedAt = '2026-11-01T10:00:00Z'; }
  ]) {
    assert.throws(() => applyDemoMutation(db, 'a', change), /último administrador ativo/i);
    assert.deepEqual(db, original, 'a refused operation leaves every record and audit event untouched');
  }
  db.users.at(-1)!.active = true;
  const changed = applyDemoMutation(db, 'a', d => { d.users[0].role = 'teacher'; });
  assert.equal(changed.users[0].role, 'teacher');
  assert.equal(changed.users.at(-1)?.role, 'admin');
});

test('sharing a class does not give a teacher access to another assigned discipline', () => {
  const db = fixture();
  db.subjects[1].classId = 'c1';
  db.materials.push({ ...db.materials[0], id: 'p2', moduleId: 'm2', title: 'Disciplina de outra equipe' });
  db.assessments.push({ ...db.assessments[0], id: 'q2', moduleId: 'm2' });
  db.attempts.push({ ...db.attempts[0], id: 'private', assessmentId: 'q2', submittedAt: '2026-11-01' });
  db.announcements.push({ id: 'other', classId: 'c1', subjectId: 'd2', authorId: 't2', title: 'Aviso restrito', body: '', createdAt: '2026-11-01', notify: false });
  const scoped = scopeDatabase(db, db.users[1]);
  assert.deepEqual(scoped.classes.map(c => c.id), ['c1']);
  assert.deepEqual(scoped.subjects.map(s => s.id), ['d1']);
  assert.deepEqual(scoped.materials.map(m => m.id), ['p1']);
  assert.deepEqual(scoped.assessments.map(a => a.id), ['q1']);
  assert.equal(scoped.attempts.some(a => a.id === 'private'), false);
  assert.equal(scoped.announcements.length, 0);
  assert.throws(() => applyDemoMutation(db, 't1', d => { d.materials[1].title = 'Acesso indevido'; }), /permissão/i);
  assert.equal(canAccessSubject(db, db.users[3], 'd2'), true, 'the student has access through their class membership');
});

test('general class notices are readable by assigned teachers but only administrators can publish them', () => {
  const db = fixture();
  const publish = (d: MockDatabase) => d.announcements.push({ id: 'general', classId: 'c1', authorId: 'a', title: 'Toda a turma', body: 'Mensagem', createdAt: '2026-11-01', notify: true });
  assert.throws(() => applyDemoMutation(db, 't1', publish), /permissão/i);
  const published = applyDemoMutation(db, 'a', publish);
  assert.equal(published.announcements[0].authorId, 'a');
  assert.equal(scopeDatabase(published, db.users[1]).announcements[0].id, 'general');
  assert.throws(() => applyDemoMutation(published, 't1', d => { d.announcements[0].body = 'Outra mensagem'; }), /permissão/i);
});

test('a pending editor action rechecks revocation, exclusion and account state against the latest data', () => {
  const db = fixture();
  const pendingEdit = (d: MockDatabase) => { d.materials[0].title = 'Preenchimento local preservado'; };
  const revoked = applyDemoMutation(db, 'a', d => { d.subjects[0].teacherIds = ['t2']; });
  assert.throws(() => applyDemoMutation(revoked, 't1', pendingEdit), /permissão/i);
  assert.equal(revoked.materials[0].title, 'Texto');
  const removed = applyDemoMutation(db, 't2', d => { d.materials[0].deletedAt = '2026-11-01'; });
  assert.throws(() => applyDemoMutation(removed, 't1', pendingEdit, { expected: [{ collection: 'materials', id: 'p1', revision: 0 }] }), /retirado/i);
  assert.throws(() => applyDemoMutation(removed, 't1', pendingEdit), /excluído/i);
  const inactive = applyDemoMutation(db, 'a', d => { d.users[1].active = false; });
  assert.throws(() => applyDemoMutation(inactive, 't1', pendingEdit), /inativa/i);
  assert.equal(inactive.materials[0].title, 'Texto');
});

test('account and assignment changes record actor, action, target and time without copying personal data', () => {
  const db = fixture();
  const now = '2026-11-01T12:34:56.000Z';
  const next = applyDemoMutation(db, 'a', d => { d.users[1].role = 'student'; }, {}, now);
  assert.equal(next.users[1].updatedBy, 'a');
  assert.equal(next.users[1].updatedAt, now);
  assert.equal(next.users[1].revision, 1);
  assert.equal(next.subjects[0].revision, 1);
  const minimalEvents = next.audit.map(({ id, ...event }) => {
    assert.match(id, /^audit-/);
    return event;
  });
  assert.deepEqual(minimalEvents, [
    { actorId: 'a', action: 'update', collection: 'users', targetId: 't1', createdAt: now },
    { actorId: 'a', action: 'update', collection: 'subjects', targetId: 'd1', createdAt: now },
    { actorId: 'a', action: 'delete', collection: 'teachingAssignments', targetId: 'd1:t1', createdAt: now }
  ]);
  const assigned = applyDemoMutation(next, 'a', d => { d.subjects[1].teacherIds.push('t2'); });
  assert.equal(assigned.audit.filter(event => event.collection === 'teachingAssignments').length, 1, 'an unchanged relation does not create a duplicate assignment audit event');
  const reassigned = applyDemoMutation(next, 'a', d => { d.users[1].role = 'teacher'; d.subjects[1].teacherIds.push('t1'); }, {}, now);
  assert.deepEqual(reassigned.subjects[0].teacherIds, ['t2'], 'returning to a role never silently restores old assignments');
  assert.deepEqual(reassigned.audit.at(-1) && { ...reassigned.audit.at(-1), id: undefined }, { id: undefined, actorId: 'a', action: 'create', collection: 'teachingAssignments', targetId: 'd2:t1', createdAt: now });
  assert.equal(JSON.stringify(next.audit).includes(db.users[1].email), false);
  assert.equal(JSON.stringify(next.audit).includes(db.users[1].name), false);
});

test('consecutive autosaves use the question version and preserve the most recent input', () => {
  const db = fixture();
  const firstInput = { first: 0 };
  const secondInput = { first: 1, second: 2 };
  const first = applyDemoMutation(db, 's1', d => saveAttemptAnswers(d, 'try1', firstInput));
  const second = applyDemoMutation(first, 's1', d => saveAttemptAnswers(d, 'try1', secondInput));
  assert.deepEqual(first.attempts[0].answers, firstInput);
  assert.deepEqual(second.attempts[0].answers, secondInput);
  assert.equal(second.attempts[0].revision, 2);
  assert.equal(second.attempts[0].questionsUpdatedAt, undefined);
  secondInput.first = 99;
  assert.equal(second.attempts[0].answers.first, 1, 'the saved answers do not share the component input object');
  assert.throws(() => saveAttemptAnswers(db, 'missing', {}), /indisponível/i);
});

test('a question update resets every old draft and rejects stale autosave and submit payloads', () => {
  const db = fixture();
  db.questions = ['new1', 'new2'].map(id => ({ id, subject: 'Matemática', topic: 'Funções', difficulty: 'easy', institution: 'AJA', year: 2026, statement: 'Enunciado', options: ['A', 'B'], correct: 0, explanation: 'Resolução' }));
  db.attempts[0].answers = { old: 0 };
  db.attempts.push({ ...structuredClone(db.attempts[0]), id: 'other-draft', userId: 's2', answers: { old: 1 } });
  const originalStarts = db.attempts.map(a => a.startedAt);
  const now = '2026-11-01T13:00:00.000Z';
  const changed = applyDemoMutation(db, 't2', d => { d.assessments[0].questionIds = ['new1', 'new2']; }, {}, now);
  for (const attempt of changed.attempts) {
    assert.deepEqual(attempt.answers, {});
    assert.deepEqual(attempt.questionOrder, ['new1', 'new2']);
    assert.equal(attempt.questionsUpdatedAt, now);
    assert.equal(attempt.updatedBy, 't2');
    assert.equal(attempt.revision, 1);
  }
  assert.deepEqual(changed.attempts.map(a => a.id), ['try1', 'other-draft']);
  assert.deepEqual(changed.attempts.map(a => a.startedAt), originalStarts);
  assert.throws(() => applyDemoMutation(changed, 's1', d => saveAttemptAnswers(d, 'try1', { old: 1 })), /questões foram atualizadas/i);
  assert.throws(() => applyDemoMutation(changed, 's1', d => submitAttempt(d, 'try1', { old: 1 }, now)), /questões foram atualizadas/i);
  const resumed = applyDemoMutation(changed, 's1', d => saveAttemptAnswers(d, 'try1', { new1: 0 }, now));
  const submitted = applyDemoMutation(resumed, 's1', d => submitAttempt(d, 'try1', { new1: 0 }, '2026-11-01T13:05:00.000Z', now));
  assert.equal(submitted.attempts[0].submittedAt, '2026-11-01T13:05:00.000Z');
  assert.deepEqual(submitted.attempts[0].answers, { new1: 0 });
});

test('an autosave arriving after submission is a no-op and preserves the original receipt', () => {
  const db = fixture();
  const timestamp = '2026-11-01T14:00:00.000Z';
  const submitted = applyDemoMutation(db, 's1', d => submitAttempt(d, 'try1', { original: 0 }, timestamp));
  const snapshot = structuredClone(submitted);
  const afterPendingSave = applyDemoMutation(submitted, 's1', d => saveAttemptAnswers(d, 'try1', { stale: 1 }));
  assert.deepEqual(afterPendingSave, snapshot);
  assert.equal(afterPendingSave.attempts[0].submittedAt, timestamp);
  assert.throws(() => applyDemoMutation(afterPendingSave, 's1', d => submitAttempt(d, 'try1', { stale: 1 }, '2026-11-01T14:01:00.000Z')), /já foi enviado/i);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import type { MockDatabase } from '../src/models/database.ts';
import { applyDemoMutation } from '../src/lib/demo-mutations.ts';
import { migrateDatabase } from '../src/lib/demo-storage.ts';
import { scopeDatabase } from '../src/lib/access.ts';

function seed(): MockDatabase {
  return { version: 1, audit: [], enrollments: [], submissions: [], users: [
    { id: 'a', name: 'Admin', email: 'a@example.org', role: 'admin' },
    { id: 'p', name: 'Professor', email: 'p@example.org', role: 'teacher' },
    { id: 's', name: 'Aluno', email: 's@example.org', role: 'student' },
    { id: 'x', name: 'Colega', email: 'x@example.org', role: 'student' }
  ], classes: [{ id: 'c', name: 'Turma', code: 'C', year: 2026, shift: 'Noite', active: true, studentIds: ['s', 'x'] }],
  subjects: [{ id: 'd', classId: 'c', name: 'Disciplina', teacherIds: ['p'], color: 'blue', description: '' }],
  topics: [{ id: 't', classId: 'c', subjectId: 'd', authorId: 's', title: 'Uma pergunta', body: 'Dúvida', tags: [], createdAt: '2026-11-01', readBy: ['s', 'x'], replies: [
    { id: 'r', authorId: 'p', body: 'Resposta', createdAt: '2026-11-01', votes: {}, accepted: false }
  ] }], modules: [], materials: [], questions: [], assessments: [], attempts: [], announcements: [], events: [], attendance: [], progress: [] };
}
test('new reply invalidates other readers, preserves old replies and latest concurrent votes', () => {
  const db = seed();
  const next = applyDemoMutation(db, 'x', d => { d.topics[0].replies.push({ id: 'r2', authorId: 'x', body: 'Palavra exclusiva', createdAt: '2026-11-02', votes: {}, accepted: false }); });
  assert.deepEqual(next.topics[0].readBy, ['x']);
  const voted = applyDemoMutation(next, 's', d => { d.topics[0].replies[0].votes.s = 1; });
  assert.deepEqual(voted.topics[0].readBy, ['x']);
  assert.equal(voted.topics[0].replies.length, 2);
});
test('all roles reject negative/self/foreign votes, spoofing and blank replies atomically', () => {
  for (const actor of ['s', 'p', 'a']) {
    const db = seed();
    assert.throws(() => applyDemoMutation(db, actor, d => { (d.topics[0].replies[0].votes as Record<string, number>)[actor] = -1; }));
    assert.throws(() => applyDemoMutation(db, actor, d => { d.topics[0].replies.push({ id: 'bad', authorId: 'x', body: ' ', votes: {}, accepted: false, createdAt: '2026-11-02' }); }));
  }
  assert.throws(() => applyDemoMutation(seed(), 'p', d => { d.topics[0].replies[0].votes.p = 1; }));
  assert.throws(() => applyDemoMutation(seed(), 's', d => { d.topics[0].replies[0].votes.x = 1; }));
});
test('reply soft delete clears solution without losing body, votes or audit evidence', () => {
  const db = seed(); db.topics[0].replies[0].accepted = true;
  const next = applyDemoMutation(db, 'p', d => { Object.assign(d.topics[0].replies[0], { deletedAt: '2026-11-02' }); });
  assert.equal(next.topics[0].replies[0].accepted, false);
  assert.equal(next.topics[0].replies[0].body, 'Resposta');
  assert.equal(scopeDatabase(next, next.users[2]).topics[0].replies.length, 0);
  assert.ok(next.audit.some(a => a.collection === 'forumReplies' && a.targetId === 'r' && a.action === 'delete'));
});
test('solution is unique, allowed to author and assigned teachers; revoked access rejects', () => {
  const db = seed();
  assert.throws(() => applyDemoMutation(db, 'x', d => { d.topics[0].replies[0].accepted = true; }));
  assert.equal(applyDemoMutation(db, 'p', d => { d.topics[0].replies[0].accepted = true; }).topics[0].replies[0].accepted, true);
  db.subjects[0].teacherIds = [];
  assert.throws(() => applyDemoMutation(db, 'p', d => { d.topics[0].replies[0].accepted = true; }));
  db.classes[0].studentIds = [];
  assert.throws(() => applyDemoMutation(db, 's', d => { d.topics[0].readBy.push('s'); d.topics[0].replies[0].accepted = true; }));
});
test('legacy negative vote migration is idempotent and records minimal trace', () => {
  const db = seed(); Object.assign(db.topics[0].replies[0].votes, { x: -1, s: 1 });
  const next = migrateDatabase(db);
  assert.deepEqual(next.topics[0].replies[0].votes, { s: 1 });
  assert.ok(next.audit.some(a => a.collection === 'forumVotes' && a.targetId === 'r'));
  assert.deepEqual(migrateDatabase(next), next);
});

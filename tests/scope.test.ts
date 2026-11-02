import test from 'node:test';
import assert from 'node:assert/strict';
import type { MockDatabase } from '../src/models/database.ts';
import { isDatabase, migrateDatabase, readDemoState } from '../src/lib/demo-storage.ts';
import { compareTimestamps, lastAccessedMaterial } from '../src/lib/study-order.ts';
import { beginAttempt, submitAttempt } from '../src/lib/assessment-attempts.ts';

function legacy() {
  return {
    version: 1,
    users: [{ id: 'u', name: 'Aluno Exemplo', email: 'aluno@exemplo.com', role: 'student', quota: 'income', course: 'Curso', institution: 'Alvo', bio: 'Texto privado', avatar: 'data:image/png;base64,old' }],
    classes: [{ id: 'c', studentIds: ['u'] }], subjects: [], modules: [], materials: [],
    questions: [{ id: 'q1', institution: 'Origem', options: ['A', 'B'], correct: 0 }],
    assessments: [{ id: 'a', status: 'published', questionIds: ['q1', 'q2'], shuffle: true, attempts: 3 }],
    attempts: [{ id: 'old', assessmentId: 'a', userId: 'u', startedAt: '2026-10-01', questionOrder: ['q2', 'q1'], answers: { q2: 1 } }],
    topics: [{ id: 't', replies: [{ id: 'r', votes: { positive: 1, negative: -1 }, accepted: true }] }],
    documents: [{ name: 'laudo-ficticio.pdf', reason: 'Informação removida' }],
    announcements: [], events: [], attendance: [], progress: [{ userId: 'u', materialId: 'm', completed: true }]
  } as unknown as MockDatabase;
}

test('migration removes retired personal data and documents without losing accounts, links or answers', () => {
  const before = legacy();
  assert.equal(isDatabase(before), true);
  const after = migrateDatabase(before);
  assert.deepEqual(after.users, [{ id: 'u', name: 'Aluno Exemplo', email: 'aluno@exemplo.com', role: 'student' }]);
  assert.equal('documents' in after, false);
  assert.deepEqual(after.classes, before.classes);
  assert.deepEqual(after.attempts, before.attempts);
  assert.deepEqual(after.progress, before.progress);
  assert.equal(after.questions[0].institution, 'Origem');
  assert.equal('quota' in before.users[0], true, 'migration does not mutate its input');
  assert.deepEqual(migrateDatabase(after), after, 'migration is idempotent');
  assert.equal(isDatabase(after), true);
  assert.equal(isDatabase({ ...after, attempts: null }), false);
});

test('migration removes shuffle and configurable attempts and discards negative votes without promoting them', () => {
  const after = migrateDatabase(legacy());
  assert.equal('shuffle' in after.assessments[0], false);
  assert.equal('attempts' in after.assessments[0], false);
  assert.deepEqual(after.topics[0].replies[0].votes, { positive: 1 });
  assert.equal(after.topics[0].replies[0].accepted, true);
});

test('new attempt uses teacher order; repeated starts resume existing answers and legacy order', () => {
  const db = migrateDatabase(legacy());
  const old = structuredClone(db.attempts[0]);
  beginAttempt(db, 'a', 'u', 'ignored', '2026-10-02');
  assert.deepEqual(db.attempts, [old]);
  beginAttempt(db, 'a', 'other', 'new', '2026-10-02');
  assert.deepEqual(db.attempts[1].questionOrder, ['q1', 'q2']);
  assert.deepEqual(db.attempts[1].answers, {});
  assert.throws(() => beginAttempt(db, 'missing', 'u', 'x', ''), /indisponível/);
});

test('one submission survives duplicate calls, legacy unfinished drafts and requests after a completed attempt', () => {
  const db = migrateDatabase(legacy());
  db.attempts.push({ ...structuredClone(db.attempts[0]), id: 'duplicate' });
  submitAttempt(db, 'old', { q2: 0 }, '2026-10-03');
  const saved = structuredClone(db.attempts[0]);
  assert.throws(() => submitAttempt(db, 'old', { q2: 1 }, '2026-10-04'), /enviado/);
  assert.throws(() => submitAttempt(db, 'duplicate', {}, '2026-10-04'), /enviado/);
  assert.throws(() => beginAttempt(db, 'a', 'u', 'new', ''), /enviado/);
  assert.deepEqual(db.attempts[0], saved);
  assert.deepEqual(db.attempts[1].answers, { q2: 1 });
  assert.throws(() => submitAttempt(db, 'missing', {}, ''), /encontrada/);
});

function storage(value: string | null = null) {
  return {
    getItem: (_key: string) => value,
    setItem: (_key: string, next: string) => { value = next; },
    removeItem: (_key: string) => { value = null; }
  };
}

test('blocked migration write keeps migrated accounts in memory and restores teacher or admin session', () => {
  for (const role of ['teacher', 'admin'] as const) {
    for (const error of ['QuotaExceededError', 'SecurityError']) {
      const local = storage(JSON.stringify(legacy()));
      local.setItem = () => { throw new DOMException('Blocked', error); };
      const restored = readDemoState(local, storage(role));
      assert.equal(restored.role, role);
      assert.equal(restored.storageError, true);
      assert.equal(restored.database?.users[0].id, 'u');
      assert.equal('quota' in restored.database!.users[0], false);
      assert.equal('documents' in restored.database!, false);
    }
  }
});

test('restoring database and session handles independent failures and invalid stored content', () => {
  const local = storage(JSON.stringify(legacy()));
  const restored = readDemoState(local, storage('teacher'));
  assert.equal(restored.storageError, false);
  assert.deepEqual(JSON.parse(local.getItem('')!), restored.database);
  assert.equal(readDemoState(storage(), storage('unexpected')).role, undefined);
  const invalid = storage('{}');
  assert.equal(readDemoState(invalid, storage('admin')).database, undefined);
  assert.equal(invalid.getItem(''), null);
  assert.equal(readDemoState(storage('{'), storage('admin')).role, 'admin');
  const blocked = storage();
  blocked.getItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
  assert.equal(readDemoState(blocked, storage('admin')).role, 'admin');
  const noSession = readDemoState(storage(JSON.stringify(legacy())), blocked);
  assert.equal(noSession.database?.users[0].id, 'u');
  assert.equal(noSession.storageError, true);
});

test('chronology compares instants across UTC, explicit offsets and legacy local dates', () => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = 'America/Sao_Paulo';
  try {
    assert.ok(compareTimestamps('2026-10-04T20:10:00', '2026-10-04T23:00:00.000Z') > 0);
    assert.equal(compareTimestamps('2026-10-04T20:00:00-03:00', '2026-10-04T23:00:00.000Z'), 0);
    const replies = [
      { id: 'late', createdAt: '2026-10-04T20:10:00', accepted: true, votes: 10 },
      { id: 'early', createdAt: '2026-10-04T23:00:00Z', accepted: false, votes: 0 }
    ];
    assert.deepEqual([...replies].sort((a, b) => compareTimestamps(a.createdAt, b.createdAt)).map(r => r.id), ['early', 'late']);
    assert.ok(compareTimestamps('invalid', replies[0].createdAt) > 0);
    assert.equal(compareTimestamps('invalid', ''), 0);
    assert.ok(compareTimestamps(replies[0].createdAt, 'invalid') < 0);
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test('last material includes completed visits and excludes another user, inaccessible material and invalid dates', () => {
  const materials = [{ id: 'first' }, { id: 'last' }];
  const visits = [
    { userId: 'u', materialId: 'first', lastAccess: '2026-10-01T10:00:00Z', completed: false },
    { userId: 'u', materialId: 'last', lastAccess: '2026-10-02T10:00:00Z', completed: true },
    { userId: 'other', materialId: 'first', lastAccess: '2026-10-03T10:00:00Z', completed: false },
    { userId: 'u', materialId: 'inaccessible', lastAccess: '2026-10-04T10:00:00Z', completed: false },
    { userId: 'u', materialId: 'first', lastAccess: 'invalid', completed: false }
  ];
  assert.equal(lastAccessedMaterial('u', materials, visits)?.id, 'last');
  assert.equal(lastAccessedMaterial('u', materials, visits.map(p => ({ ...p, completed: true })))?.id, 'last');
  assert.equal(lastAccessedMaterial('u', materials, []), undefined);
  assert.equal(lastAccessedMaterial('missing', materials, visits), undefined);
  assert.equal(lastAccessedMaterial('u', [], visits), undefined);
});

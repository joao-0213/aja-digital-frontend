import test from 'node:test';
import assert from 'node:assert/strict';
import type { User } from '../src/models/user.ts';
import type { MockDatabase } from '../src/models/database.ts';
import { teachingTeamOptions } from '../src/features/subjects/lib/teaching-team.ts';
import { applyDemoMutation } from '../src/lib/demo-mutations.ts';

function teachers(): User[] {
  return [
    { id: 'first', name: 'Docente Um', email: 'um@exemplo.com', role: 'teacher' },
    { id: 'second', name: 'Docente Dois', email: 'dois@exemplo.com', role: 'teacher' }
  ];
}

test('a selected teacher remains visible and removable after another administrator inactivates the account', () => {
  const users = teachers();
  const selected = ['first', 'second'];
  const before = teachingTeamOptions(users, selected);
  assert.equal(before.find(option => option.id === 'first')?.available, true);
  users[0].active = false;
  const after = teachingTeamOptions(users, selected);
  assert.deepEqual(after.find(option => option.id === 'first'), {
    id: 'first', name: 'Docente Um', selected: true, available: false, reason: 'Conta inativa'
  });
  assert.equal(after.find(option => option.id === 'second')?.selected, true);
  assert.deepEqual(selected, ['first', 'second'], 'account changes never discard or reassign a local selection');
});

test('deleted, changed-role and missing selected accounts have an explicit unavailable identity', () => {
  const users = teachers();
  users[0].deletedAt = '2026-11-02T10:00:00Z';
  users[1].role = 'student';
  users.push({ id: 'unselected', name: 'Fora da seleção', email: 'fora@exemplo.com', role: 'teacher', active: false });
  const options = teachingTeamOptions(users, ['first', 'second', 'missing']);
  assert.deepEqual(options.map(option => ({ id: option.id, available: option.available, selected: option.selected, reason: option.reason })), [
    { id: 'first', available: false, selected: true, reason: 'Conta excluída' },
    { id: 'second', available: false, selected: true, reason: 'Cargo alterado' },
    { id: 'missing', available: false, selected: true, reason: 'Cadastro não localizado' }
  ]);
  assert.match(options.find(option => option.id === 'missing')!.name, /missing/);
  assert.equal(options.some(option => option.id === 'unselected'), false);
});

test('removing one unavailable selection preserves the remaining choices without changing any account', () => {
  const users = teachers();
  users[0].active = false;
  const snapshot = structuredClone(users);
  const options = teachingTeamOptions(users, ['second']);
  assert.deepEqual(options, [{ id: 'second', name: 'Docente Dois', selected: true, available: true }]);
  assert.deepEqual(users, snapshot, 'rendering and removing a local selection never reactivate an account');
  assert.deepEqual(teachingTeamOptions(users, []), [{ id: 'second', name: 'Docente Dois', selected: false, available: true }]);
});

test('legacy duplicate selections produce one removable unavailable choice', () => {
  const options = teachingTeamOptions([], ['missing', 'missing']);
  assert.equal(options.length, 1);
  assert.equal(options[0].id, 'missing');
  assert.equal(options[0].available, false);
});

for (const action of ['inactivate', 'delete'] as const) {
  test(`a shared editor recovers after teacher ${action}, preserving local text and requiring the current revision`, () => {
    const db: MockDatabase = {
      version: 1, audit: [],
      users: [{ id: 'admin', name: 'Admin', email: 'admin@exemplo.com', role: 'admin' }, ...teachers()],
      classes: [{ id: 'class', name: 'Turma', code: 'T1', year: 2026, shift: 'Noite', active: true, studentIds: [] }],
      subjects: [{ id: 'subject', classId: 'class', name: 'Título anterior', description: '', teacherIds: ['first', 'second'], color: 'blue' }],
      modules: [{ id: 'module', subjectId: 'subject', title: 'Módulo', description: '', order: 1 }],
      materials: [{ id: 'material', moduleId: 'module', title: 'Publicação anterior', kind: 'lesson', content: 'Conteúdo preservado', duration: 10, order: 1, authorId: 'first' }],
      assessments: [], attempts: [], questions: [], topics: [], announcements: [], events: [], attendance: [], progress: []
    };
    const local = { title: 'Título local preservado', description: 'Orientações locais preservadas', teachers: ['first', 'second'] };
    const latest = applyDemoMutation(db, 'admin', draft => {
      const teacher = draft.users.find(user => user.id === 'first')!;
      teacher.active = false;
      if (action === 'delete') teacher.deletedAt = '2026-11-02T12:00:00Z';
    });
    const unavailable = teachingTeamOptions(latest.users, local.teachers).filter(option => !option.available);
    assert.equal(unavailable.length, 1);
    assert.equal(unavailable[0].id, 'first');
    assert.equal(unavailable[0].reason, action === 'delete' ? 'Conta excluída' : 'Conta inativa');
    assert.deepEqual(local.teachers, ['first', 'second'], 'the account transition does not silently clear the local selection');

    const explicitSelection = local.teachers.filter(id => id !== unavailable[0].id);
    assert.equal(teachingTeamOptions(latest.users, explicitSelection).some(option => !option.available), false);
    const save = (draft: MockDatabase) => Object.assign(draft.subjects[0], { name: local.title, description: local.description, teacherIds: explicitSelection });
    assert.throws(() => applyDemoMutation(latest, 'admin', save, { expected: [{ collection: 'subjects', id: 'subject', revision: 0 }] }), /alterado/i, 'removing the unavailable selection does not bypass revision confirmation');
    assert.equal(latest.subjects[0].name, 'Título anterior');

    const saved = applyDemoMutation(latest, 'admin', save, { expected: [{ collection: 'subjects', id: 'subject', revision: latest.subjects[0].revision ?? 0 }] });
    assert.equal(saved.subjects[0].name, local.title);
    assert.equal(saved.subjects[0].description, local.description);
    assert.deepEqual(saved.subjects[0].teacherIds, ['second']);
    assert.equal(saved.users.find(user => user.id === 'first')?.active, false);
    assert.equal(saved.users.find(user => user.id === 'first')?.deletedAt, action === 'delete' ? '2026-11-02T12:00:00Z' : undefined);
    assert.deepEqual(saved.materials, db.materials, 'recovering the editor preserves the former teacher publication and its authorship');
    assert.equal(saved.subjects[0].revision, 2);
  });
}

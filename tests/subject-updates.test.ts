import test from 'node:test';
import assert from 'node:assert/strict';
import type { MockDatabase } from '../src/models/index.ts';
import { hasUnseenPublications, subjectPublications } from '../src/lib/subject-updates.ts';

const fixture = {
  subjects: [{ id: 's1', classId: 'c1' }, { id: 's2', classId: 'c1' }],
  modules: [{ id: 'm1', subjectId: 's1', order: 1 }, { id: 'm2', subjectId: 's2', order: 1 }],
  materials: [{ id: 'old', moduleId: 'm1', order: 1 }, { id: 'other', moduleId: 'm2', order: 1 }],
  announcements: [{ id: 'general', classId: 'c1' }, { id: 'specific', classId: 'c1', subjectId: 's2' }, { id: 'outside', classId: 'c2' }],
  assessments: [{ id: 'draft', moduleId: 'm1', status: 'draft' }]
} as unknown as MockDatabase;

test('unvisited subjects show only their own publications and general class notices', () => {
  assert.deepEqual(subjectPublications(fixture, 's1'), ['material:old', 'notice:general']);
  assert.equal(hasUnseenPublications(subjectPublications(fixture, 's1'), []), true);
  assert.deepEqual(subjectPublications(fixture, 'missing'), []);
});

test('visits clear updates; new publications restore them, but reordering does not', () => {
  const db = structuredClone(fixture);
  const seen = subjectPublications(db, 's1');
  assert.equal(hasUnseenPublications(seen, seen), false);
  db.materials[0].order = 20;
  assert.equal(hasUnseenPublications(subjectPublications(db, 's1'), seen), false);
  db.assessments[0].status = 'published';
  assert.equal(hasUnseenPublications(subjectPublications(db, 's1'), seen), true);
  assert.equal(hasUnseenPublications([], seen), false);
});

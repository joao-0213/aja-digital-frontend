import test from 'node:test';
import assert from 'node:assert/strict';
import type { MockDatabase } from '../src/models/database.ts';
import { compareAttendanceRecords, recordAttendance } from '../src/lib/attendance.ts';

const lesson = { id: 'first', subjectId: 'subject', date: '2026-11-01', time: '19:00', records: { student: true } };
const fixture = (): MockDatabase => ({ version: 1, audit: [], users: [], classes: [], subjects: [], modules: [], materials: [], questions: [], assessments: [], attempts: [], topics: [], announcements: [], events: [], attendance: [], progress: [] });

test('two editors creating the same lesson cannot silently overwrite the first attendance', () => {
  const db = fixture();
  recordAttendance(db, lesson);
  const original = structuredClone(db.attendance);
  assert.throws(() => recordAttendance(db, { ...lesson, id: 'second', records: { student: false } }), /outro docente/i);
  assert.deepEqual(db.attendance, original);
});

test('reviewing the current attendance permits a correction while preserving lesson identity', () => {
  const db = fixture();
  recordAttendance(db, lesson);
  const records = { student: false };
  recordAttendance(db, { ...lesson, id: 'unused', records }, 'first');
  assert.equal(db.attendance.length, 1);
  assert.equal(db.attendance[0].id, 'first');
  assert.deepEqual(db.attendance[0].records, { student: false });
  records.student = true;
  assert.equal(db.attendance[0].records.student, false);
});

test('different times and subjects represent separate lessons', () => {
  const db = fixture();
  recordAttendance(db, lesson);
  recordAttendance(db, { ...lesson, id: 'later', time: '20:00' });
  recordAttendance(db, { ...lesson, id: 'other', subjectId: 'other-subject' });
  assert.deepEqual(db.attendance.map(item => item.id), ['first', 'later', 'other']);
});

test('removed attendance is not recreated or restored by an editor that remained open', () => {
  const db = fixture();
  recordAttendance(db, lesson);
  db.attendance[0].deletedAt = '2026-11-01T20:00:00Z';
  const original = structuredClone(db.attendance);
  assert.throws(() => recordAttendance(db, lesson, 'first'), /indisponível/i);
  assert.deepEqual(db.attendance, original);
  assert.throws(() => recordAttendance(fixture(), lesson, 'first'), /indisponível/i);
});

test('equal attendance totals still expose each saved mark beside the preserved local mark', () => {
  const saved = { ana: false, bruno: true };
  const local = { ana: true, bruno: false };
  assert.deepEqual(compareAttendanceRecords(saved, local, [{ id: 'ana', name: 'Ana' }, { id: 'bruno', name: 'Bruno' }]), [
    { studentId: 'ana', name: 'Ana', saved: false, local: true, changed: true },
    { studentId: 'bruno', name: 'Bruno', saved: true, local: false, changed: true }
  ]);
  assert.deepEqual(saved, { ana: false, bruno: true });
  assert.deepEqual(local, { ana: true, bruno: false });
});

test('comparison distinguishes a missing mark from absence and includes retained historical records', () => {
  const rows = compareAttendanceRecords({ former: false, unchanged: true }, { new: true, unchanged: true }, [{ id: 'unchanged', name: 'Aluno atual' }]);
  assert.deepEqual(rows, [
    { studentId: 'former', name: 'Aluno indisponível', saved: false, local: undefined, changed: true },
    { studentId: 'unchanged', name: 'Aluno atual', saved: true, local: true, changed: false },
    { studentId: 'new', name: 'Aluno indisponível', saved: undefined, local: true, changed: true }
  ]);
  assert.deepEqual(compareAttendanceRecords({}, {}, []), []);
});

test('a later saved revision produces a fresh comparison without replacing the editor input', () => {
  const local = { ana: true, bruno: false };
  const names = [{ id: 'ana', name: 'Ana' }, { id: 'bruno', name: 'Bruno' }];
  const first = compareAttendanceRecords({ ana: false, bruno: true }, local, names);
  const next = compareAttendanceRecords({ ana: true, bruno: true }, local, names);
  assert.equal(first[0].changed, true);
  assert.equal(next[0].changed, false);
  assert.equal(next[1].changed, true);
  assert.deepEqual(local, { ana: true, bruno: false });
});

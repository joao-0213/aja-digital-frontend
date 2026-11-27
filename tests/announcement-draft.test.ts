import test from 'node:test';
import assert from 'node:assert/strict';
import { draftKey, readDraft, writeDraft, clearDrafts } from './support/legacy/announcement-draft.ts';
import { brasiliaMinTimeForDate, brasiliaTodayDate, isOccurrenceInPast } from '../src/features/announcements/lib/announcement-form.ts';

function storage() {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, key: (i: number) => [...values.keys()][i] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
const fields = { title: 'Texto local', body: 'Mensagem', classId: 'c1', subject: 's1', notify: false, calendar: true, date: '2026-12-01', time: '18:30', allDay: false, revision: 3 };

test('interrupted notice retains all fields and original revision for the same actor and context', () => {
  const local = storage();
  const key = draftKey('t1', 'notice1', 's1');
  writeDraft(local, key, fields);
  assert.deepEqual(readDraft(local, key), fields);
  assert.equal(readDraft(local, draftKey('t2', 'notice1', 's1')), undefined);
  assert.equal(readDraft(local, draftKey('t1', undefined, 's1')), undefined);
  assert.equal(readDraft(local, draftKey('t1', 'notice2', 's1')), undefined);
  assert.equal(readDraft(local, draftKey('t1', undefined)), undefined);
});

test('discard and reset clear only notice drafts; malformed and unavailable storage recover explicitly', () => {
  const local = storage();
  const key = draftKey('t1');
  writeDraft(local, key, fields);
  writeDraft(local, key, undefined);
  assert.equal(readDraft(local, key), undefined);
  local.setItem(key, '{bad');
  assert.equal(readDraft(local, key), undefined);
  local.setItem(key, JSON.stringify({ title: 'Incomplete' }));
  assert.equal(readDraft(local, key), undefined);
  writeDraft(local, key, fields);
  local.setItem('unrelated', 'keep');
  clearDrafts(local);
  assert.equal(readDraft(local, key), undefined);
  assert.equal(local.getItem('unrelated'), 'keep');
  assert.throws(() => writeDraft({ ...local, setItem: () => { throw new Error('Quota'); } }, key, fields), /Quota/);
});

test('announcement calendar occurrence validation rejects past dates and past times today in Brasília', () => {
  const nowMs = Date.parse('2026-11-25T14:20:15-03:00');
  assert.equal(brasiliaTodayDate(nowMs), '2026-11-25');
  assert.equal(brasiliaMinTimeForDate('2026-11-25', nowMs), '14:21');
  assert.equal(brasiliaMinTimeForDate('2026-11-26', nowMs), undefined);
  assert.equal(isOccurrenceInPast({ date: '2026-11-24', allDay: true }, nowMs), true);
  assert.equal(isOccurrenceInPast({ date: '2026-11-25', allDay: true }, nowMs), false);
  assert.equal(isOccurrenceInPast({ date: '2026-11-25', time: '14:20', allDay: false }, nowMs), true);
  assert.equal(isOccurrenceInPast({ date: '2026-11-25', time: '14:21', allDay: false }, nowMs), false);
  assert.equal(isOccurrenceInPast({ date: '2026-11-26', time: '08:00', allDay: false }, nowMs), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { draftKey, readDraft, writeDraft, clearDrafts } from '../src/lib/announcement-draft.ts';

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

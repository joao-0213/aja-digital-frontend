import test from 'node:test';
import assert from 'node:assert/strict';
import { forumComposeDraftKeys, readForumComposeDraft, readForumDraft, saveForumComposeDraft, saveForumDraft } from '../src/lib/forum-draft.ts';

function createMemoryDraftStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }
  };
}

test('saving forum compositions reports failures and preserves the previous stored draft', () => {
  let stored = 'Anterior';
  assert.equal(saveForumDraft({ setItem: (_key, value) => { stored = value; } }, 'reply', 'Novo texto'), undefined);
  assert.equal(stored, 'Novo texto');
  const error = saveForumDraft({ setItem: () => { throw new Error('QuotaExceeded'); } }, 'reply', 'Mais recente');
  assert.match(error ?? '', /rascunho/);
  assert.match(error ?? '', /tela aberta/);
  assert.equal(stored, 'Novo texto');
});
test('reading an unavailable draft distinguishes failed recovery from an empty composition', () => {
  assert.deepEqual(readForumDraft({ getItem: () => 'Anterior' }, 'reply'), { value: 'Anterior' });
  assert.deepEqual(readForumDraft({ getItem: () => null }, 'reply'), { value: null });
  const failed = readForumDraft({ getItem: () => { throw new Error('SecurityError'); } }, 'reply');
  assert.equal(failed.value, undefined);
  assert.match(failed.error ?? '', /retomar/);
});

test('forum composition recovers old raw contextual keys and keeps user/context drafts isolated', () => {
  const storage = createMemoryDraftStorage();
  const contextual = forumComposeDraftKeys('student-a', 'material-text', null);
  assert.equal(contextual.legacy, 'aja-forum-compose:student-a:material-text');
  assert.equal(contextual.compatible, 'aja-forum-compose:student-a:material:material-text');
  saveForumComposeDraft(storage, contextual.legacy, { title: 'Rascunho antigo', body: 'Corpo salvo.', reference: 'material:material-text', targetSubject: 's1' });

  assert.deepEqual(readForumComposeDraft(storage, contextual), { value: { title: 'Rascunho antigo', body: 'Corpo salvo.', reference: 'material:material-text', targetSubject: 's1' } });
  assert.deepEqual(readForumComposeDraft(storage, forumComposeDraftKeys('student-b', 'material-text', null)), { value: null });
  assert.deepEqual(readForumComposeDraft(storage, forumComposeDraftKeys('student-a', null, 'q1')), { value: null });
});

test('general legacy forum composition restores targetSubject as its publication audience', () => {
  const storage = createMemoryDraftStorage();
  const keys = forumComposeDraftKeys('teacher-a', null, null);
  saveForumComposeDraft(storage, keys.legacy, { title: 'Dúvida geral', body: 'Texto local.', targetSubject: 's1' });

  const restored = readForumComposeDraft(storage, keys);
  assert.deepEqual(restored.value, { title: 'Dúvida geral', body: 'Texto local.', targetSubject: 's1' });
  assert.equal(restored.value?.targetSubject, 's1');
});

test('removing legacy attachment metadata persists as absent on the next read', () => {
  const storage = createMemoryDraftStorage();
  const keys = forumComposeDraftKeys('student-a', null, null);
  saveForumComposeDraft(storage, keys.legacy, { title: 'Dúvida', targetSubject: 's1', attachment: { id: 'legacy-file', name: 'antigo.png', mime: 'image/png', size: 5 } });
  const restored = readForumComposeDraft(storage, keys).value;
  assert.equal((restored?.attachment as { id: string } | undefined)?.id, 'legacy-file');

  const { attachment: _removed, ...withoutAttachment } = restored ?? {};
  saveForumComposeDraft(storage, keys.legacy, withoutAttachment);
  assert.deepEqual(readForumComposeDraft(storage, keys).value, { title: 'Dúvida', targetSubject: 's1' });
});

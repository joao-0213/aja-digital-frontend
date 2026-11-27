import test from 'node:test';
import assert from 'node:assert/strict';
import { forumComposeDraftKeys, forumReplyDraftKey, readForumComposeDraft, readForumDraft, saveForumComposeDraft, saveForumDraft } from '../src/lib/forum-draft.ts';

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

test('HTTP forum composition uses contextual namespaced keys and keeps user/context drafts isolated', () => {
  const storage = createMemoryDraftStorage();
  const contextual = forumComposeDraftKeys('student-a', 'material-text', null);
  assert.equal(contextual.current, 'aja-http-forum-compose:student-a:material:material-text');
  saveForumComposeDraft(storage, contextual.current, { title: 'Rascunho atual', body: 'Corpo salvo.', reference: 'material:material-text', targetSubject: 's1' });

  assert.deepEqual(readForumComposeDraft(storage, contextual.current), { value: { title: 'Rascunho atual', body: 'Corpo salvo.', reference: 'material:material-text', targetSubject: 's1' } });
  assert.deepEqual(readForumComposeDraft(storage, forumComposeDraftKeys('student-b', 'material-text', null).current), { value: null });
  assert.deepEqual(readForumComposeDraft(storage, forumComposeDraftKeys('student-a', null, 'q1').current), { value: null });
});

test('general legacy forum composition restores targetSubject as its publication audience', () => {
  const storage = createMemoryDraftStorage();
  const keys = forumComposeDraftKeys('teacher-a', null, null);
  saveForumComposeDraft(storage, keys.current, { title: 'Dúvida geral', body: 'Texto local.', targetSubject: 's1' });

  const restored = readForumComposeDraft(storage, keys.current);
  assert.deepEqual(restored.value, { title: 'Dúvida geral', body: 'Texto local.', targetSubject: 's1' });
  assert.equal(restored.value?.targetSubject, 's1');
});

test('removing legacy attachment metadata persists as absent on the next read', () => {
  const storage = createMemoryDraftStorage();
  const keys = forumComposeDraftKeys('student-a', null, null);
  saveForumComposeDraft(storage, keys.current, { title: 'Dúvida', targetSubject: 's1', attachment: { id: 'legacy-file', name: 'antigo.png', mime: 'image/png', size: 5 } });
  const restored = readForumComposeDraft(storage, keys.current).value;
  assert.equal((restored?.attachment as { id: string } | undefined)?.id, 'legacy-file');

  const { attachment: _removed, ...withoutAttachment } = restored ?? {};
  saveForumComposeDraft(storage, keys.current, withoutAttachment);
  assert.deepEqual(readForumComposeDraft(storage, keys.current).value, { title: 'Dúvida', targetSubject: 's1' });
});

test('HTTP forum compositions use an isolated key and never read or rewrite the legacy key', () => {
  const storage = createMemoryDraftStorage();
  const legacyKey = 'aja-forum-compose:student-a:new';
  const legacyValue = '{ "title": "Rascunho antigo", "body": "Não retomar" }';
  storage.values.set(legacyKey, legacyValue);
  const keys = forumComposeDraftKeys('student-a', null, null);

  assert.equal(keys.current, 'aja-http-forum-compose:student-a:new');
  assert.deepEqual(readForumComposeDraft(storage, keys.current), { value: null });
  assert.equal(storage.values.get(legacyKey), legacyValue);

  saveForumComposeDraft(storage, keys.current, { title: 'Rascunho atual', body: 'Só no namespace HTTP.' });
  assert.deepEqual(readForumComposeDraft(storage, keys.current).value, { title: 'Rascunho atual', body: 'Só no namespace HTTP.' });
  assert.equal(storage.values.get(legacyKey), legacyValue);
});

test('HTTP forum replies use an isolated key and leave the legacy reply draft untouched', () => {
  const storage = createMemoryDraftStorage();
  const legacyKey = 'aja-forum-reply:student-a:topic-1';
  const legacyValue = '{ "body": "Rascunho antigo", "pendingReply": { "key": "legacy" } }';
  storage.values.set(legacyKey, legacyValue);
  const currentKey = forumReplyDraftKey('student-a', 'topic-1');

  assert.equal(currentKey, 'aja-http-forum-reply:student-a:topic-1');
  assert.deepEqual(readForumDraft(storage, currentKey), { value: null });
  saveForumDraft(storage, currentKey, '{"body":"Rascunho HTTP"}');
  assert.equal(storage.values.get(legacyKey), legacyValue);
});

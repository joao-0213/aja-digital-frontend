import test from 'node:test';
import assert from 'node:assert/strict';
import { saveForumDraft } from '../src/lib/forum-draft.ts';

test('saving forum compositions reports failures and preserves the previous stored draft', () => {
  let stored = 'Anterior';
  assert.equal(saveForumDraft({ setItem: (_key, value) => { stored = value; } }, 'reply', 'Novo texto'), undefined);
  assert.equal(stored, 'Novo texto');
  const error = saveForumDraft({ setItem: () => { throw new Error('QuotaExceeded'); } }, 'reply', 'Mais recente');
  assert.match(error ?? '', /rascunho/);
  assert.match(error ?? '', /tela aberta/);
  assert.equal(stored, 'Novo texto');
});

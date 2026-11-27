import assert from 'node:assert/strict';
import test from 'node:test';
import {
  readSessionDraft,
  readSessionText,
  removeSessionDraft,
  writeSessionDraft,
  writeSessionText,
  type SessionStorageLike
} from '@/lib/session-draft-storage';
import { createMemoryDraftStore } from '@/providers/memory-draft-store';

function createMemoryStorage(): SessionStorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    }
  };
}

test('session-draft-storage handles SSR, corrupted JSON, schema validation, and quota failures without touching legacy keys', () => {
  assert.equal(readSessionDraft('aja-work-v1:1', undefined, undefined), null);
  assert.equal(writeSessionDraft('aja-work-v1:1', { a: 1 }, undefined), false);

  const storage = createMemoryStorage();
  storage.setItem('aja-digital-demo-v1', '{"legacy":true}');
  storage.setItem('aja-work-v1:bad', '{invalid-json');
  assert.equal(readSessionDraft('aja-work-v1:bad', undefined, storage), null);

  storage.setItem('aja-work-v1:wrong-shape', JSON.stringify({ wrong: true }));
  const isDraft = (v: unknown): v is { revision: number } =>
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { revision?: unknown }).revision === 'number';
  assert.equal(readSessionDraft('aja-work-v1:wrong-shape', isDraft, storage), null);

  assert.equal(writeSessionDraft('aja-work-v1:ok', { revision: 2 }, storage), true);
  assert.deepEqual(readSessionDraft('aja-work-v1:ok', isDraft, storage), { revision: 2 });

  const quotaStorage: SessionStorageLike = {
    getItem: () => null,
    setItem: () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    },
    removeItem: () => {}
  };
  assert.equal(writeSessionDraft('aja-work-v1:quota', { revision: 1 }, quotaStorage), false);
  assert.equal(writeSessionText('aja-attempt-recovery-owner:1', '3', quotaStorage), false);
  assert.equal(readSessionText('aja-attempt-recovery-owner:1', quotaStorage), null);

  removeSessionDraft('aja-work-v1:ok', storage);
  assert.equal(readSessionDraft('aja-work-v1:ok', isDraft, storage), null);
  assert.equal(storage.getItem('aja-digital-demo-v1'), '{"legacy":true}');
});

test('MemoryDraftStore isolates drafts by owner and clears on owner change or clearAll', () => {
  const store = createMemoryDraftStore();
  store.saveDraft('users-fields', { name: 'Ignored' });
  assert.equal(store.readDraft('users-fields'), undefined);

  store.setOwner('owner-1');
  store.saveDraft('users-fields', { name: 'Ana' });
  store.saveDraftExtra('users-intent', { key: 'k1' });
  assert.deepEqual(store.readDraft('users-fields'), { name: 'Ana' });
  assert.deepEqual(store.readDraftExtra('users-intent'), { key: 'k1' });

  store.setOwner('owner-2');
  assert.equal(store.readDraft('users-fields'), undefined);
  assert.equal(store.readDraftExtra('users-intent'), undefined);

  store.saveDraft('classes-fields', { name: 'Turma A' });
  store.clearAll();
  assert.equal(store.readDraft('classes-fields'), undefined);
});

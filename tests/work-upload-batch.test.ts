import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveWorkUploadBatch,
  type WorkUploadBatchAttachment,
  type WorkUploadIntent
} from '../src/features/assessments/lib/work-upload-batch.ts';

const attachments: WorkUploadBatchAttachment[] = [
  { kind: 'file', fileId: 'local:a', name: 'a.png' },
  { kind: 'file', fileId: 'local:b', name: 'b.txt' }
];
type FakeFile = { name: string };
const files: Record<string, FakeFile> = {
  'local:a': { name: 'a.png' },
  'local:b': { name: 'b.txt' }
};
const uploads: Record<string, WorkUploadIntent> = {
  'local:a': { key: 'key-a', name: 'a.png', size: 4, type: 'image/png', digest: 'digest-a' },
  'local:b': { key: 'key-b', name: 'b.txt', size: 5, type: 'text/plain', digest: 'digest-b' }
};

test('two successful work uploads accumulate state and clear both local intentions', async () => {
  const progress: Array<{
    items: WorkUploadBatchAttachment[];
    files: Record<string, FakeFile>;
    uploads: Record<string, WorkUploadIntent>;
  }> = [];
  const result = await resolveWorkUploadBatch(
    attachments,
    files,
    uploads,
    async (localId, intent) => ({ id: `file:${localId}`, name: intent.name }),
    (state) => progress.push(state)
  );

  assert.deepEqual(
    result.items.map((item) => item.kind === 'file' && item.fileId),
    ['file:local:a', 'file:local:b']
  );
  assert.deepEqual(result.files, {});
  assert.deepEqual(result.uploads, {});
  assert.deepEqual(
    progress[0].items.map((item) => item.kind === 'file' && item.fileId),
    ['file:local:a', 'local:b']
  );
  assert.deepEqual(Object.keys(progress[0].uploads), ['local:b']);
  assert.deepEqual(Object.keys(progress[1].uploads), []);
});

test('an intermediate failure preserves the unresolved file and retry reuses its frozen key', async () => {
  const progress: Array<{
    items: WorkUploadBatchAttachment[];
    files: Record<string, FakeFile>;
    uploads: Record<string, WorkUploadIntent>;
  }> = [];
  const attempts: Array<{ localId: string; key: string }> = [];
  await assert.rejects(
    resolveWorkUploadBatch(
      attachments,
      files,
      uploads,
      async (localId, intent) => {
        attempts.push({ localId, key: intent.key });
        if (localId === 'local:b') throw new Error('resposta ambígua após commit');
        return { id: 'file:local:a', name: intent.name };
      },
      (state) => progress.push(state)
    ),
    /resposta ambígua após commit/
  );

  const recoverable = progress.at(-1)!;
  assert.deepEqual(
    recoverable.items.map((item) => item.kind === 'file' && item.fileId),
    ['file:local:a', 'local:b']
  );
  assert.deepEqual(Object.keys(recoverable.files), ['local:b']);
  assert.deepEqual(Object.keys(recoverable.uploads), ['local:b']);
  const result = await resolveWorkUploadBatch(
    recoverable.items,
    recoverable.files,
    recoverable.uploads,
    async (localId, intent) => {
      attempts.push({ localId, key: intent.key });
      return { id: 'file:local:b', name: intent.name };
    }
  );

  assert.deepEqual(
    attempts.filter((attempt) => attempt.localId === 'local:b').map((attempt) => attempt.key),
    ['key-b', 'key-b']
  );
  assert.deepEqual(
    result.items.map((item) => item.kind === 'file' && item.fileId),
    ['file:local:a', 'file:local:b']
  );
  assert.deepEqual(result.files, {});
  assert.deepEqual(result.uploads, {});
});

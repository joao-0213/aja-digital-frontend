import test from 'node:test';
import assert from 'node:assert/strict';
import { createMaterialPublication } from '../src/features/materials/lib/material-publication.ts';
import { HttpError } from '../src/lib/http-client.ts';
import { createFilesApi } from '../src/lib/http-files.ts';
import { createHttpClient } from '../src/lib/http-client.ts';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createStudyTools } from '../src/features/materials/lib/study-tools.ts';

const pdf = (name = 'a.pdf') => new File(['%PDF-1.4\nexample'], name, { type: 'application/pdf' });
const input = () => ({ moduleId: 'mod1', kind: 'pdf' as const, title: '', content: 'Orientações', duration: 10, videoUrl: '', files: [{ localId: 'local1', title: 'Material A', file: pdf() }] });
const fileMetadata = { id: 'f1', name: 'a.pdf', size: 16, mime: 'application/pdf', purpose: 'material' as const, parentId: 'mod1', status: 'staged' as const, downloadUrl: '/api/v1/files/f1/content' };

test('publication validates the whole PDF selection before uploading and preserves invalid selection for correction', async () => {
  let writes = 0;
  const publication = createMaterialPublication({ isCurrent: () => true, upload: async () => { writes++; return fileMetadata; }, discard: async () => {}, batch: async () => { writes++; return { items: [], total: 0 }; } });
  const fields = input();
  fields.files.push({ localId: 'local2', title: 'Inválido', file: new File(['not a PDF'], 'bad.pdf', { type: 'application/pdf' }) });
  await assert.rejects(publication.publish(fields, 3), /PDF/);
  assert.equal(writes, 0);
  assert.equal(fields.files.length, 2);
});

test('lost batch response freezes exact intent and payload, replay reuses uploaded file and never discards attached bytes', async () => {
  let uploads = 0;
  let discards = 0;
  const requests: { command: unknown; key: string }[] = [];
  const publication = createMaterialPublication({
    isCurrent: () => true,
    upload: async () => { uploads++; return fileMetadata; },
    discard: async () => { discards++; },
    batch: async (command, key) => {
      requests.push({ command, key });
      if (requests.length === 1) throw new HttpError('unavailable', 'Resposta perdida.');
      return { items: [{ id: 'material1' }], total: 1 };
    }
  });
  const fields = input();
  await assert.rejects(publication.publish(fields, 3), /Resposta perdida/);
  assert.equal(publication.getState().uncertain, true);
  fields.content = 'Alteração posterior não pode mudar a intenção pendente';
  const result = await publication.publish(fields, 99);
  assert.deepEqual(requests[1], requests[0]);
  assert.equal(uploads, 1);
  assert.equal(discards, 0);
  assert.deepEqual(result.items, [{ id: 'material1' }]);
  assert.equal(publication.getState().uncertain, false);
});

test('definitive invalid batch discards only prepared files and retries with new upload identities, preserving selected bytes', async () => {
  const uploads: string[] = [];
  const discarded: string[] = [];
  let calls = 0;
  const publication = createMaterialPublication({
    isCurrent: () => true,
    upload: async (_file, _parent, key) => { uploads.push(key); return { ...fileMetadata, id: `f${uploads.length}` }; },
    discard: async id => { discarded.push(id); },
    batch: async () => { if (++calls === 1) throw new HttpError('validation', 'Lote inválido.', { status: 422 }); return { items: [{ id: 'material1' }], total: 1 }; }
  });
  const fields = input();
  await assert.rejects(publication.publish(fields, 3), /Lote inválido/);
  assert.deepEqual(discarded, ['f1']);
  assert.equal(fields.files[0].file.size, pdf().size);
  await publication.publish(fields, 3);
  assert.notEqual(uploads[0], uploads[1]);
});

test('file adapter sends native multipart and reads actual authenticated PDF bytes without JSON/base64 transport', async () => {
  const server = createServer(async (req, res) => {
    if (req.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      assert.match(req.headers['content-type']!, /multipart\/form-data; boundary=/);
      const parsed = await new Request('http://local/files', { method: 'POST', headers: { 'Content-Type': req.headers['content-type']! }, body }).formData();
      assert.equal(parsed.get('purpose'), 'material');
      assert.equal(parsed.get('parentId'), 'mod1');
      assert.equal(await (parsed.get('file') as File).text(), '%PDF-1.4\nexample');
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(fileMetadata));
    } else { res.setHeader('Content-Type', 'application/pdf'); res.end('%PDF-1.4\nexample'); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address === 'object');
  try {
    const api = createFilesApi(createHttpClient({ baseUrl: `http://127.0.0.1:${address.port}/api/v1` }));
    assert.equal((await api.upload('material', 'mod1', pdf(), 'upload-key')).id, 'f1');
    const bytes = await api.download('f1', 'inline');
    assert.equal(bytes.type, 'application/pdf');
    assert.equal(await bytes.text(), '%PDF-1.4\nexample');
  } finally { await new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()); }); }
});

test('publication never continues a late upload into a different session even when its transport ignores cancellation', async () => {
  let sessionKey = 'session-a';
  let release!: (value: typeof fileMetadata) => void;
  let started!: () => void;
  const firstStarted = new Promise<void>(resolve => { started = resolve; });
  const writes: string[] = [];
  const publication = createMaterialPublication({
    isCurrent: () => sessionKey === 'session-a',
    upload: async () => { writes.push(`upload:${sessionKey}`); if (writes.length > 1) return { ...fileMetadata, id: 'f2' }; started(); return await new Promise<typeof fileMetadata>(resolve => { release = resolve; }); },
    discard: async () => { writes.push(`discard:${sessionKey}`); },
    batch: async () => { writes.push(`batch:${sessionKey}`); return { items: [{ id: 'wrong-actor-material' }], total: 1 }; }
  });
  const fields = input();
  fields.files.push({ localId: 'local2', title: 'Material B', file: pdf('b.pdf') });
  const pending = publication.publish(fields, 3);
  await firstStarted;
  sessionKey = 'session-b';
  release(fileMetadata);
  await assert.rejects(pending, /sessão|cancelad/i);
  assert.deepEqual(writes, ['upload:session-a']);
});

test('retained study tool rejects a late first page after session change without reading progress or completing as another account', async () => {
  let current = true;
  let release!: (value: { items: { id: string; title: string }[]; total: number }) => void;
  let started!: () => void;
  const firstStarted = new Promise<void>(resolve => { started = resolve; });
  const calls: string[] = [];
  const tools = createStudyTools({
    list: async () => { calls.push('materials'); started(); return await new Promise(resolve => { release = resolve; }); },
    progressPage: async () => { calls.push('progress'); return { items: [], total: 0 }; },
    progress: async () => { calls.push('complete'); return { materialId: 'm1', completed: true }; }
  }, { isCurrent: () => current });
  const pending = tools[0].execute({});
  await firstStarted; current = false;
  release({ items: [{ id: 'm1', title: 'Privado de A' }], total: 101 });
  await assert.rejects(pending, /sessão|cancelad/i);
  await assert.rejects(tools[1].execute({ materialId: 'm1' }), /sessão|cancelad/i);
  assert.deepEqual(calls, ['materials']);
});

test('explicit HTTP 413 is a definite upload rejection, keeps the selection editable and consumes no pending intent', async () => {
  const publication = createMaterialPublication({ isCurrent: () => true,
    upload: async () => { throw new HttpError('http', 'Arquivo acima do limite.', { status: 413 }); },
    discard: async () => {}, batch: async () => ({ items: [], total: 0 })
  });
  const fields = input();
  await assert.rejects(publication.publish(fields, 3), /Arquivo acima/);
  assert.equal(publication.getState().uncertain, false);
  assert.equal(publication.getState().pending, undefined);
  assert.equal(fields.files.length, 1);
});

test('revision conflict keeps staged files for explicit parent review and retries a fresh batch intent without reupload', async () => {
  let uploads = 0;
  const revisions: number[] = [];
  const keys: string[] = [];
  const publication = createMaterialPublication({ isCurrent: () => true,
    upload: async () => { uploads++; return fileMetadata; }, discard: async () => { throw new Error('must retain prepared file while reviewing'); },
    batch: async (command, key) => {
      revisions.push(command.expectedRevision); keys.push(key);
      if (revisions.length === 1) throw new HttpError('conflict', 'Confira a revisão atual do módulo.', { status: 409, code: 'REVISION_CONFLICT', details: { currentRevision: 4 } });
      return { items: [{ id: 'm1' }], total: 1 };
    }
  });
  await assert.rejects(publication.publish(input(), 3), /revisão/);
  assert.equal(publication.getState().uncertain, false);
  await publication.publish(input(), 4);
  assert.equal(uploads, 1);
  assert.deepEqual(revisions, [3, 4]);
  assert.notEqual(keys[0], keys[1]);
});

test('retained completion tool cannot declare success or refresh another account after a late PATCH response', async () => {
  let current = true;
  let release!: (value: { materialId: string; completed: boolean }) => void;
  let started!: () => void;
  const began = new Promise<void>(resolve => { started = resolve; });
  let refreshed = 0;
  const tools = createStudyTools({ list: async () => ({ items: [], total: 0 }), progressPage: async () => ({ items: [], total: 0 }),
    progress: async () => { started(); return await new Promise(resolve => { release = resolve; }); }
  }, { isCurrent: () => current }, async () => { refreshed++; });
  const pending = tools[1].execute({ materialId: 'm1' });
  await began; current = false; release({ materialId: 'm1', completed: true });
  await assert.rejects(pending, /sessão|cancelad/i);
  assert.equal(refreshed, 0);
});

test('study materials tool reads all authorized pages and completion reports only API-confirmed state', async () => {
  const pages: number[] = [];
  let completions = 0;
  const tools = createStudyTools({
    list: async (_filters, page) => { pages.push(page); return { items: page === 1 ? Array.from({ length: 100 }, (_, index) => ({ id: `m${index}`, title: `Material ${index}` })) : [{ id: 'm100', title: 'Último material' }], total: 101 }; },
    progressPage: async () => ({ items: [{ materialId: 'm100', completed: true }], total: 1 }),
    progress: async id => { completions++; return { materialId: id, completed: true }; }
  }, { isCurrent: () => true });
  const rows = await tools[0].execute({}) as { id: string; completed: boolean }[];
  assert.equal(rows.length, 101);
  assert.equal(rows.at(-1)?.completed, true);
  assert.deepEqual(pages, [1, 2]);
  await assert.rejects(tools[1].execute({ materialId: 'm100', userId: 'other-account' }), /somente materialId/);
  assert.equal(completions, 0);
  assert.deepEqual(await tools[1].execute({ materialId: 'm100' }), { materialId: 'm100', completed: true });
  assert.equal(completions, 1);
});

test('editing never reads, clears or discards the pending publication of the same module on save or cancel', async () => {
  const { publicationPreparation } = await import('../src/features/materials/lib/material-preparation.ts');
  const drafts = new Map<string, unknown>();
  const pending = { stages: [{ id: 'prepared' }], uncertain: true, pending: { key: 'same-intent', body: { items: ['original'] } } };
  drafts.set('material-preparation:mod1', pending);
  let discards = 0;
  const storage = { read: (key: string) => drafts.get(key), save: (key: string, value: unknown) => { drafts.set(key, value); }, clear: (key: string) => { drafts.delete(key); } };
  const editing = publicationPreparation('mod1', true, storage);
  assert.equal(editing.read(), undefined);
  editing.save({ stages: [], uncertain: false });
  await editing.discard(async () => { discards++; });
  editing.clear();
  assert.equal(discards, 0);
  assert.deepEqual(drafts.get('material-preparation:mod1'), pending);
  const creating = publicationPreparation('mod1', false, storage);
  assert.deepEqual(creating.read(), pending);
  creating.clear();
  assert.equal(drafts.has('material-preparation:mod1'), false);
});

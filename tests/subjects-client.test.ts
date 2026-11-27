import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHttpClient, HttpError } from '../src/lib/http-client.ts';
import { createSubjectsApi } from '../src/features/subjects/api.ts';
import { moduleOrderCommand } from '../src/features/subjects/lib/module-order.ts';

test('module movement captures the parent and every module revision while keeping the original set untouched', () => {
  const modules = [
    { id: 'm1', revision: 2 },
    { id: 'm2', revision: 4 },
    { id: 'm3', revision: 7 }
  ];
  assert.deepEqual(moduleOrderCommand(6, modules, 'm2', -1), {
    expectedRevision: 6,
    items: [
      { id: 'm2', expectedRevision: 4 },
      { id: 'm1', expectedRevision: 2 },
      { id: 'm3', expectedRevision: 7 }
    ]
  });
  assert.deepEqual(
    modules.map((item) => item.id),
    ['m1', 'm2', 'm3']
  );
  assert.equal(moduleOrderCommand(6, modules, 'm1', -1), null);
  assert.equal(moduleOrderCommand(6, modules, 'unknown', 1), null);
  assert.throws(() => moduleOrderCommand(6, [...modules, modules[0]], 'm1', 1), /repetid/);
});

test('subject HTTP adapters submit writable fields and observed publication IDs without actor or future publications', async () => {
  const calls: { url: string; body?: Record<string, unknown>; key?: string }[] = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    calls.push({
      url: req.url!,
      body: body ? JSON.parse(body) : undefined,
      key: req.headers['idempotency-key'] as string | undefined
    });
    res.setHeader('Content-Type', 'application/json');
    if (req.url?.endsWith('/visits'))
      res.end(
        JSON.stringify({
          subjectId: 's1',
          seenAt: '2026-11-02T10:00:00Z',
          seenPublicationIds: ['notice:a'],
          publicationIds: ['notice:a', 'notice:b'],
          hasUpdates: true
        })
      );
    else
      res.end(
        JSON.stringify({ id: 's1', revision: 2, items: [], total: 0, page: 1, pageSize: 20 })
      );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    const api = createSubjectsApi(
      createHttpClient({ baseUrl: `http://127.0.0.1:${address.port}/api/v1` })
    );
    const fields = {
      name: 'Matemática',
      description: 'Aulas',
      classId: 'c1',
      teacherIds: ['t1', 't2'],
      color: 'violet' as const,
      icon: 'calculator' as const
    };
    await api.saveSubject(fields, 3, 's1', 'subject-intent');
    const visit = await api.markVisit('s1', ['notice:a']);
    assert.equal(
      visit.hasUpdates,
      true,
      'new publication received after detail must remain unseen'
    );
    assert.deepEqual(calls[1].body, { publicationIds: ['notice:a'] });
    assert.equal(Object.hasOwn(calls[1].body!, 'userId'), false);
    await api.saveModule(
      { title: 'Módulo', description: 'Texto' },
      0,
      's1',
      undefined,
      'module-intent'
    );
    await api.reorderModules('s1', {
      expectedRevision: 3,
      items: [
        { id: 'm2', expectedRevision: 2 },
        { id: 'm1', expectedRevision: 1 }
      ]
    });
    await api.list('Álgebra & números', 'c1', 2);
    assert.deepEqual(calls[0].body, { ...fields, expectedRevision: 3 });
    assert.deepEqual(calls[2].body, { title: 'Módulo', description: 'Texto', subjectId: 's1' });
    assert.equal(calls[2].key, 'module-intent');
    assert.deepEqual(calls[3].body, {
      expectedRevision: 3,
      items: [
        { id: 'm2', expectedRevision: 2 },
        { id: 'm1', expectedRevision: 1 }
      ]
    });
    assert.equal(
      calls[4].url,
      '/api/v1/subjects?page=2&pageSize=20&q=%C3%81lgebra+%26+n%C3%BAmeros&classId=c1'
    );
  } finally {
    await new Promise<void>((done) => {
      server.closeAllConnections();
      server.close(() => done());
    });
  }
});

test('failed visit never returns a local seen marker and preserves the observed snapshot for a retry', async () => {
  let count = 0;
  const bodies: unknown[] = [];
  const keys: unknown[] = [];
  const api = createSubjectsApi({
    request: async <T>(
      _path: string,
      options?: { json?: unknown; headers?: HeadersInit }
    ): Promise<T> => {
      bodies.push(options?.json);
      keys.push(new Headers(options?.headers).get('Idempotency-Key'));
      if (++count === 1) throw new HttpError('unavailable', 'Visita não registrada.');
      return {
        subjectId: 's1',
        hasUpdates: false,
        seenPublicationIds: ['notice:a'],
        publicationIds: ['notice:a'],
        seenAt: '2026-11-02T10:00:00Z'
      } as T;
    }
  });
  const observed = ['notice:a'];
  await assert.rejects(
    api.markVisit('s1', observed, 'stable-visit-intent'),
    /Visita não registrada/
  );
  assert.deepEqual(observed, ['notice:a']);
  assert.equal((await api.markVisit('s1', observed, 'stable-visit-intent')).hasUpdates, false);
  assert.deepEqual(bodies, [{ publicationIds: ['notice:a'] }, { publicationIds: ['notice:a'] }]);
  assert.deepEqual(keys, ['stable-visit-intent', 'stable-visit-intent']);
});

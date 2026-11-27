import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHttpClient, HttpError } from '../src/lib/http-client.ts';

async function fixture() {
  const requests: { url: string; body: string; cookie?: string }[] = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ url: req.url!, body, cookie: req.headers.cookie });
    const path = req.url!.split('/').at(-1)!;
    if (path === 'slow') await new Promise((resolve) => setTimeout(resolve, 80));
    if (path === 'empty') {
      res.writeHead(204).end();
      return;
    }
    if (path === 'bytes') {
      res.setHeader('Content-Type', 'application/pdf');
      res.end('%PDF-file');
      return;
    }
    if (path === 'invalid') {
      res.end('<html>failure</html>');
      return;
    }
    const status = Number(path);
    res.setHeader('Content-Type', 'application/json');
    if (status >= 400) {
      res.writeHead(status).end(
        JSON.stringify({
          error: {
            code: status === 409 ? 'REVISION_CONFLICT' : 'TEST_ERROR',
            message: 'Falha controlada.',
            requestId: 'req1',
            details: { currentRevision: 4 }
          }
        })
      );
      return;
    }
    res.end(JSON.stringify({ ok: true }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    requests,
    url: `http://127.0.0.1:${address.port}/api/v1`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      })
  };
}

test('HTTP reads JSON, posts actual body and keeps credentials enabled', async () => {
  const f = await fixture();
  try {
    let credentials: RequestCredentials | undefined;
    const client = createHttpClient({
      baseUrl: f.url,
      fetch: (input, init) => {
        credentials = init?.credentials;
        return fetch(input, init);
      }
    });
    assert.deepEqual(await client.request('/read'), { ok: true });
    await client.request('/write', {
      method: 'POST',
      json: { title: 'Texto' },
      headers: { 'Idempotency-Key': 'test-key-1' }
    });
    assert.equal(credentials, 'include');
    assert.equal(f.requests[1].body, '{"title":"Texto"}');
    assert.equal(f.requests[1].url, '/api/v1/write');
  } finally {
    await f.close();
  }
});

test('HTTP returns undefined for 204 and preserves binary response bytes', async () => {
  const f = await fixture();
  try {
    const client = createHttpClient({ baseUrl: f.url });
    assert.equal(await client.request('/empty'), undefined);
    const blob = await client.request<Blob>('/bytes', { responseType: 'blob' });
    assert.equal(blob.type, 'application/pdf');
    assert.equal(await blob.text(), '%PDF-file');
  } finally {
    await f.close();
  }
});

test('HTTP distinguishes expired session, denied, conflict, validation and unavailable', async () => {
  const f = await fixture();
  try {
    const client = createHttpClient({ baseUrl: f.url });
    for (const [status, kind] of [
      [401, 'session'],
      [403, 'forbidden'],
      [404, 'not-found'],
      [409, 'conflict'],
      [422, 'validation'],
      [500, 'http'],
      [503, 'unavailable']
    ] as const) {
      await assert.rejects(client.request(`/${status}`), (error: unknown) => {
        assert.ok(error instanceof HttpError);
        assert.equal(error.kind, kind);
        assert.equal(error.status, status);
        assert.equal(error.requestId, 'req1');
        assert.equal(error.message, 'Falha controlada.');
        if (status === 409) assert.deepEqual(error.details, { currentRevision: 4 });
        return true;
      });
    }
  } finally {
    await f.close();
  }
});

test('HTTP separates timeout, caller cancellation and malformed response without seed fallback', async () => {
  const f = await fixture();
  try {
    const client = createHttpClient({ baseUrl: f.url });
    await assert.rejects(
      client.request('/slow', { timeoutMs: 10 }),
      (error: unknown) => error instanceof HttpError && error.kind === 'timeout'
    );
    const controller = new AbortController();
    const pending = client.request('/slow', { signal: controller.signal });
    controller.abort();
    await assert.rejects(
      pending,
      (error: unknown) => error instanceof HttpError && error.kind === 'cancelled'
    );
    await assert.rejects(
      client.request('/invalid'),
      (error: unknown) => error instanceof HttpError && error.kind === 'invalid-response'
    );
    controller.abort();
    await assert.rejects(
      client.request('/read', { signal: controller.signal }),
      (error: unknown) => error instanceof HttpError && error.kind === 'cancelled'
    );
  } finally {
    await f.close();
  }
  await assert.rejects(
    createHttpClient({ baseUrl: f.url }).request('/read'),
    (error: unknown) => error instanceof HttpError && error.kind === 'unavailable'
  );
});

test('HTTP rejects credential destinations outside configured API before issuing requests', async () => {
  let calls = 0;
  const client = createHttpClient({
    baseUrl: 'http://127.0.0.1:3002/api/v1',
    fetch: async () => {
      calls++;
      return new Response('{}');
    }
  });
  for (const path of ['https://other.test/private', '//other.test/private', '/../db', '/%2e%2e/db'])
    await assert.rejects(client.request(path));
  assert.equal(calls, 0);
  assert.throws(() => createHttpClient({ baseUrl: 'file:///private' }));
});

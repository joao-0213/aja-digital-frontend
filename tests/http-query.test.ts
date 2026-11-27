import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHttpQuery } from '../src/lib/http-query.ts';
import { createHttpClient } from '../src/lib/http-client.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('query clears previous data synchronously and ignores old account/filter replies even when abort is ignored', async () => {
  const query = createHttpQuery<string>();
  const a = deferred<string>();
  let oldSignal!: AbortSignal;
  const pending = query.run({ sessionKey: 'a', key: 'filter1' }, signal => { oldSignal = signal; return a.promise; });
  await query.run({ sessionKey: 'a', key: 'filter2' }, async () => 'filtered');
  assert.equal(oldSignal.aborted, true);
  assert.equal(query.getSnapshot().data, 'filtered');
  const b = deferred<string>();
  const latest = query.run({ sessionKey: 'b', key: 'filter2' }, () => b.promise);
  assert.equal(query.getSnapshot().data, undefined);
  assert.equal(query.getSnapshot().status, 'loading');
  a.resolve('private old account');
  await pending;
  assert.equal(query.getSnapshot().data, undefined);
  b.resolve('account b');
  await latest;
  assert.equal(query.getSnapshot().data, 'account b');
});

test('query retry and invalidation call the loader again; error never keeps stale success', async () => {
  const query = createHttpQuery<number>();
  let calls = 0;
  const load = async () => { calls++; if (calls === 2) throw new Error('Offline'); return calls; };
  await query.run({ sessionKey: 'a', key: 'list' }, load);
  assert.equal(query.getSnapshot().data, 1);
  await query.invalidate();
  assert.equal(query.getSnapshot().status, 'error');
  assert.equal(query.getSnapshot().data, undefined);
  assert.equal(query.getSnapshot().error?.message, 'Offline');
  await query.retry();
  assert.equal(calls, 3);
  assert.equal(query.getSnapshot().data, 3);
});

test('query cancellation clears data, prevents late errors and releases subscriptions', async () => {
  const query = createHttpQuery<string>();
  const pending = deferred<string>();
  let updates = 0;
  const unsubscribe = query.subscribe(() => updates++);
  const run = query.run({ sessionKey: 'a', key: 'x' }, () => pending.promise);
  assert.equal(updates, 1);
  query.cancel();
  assert.equal(query.getSnapshot().status, 'idle');
  assert.equal(query.getSnapshot().data, undefined);
  unsubscribe();
  const afterCancel = updates;
  pending.reject(new Error('late failure'));
  await run;
  assert.equal(updates, afterCancel);
  await query.retry();
  assert.equal(query.getSnapshot().status, 'idle');
});

test('query retry and invalidation perform real HTTP requests against a listening API', async () => {
  let calls = 0;
  const server = createServer((_req, res) => {
    calls++;
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(calls === 1 ? 503 : 200);
    res.end(calls === 1 ? JSON.stringify({ error: { code: 'API_UNAVAILABLE', message: 'Tente novamente.' } }) : JSON.stringify({ value: calls }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    const client = createHttpClient({ baseUrl: `http://127.0.0.1:${address.port}/api/v1` });
    const query = createHttpQuery<{ value: number }>();
    await query.run({ sessionKey: 'account-1-session-1', key: 'actual-list' }, signal => client.request('/items', { signal }));
    assert.equal(query.getSnapshot().status, 'error');
    await query.retry();
    assert.deepEqual(query.getSnapshot().data, { value: 2 });
    const invalidation = query.invalidate();
    assert.equal(query.getSnapshot().data, undefined);
    await invalidation;
    assert.deepEqual(query.getSnapshot().data, { value: 3 });
    assert.equal(calls, 3);
    query.cancel();
    assert.equal(query.getSnapshot().data, undefined);
  } finally {
    await new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); });
  }
});

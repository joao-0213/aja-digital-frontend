import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHttpQuery, createHttpQueryCache, serializeQueryKey } from '../src/lib/http-query.ts';
import { createHttpClient } from '../src/lib/http-client.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test('query clears previous data synchronously and ignores old account/filter replies even when abort is ignored', async () => {
  const query = createHttpQuery<string>();
  const a = deferred<string>();
  let oldSignal!: AbortSignal;
  const pending = query.run({ sessionKey: 'a', key: 'filter1' }, (signal) => {
    oldSignal = signal;
    return a.promise;
  });
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
  const load = async () => {
    calls++;
    if (calls === 2) throw new Error('Offline');
    return calls;
  };
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
    res.end(
      calls === 1
        ? JSON.stringify({ error: { code: 'API_UNAVAILABLE', message: 'Tente novamente.' } })
        : JSON.stringify({ value: calls })
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    const client = createHttpClient({ baseUrl: `http://127.0.0.1:${address.port}/api/v1` });
    const query = createHttpQuery<{ value: number }>();
    await query.run({ sessionKey: 'account-1-session-1', key: 'actual-list' }, (signal) =>
      client.request('/items', { signal })
    );
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
    await new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  }
});

test('serializeQueryKey canonicalizes object keys and normalizes undefined', () => {
  assert.equal(serializeQueryKey('subjects'), serializeQueryKey(['subjects']));
  assert.equal(
    serializeQueryKey(['subjects', { b: 2, a: 1, ignored: undefined }]),
    serializeQueryKey(['subjects', { a: 1, b: 2 }])
  );
  assert.notEqual(
    serializeQueryKey(['subjects', { a: 1 }]),
    serializeQueryKey(['subjects', { a: 2 }])
  );
});

test('cache deduplicates concurrent subscribers and does not abort shared in-flight request when one unmounts', async () => {
  const cache = createHttpQueryCache();
  cache.setSessionKey('s1');
  const pending = deferred<string>();
  let calls = 0;
  let signalAborted = false;
  const load = (signal: AbortSignal) => {
    calls++;
    signal.addEventListener('abort', () => {
      signalAborted = true;
    });
    return pending.promise;
  };

  const unsub1 = cache.subscribe('s1', ['subjects', { page: 1 }], () => {});
  const unsub2 = cache.subscribe('s1', ['subjects', { page: 1 }], () => {});
  const p1 = cache.ensure('s1', ['subjects', { page: 1 }], load);
  const p2 = cache.ensure('s1', ['subjects', { page: 1 }], load);

  assert.equal(calls, 1);
  unsub1();
  assert.equal(signalAborted, false);
  pending.resolve('shared-data');
  await Promise.all([p1, p2]);
  assert.equal(cache.getSnapshot<string>('s1', ['subjects', { page: 1 }]).data, 'shared-data');
  unsub2();
});

test('cache isolates sessions absolutely and aborts previous session in-flight queries', async () => {
  const cache = createHttpQueryCache();
  cache.setSessionKey('s1');
  const pending = deferred<string>();
  let oldSignal!: AbortSignal;

  const unsub = cache.subscribe('s1', ['dashboard'], () => {});
  const run = cache.ensure('s1', ['dashboard'], (signal) => {
    oldSignal = signal;
    return pending.promise;
  });

  cache.setSessionKey('s2');
  assert.equal(oldSignal.aborted, true);
  assert.equal(cache.getSnapshot('s1', ['dashboard']).data, undefined);
  assert.equal(cache.getSnapshot('s2', ['dashboard']).data, undefined);

  pending.resolve('leaked-s1');
  await run;
  assert.equal(cache.getSnapshot('s2', ['dashboard']).data, undefined);
  unsub();
});

test('cache supports silent revalidation preserving data, exposes error on failure, and retries explicitly', async () => {
  const cache = createHttpQueryCache();
  cache.setSessionKey('s1');
  let calls = 0;
  const second = deferred<number>();

  const unsub = cache.subscribe('s1', ['forum', 'topics'], () => {});
  await cache.ensure('s1', ['forum', 'topics'], async () => {
    calls++;
    return 100;
  });
  assert.equal(cache.getSnapshot<number>('s1', ['forum', 'topics']).data, 100);
  assert.equal(cache.getSnapshot<number>('s1', ['forum', 'topics']).revalidating, false);

  const revalidation = cache.ensure(
    's1',
    ['forum', 'topics'],
    async () => {
      calls++;
      return second.promise;
    },
    { force: true, silent: true }
  );

  const midSnapshot = cache.getSnapshot<number>('s1', ['forum', 'topics']);
  assert.equal(midSnapshot.status, 'success');
  assert.equal(midSnapshot.data, 100);
  assert.equal(midSnapshot.revalidating, true);

  second.reject(new Error('Falha na revalidação'));
  await revalidation;
  const errorSnapshot = cache.getSnapshot<number>('s1', ['forum', 'topics']);
  assert.equal(errorSnapshot.status, 'error');
  assert.equal(errorSnapshot.error?.message, 'Falha na revalidação');
  assert.equal(errorSnapshot.revalidating, false);

  await cache.retry('s1', ['forum', 'topics'], async () => {
    calls++;
    return 200;
  });
  assert.equal(calls, 3);
  assert.equal(cache.getSnapshot<number>('s1', ['forum', 'topics']).status, 'success');
  assert.equal(cache.getSnapshot<number>('s1', ['forum', 'topics']).data, 200);
  unsub();
});

test('cache invalidateQueries matches prefixes selectively without touching unrelated entries', async () => {
  const cache = createHttpQueryCache();
  cache.setSessionKey('s1');
  let aCalls = 0;
  let bCalls = 0;
  let cCalls = 0;

  const uA = cache.subscribe('s1', ['assessments', 'a1'], () => {});
  const uB = cache.subscribe('s1', ['assessments', 'a2'], () => {});
  const uC = cache.subscribe('s1', ['forum', 'topics'], () => {});

  await cache.ensure('s1', ['assessments', 'a1'], async () => ++aCalls);
  await cache.ensure('s1', ['assessments', 'a2'], async () => ++bCalls);
  await cache.ensure('s1', ['forum', 'topics'], async () => ++cCalls);

  await cache.invalidateQueries(['assessments', 'a1']);
  assert.equal(aCalls, 2);
  assert.equal(bCalls, 1);
  assert.equal(cCalls, 1);

  await cache.invalidateQueries('assessments');
  assert.equal(aCalls, 3);
  assert.equal(bCalls, 2);
  assert.equal(cCalls, 1);

  uA();
  uB();
  uC();
});

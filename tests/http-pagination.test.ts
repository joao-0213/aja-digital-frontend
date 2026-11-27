import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpError } from '@/lib/http-client';
import { collectAllPages } from '@/lib/http-pagination';

test('collectAllPages collects multiple pages in order', async () => {
  const seenPages: number[] = [];
  const items = await collectAllPages<string>(async (page) => {
    seenPages.push(page);
    if (page === 1) return { items: ['a', 'b'], page: 1, pageSize: 2, total: 5 };
    if (page === 2) return { items: ['c', 'd'], page: 2, pageSize: 2, total: 5 };
    return { items: ['e'], page: 3, pageSize: 2, total: 5 };
  });

  assert.deepEqual(seenPages, [1, 2, 3]);
  assert.deepEqual(items, ['a', 'b', 'c', 'd', 'e']);
});

test('collectAllPages respects variable total across pages', async () => {
  const seenPages: number[] = [];
  const items = await collectAllPages<number>(async (page) => {
    seenPages.push(page);
    if (page === 1) return { items: [1, 2], page: 1, pageSize: 2, total: 4 };
    return { items: [3], page: 2, pageSize: 2, total: 3 };
  });

  assert.deepEqual(seenPages, [1, 2]);
  assert.deepEqual(items, [1, 2, 3]);
});

test('collectAllPages stops cleanly on an intermediate empty page without infinite loop', async () => {
  const seenPages: number[] = [];
  const items = await collectAllPages<string>(async (page) => {
    seenPages.push(page);
    if (page === 1) return { items: ['a', 'b'], page: 1, pageSize: 2, total: 10 };
    return { items: [], page: 2, pageSize: 2, total: 10 };
  });

  assert.deepEqual(seenPages, [1, 2]);
  assert.deepEqual(items, ['a', 'b']);
});

test('collectAllPages propagates mid-pagination failures without partial success', async () => {
  await assert.rejects(
    () =>
      collectAllPages<string>(async (page) => {
        if (page === 1) return { items: ['a'], page: 1, pageSize: 1, total: 2 };
        throw new HttpError('unavailable', 'Serviço indisponível.');
      }),
    /Serviço indisponível/
  );
});

test('collectAllPages stops immediately when AbortSignal is already aborted or aborts mid-run', async () => {
  const preAborted = new AbortController();
  preAborted.abort();
  let calls = 0;
  await assert.rejects(
    () =>
      collectAllPages<string>(
        async () => {
          calls++;
          return { items: ['a'], page: 1, pageSize: 1, total: 2 };
        },
        { signal: preAborted.signal }
      ),
    (error: unknown) => error instanceof HttpError && error.kind === 'cancelled'
  );
  assert.equal(calls, 0);

  const midController = new AbortController();
  let midCalls = 0;
  await assert.rejects(
    () =>
      collectAllPages<string>(
        async (page) => {
          midCalls++;
          if (page === 1) {
            midController.abort();
            return { items: ['a'], page: 1, pageSize: 1, total: 3 };
          }
          return { items: ['b'], page: 2, pageSize: 1, total: 3 };
        },
        { signal: midController.signal }
      ),
    (error: unknown) => error instanceof HttpError && error.kind === 'cancelled'
  );
  assert.equal(midCalls, 1);
});

test('collectAllPages enforces session guard before and after each page', async () => {
  let valid = true;
  let calls = 0;
  await assert.rejects(
    () =>
      collectAllPages<string>(
        async (page) => {
          calls++;
          if (page === 1) {
            valid = false;
            return { items: ['a'], page: 1, pageSize: 1, total: 2 };
          }
          return { items: ['b'], page: 2, pageSize: 1, total: 2 };
        },
        {
          assertCurrent: () => {
            if (!valid) throw new HttpError('cancelled', 'Sessão alterada.');
          }
        }
      ),
    /Sessão alterada/
  );
  assert.equal(calls, 1);
});

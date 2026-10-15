import test from 'node:test';
import assert from 'node:assert/strict';
import { mockRequest, simulateNextFailure, NETWORK_DELAY_MS } from '../src/mocks/api.ts';
test('mock transport delays delivery and returns the requested value', async () => {
  const start = Date.now();
  assert.deepEqual(await mockRequest(() => ({
    ok: true
  })), {
    ok: true
  });
  assert.ok(Date.now() - start >= NETWORK_DELAY_MS - 20);
});
test('a configured failure affects only one request, and retry succeeds', async () => {
  simulateNextFailure();
  await assert.rejects(mockRequest(() => 42), /simulação/);
  assert.equal(await mockRequest(() => 42), 42);
});
test('aborted reads never return stale data', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(mockRequest(() => 42, controller.signal), {
    name: 'AbortError'
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { httpRoutes } from '../src/lib/http-routes.ts';

test('assessment list, quiz attempt and result routes are enabled', () => {
  assert.equal(httpRoutes.has('/questionarios'), true);
  assert.equal(httpRoutes.has('/questionarios/criar'), true);
  assert.equal(httpRoutes.has('/questionarios/responder'), true);
  assert.equal(httpRoutes.has('/questionarios/resultado'), true);
});

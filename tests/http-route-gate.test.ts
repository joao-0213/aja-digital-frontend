import test from 'node:test';
import assert from 'node:assert/strict';
import { httpRoutes } from '../src/lib/http-routes.ts';

test('assessment list and authoring routes are enabled while attempt and result routes remain gated', () => {
  assert.equal(httpRoutes.has('/questionarios'), true);
  assert.equal(httpRoutes.has('/questionarios/criar'), true);
  assert.equal(httpRoutes.has('/questionarios/responder'), false);
  assert.equal(httpRoutes.has('/questionarios/resultado'), false);
});

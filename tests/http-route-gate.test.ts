import test from 'node:test';
import assert from 'node:assert/strict';
import { httpRoutes } from '../src/lib/http-routes.ts';

test('assessment list, quiz attempt and result routes are enabled', () => {
  assert.equal(httpRoutes.has('/questionarios'), true);
  assert.equal(httpRoutes.has('/questionarios/criar'), true);
  assert.equal(httpRoutes.has('/questionarios/responder'), true);
  assert.equal(httpRoutes.has('/questionarios/resultado'), true);
});

test('announcement mural and calendar routes are enabled with their HTTP integration', () => {
  assert.equal(httpRoutes.has('/avisos'), true);
  assert.equal(httpRoutes.has('/calendario'), true);
});

test('forum list and contextual detail routes are enabled with their HTTP integration', () => {
  assert.equal(httpRoutes.has('/forum'), true);
  assert.equal(httpRoutes.has('/forum/topico'), true);
});

test('attendance is enabled only with its HTTP integration', () => {
  assert.equal(httpRoutes.has('/frequencia'), true);
});

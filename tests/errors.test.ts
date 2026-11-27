import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpError } from '@/lib/http-client';
import { isCancelledError, toErrorMessage } from '@/lib/errors';

test('isCancelledError recognizes cancelled HttpError and AbortError only', () => {
  assert.equal(isCancelledError(new HttpError('cancelled', 'x')), true);
  assert.equal(isCancelledError(new DOMException('aborted', 'AbortError')), true);
  assert.equal(isCancelledError(new HttpError('conflict', 'x')), false);
  assert.equal(isCancelledError(new Error('x')), false);
  assert.equal(isCancelledError(null), false);
  assert.equal(isCancelledError('AbortError'), false);
});

test('toErrorMessage uses the error message and falls back for unknown or empty causes', () => {
  assert.equal(toErrorMessage(new Error('Falhou.'), 'Padrão.'), 'Falhou.');
  assert.equal(toErrorMessage(new HttpError('http', 'Erro HTTP.'), 'Padrão.'), 'Erro HTTP.');
  assert.equal(toErrorMessage(new Error(''), 'Padrão.'), 'Padrão.');
  assert.equal(toErrorMessage('texto', 'Padrão.'), 'Padrão.');
  assert.equal(toErrorMessage(undefined, 'Padrão.'), 'Padrão.');
});

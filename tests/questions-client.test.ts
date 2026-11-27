import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuestionsApi } from '../src/features/questions/api.ts';
import { toggleBankSelection } from '../src/features/questions/lib/bank-selection.ts';

test('cliente codifica filtros e identificadores e mantém prática separada da leitura', async () => {
  const calls: Array<{ path: string; options: unknown }> = [];
  const api = createQuestionsApi({ request: async <T>(path: string, options?: unknown) => { calls.push({ path, options }); return {} as T; } });
  await api.list({ search: 'razão & dobro', subject: 'Matemática', topic: 'all', difficulty: 'easy', institution: 'all' }, 2);
  await api.read('q:2'); await api.practice('q:2', 1);
  assert.match(calls[0].path, /q=raz%C3%A3o\+%26\+dobro/);
  assert.match(calls[0].path, /page=2/);
  assert.equal(calls[1].path, '/questions/q%3A2');
  assert.deepEqual(calls[2], { path: '/questions/q%3A2/practice', options: { method: 'POST', json: { choice: 1 } } });
});

test('seleção do construtor conserva somente IDs e permite adicionar e remover sem duplicar', () => {
  assert.deepEqual(toggleBankSelection(['q1'], 'q2'), ['q1', 'q2']);
  assert.deepEqual(toggleBankSelection(['q1', 'q2'], 'q2'), ['q1']);
});

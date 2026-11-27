import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { cn } from '@/lib/utils';
// @ts-expect-error ESM script without declaration file
import { checkStaticExport, extractRoutesFromMatrix } from '../scripts/check-static-export.mjs';
// @ts-expect-error ESM script without declaration file
import { discoverTestFiles } from '../scripts/run-tests.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const matrixPath = path.join(projectRoot, 'docs', 'http', 'route-matrix.md');

test('Node test runner resolves @/ alias without explicit .ts extension and discovers tests deterministically', () => {
  assert.equal(cn('px-2', false && 'hidden', 'py-1'), 'px-2 py-1');
  const discovered = discoverTestFiles(projectRoot);
  const sorted = [...discovered].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(discovered, sorted);
  assert.ok(discovered.includes('tests/static-export-and-runner.test.ts'));
  assert.ok(discovered.includes('tests/client-boundary.test.mjs'));
  assert.ok(discovered.includes('tests/errors.test.ts'));
  assert.ok(discovered.includes('tests/http-pagination.test.ts'));
  assert.ok(discovered.includes('tests/session-draft-storage.test.ts'));
  assert.ok(discovered.length >= 56);
});

test('route-matrix.md defines the exact 22 product routes', () => {
  const routes = extractRoutesFromMatrix(fs.readFileSync(matrixPath, 'utf8'));
  assert.deepEqual(routes, [
    '/login',
    '/cadastro',
    '/recuperar-senha',
    '/perfil',
    '/usuarios',
    '/turmas',
    '/alunos',
    '/alunos/perfil',
    '/disciplinas',
    '/disciplinas/detalhes',
    '/materiais',
    '/questoes',
    '/questionarios',
    '/questionarios/criar',
    '/questionarios/responder',
    '/questionarios/resultado',
    '/avisos',
    '/calendario',
    '/forum',
    '/forum/topico',
    '/frequencia',
    '/'
  ]);
});

test('checkStaticExport validates all 22 routes in a fixture and fails deterministically when any route is missing', async (t) => {
  const tempOut = await mkdtemp(path.join(os.tmpdir(), 'aja-out-fixture-'));
  t.after(async () => {
    await rm(tempOut, { recursive: true, force: true });
  });

  const routes = extractRoutesFromMatrix(fs.readFileSync(matrixPath, 'utf8'));
  for (const route of routes) {
    const file =
      route === '/'
        ? path.join(tempOut, 'index.html')
        : path.join(tempOut, `${route.replace(/^\/+/, '')}.html`);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, '<!doctype html><html><body>ok</body></html>', 'utf8');
  }

  const ok = await checkStaticExport({ root: projectRoot, outDir: tempOut, matrixPath });
  assert.equal(ok.routes.length, 22);

  await rm(path.join(tempOut, 'disciplinas', 'detalhes.html'));
  await assert.rejects(
    () => checkStaticExport({ root: projectRoot, outDir: tempOut, matrixPath }),
    /\/disciplinas\/detalhes/
  );
});

test('checkStaticExport passes on the real out/ directory when built', async () => {
  const outDir = path.join(projectRoot, 'out');
  if (!fs.existsSync(outDir)) return;
  const result = await checkStaticExport({ root: projectRoot, outDir, matrixPath });
  assert.equal(result.routes.length, 22);
});

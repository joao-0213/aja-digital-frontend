import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkArchitecture } from '../scripts/check-architecture.mjs';
import { findClientImportViolations, isForbiddenClientImport, resolveClientImportTarget } from '../scripts/client-import-policy.mjs';
import { collectLocalReferences } from '../scripts/ts-local-references.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(projectRoot, 'src');

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(target) : /\.[cm]?[jt]sx?$/.test(entry.name) ? [target] : [];
  }));
  return nested.flat();
}

async function createTempWorkspace(t, files, pathsConfig = { '@/*': ['./src/*'] }) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aja-arq01-'));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const allFiles = {
    'tsconfig.json': JSON.stringify({ compilerOptions: { paths: pathsConfig } }, null, 2),
    ...files
  };
  for (const [relativePath, content] of Object.entries(allFiles)) {
    const fullPath = path.join(root, relativePath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, 'utf8');
  }
  return root;
}

test('frontend source does not import seeds or legacy browser transport/storage', async () => {
  const files = await sourceFiles(sourceRoot);
  const violations = findClientImportViolations(projectRoot, files).map(({ file, specifier }) => `${path.relative(sourceRoot, file)} -> ${specifier}`);
  assert.deepEqual(violations, [], 'remove seed, server, test transport, and legacy storage imports from src/');
});

test('frontend source satisfies all architecture boundaries and has no static cycles', () => {
  const { errors } = checkArchitecture(projectRoot);
  assert.deepEqual(errors, []);
});

test('client import policy resolves relative paths and aliases before classifying targets', () => {
  const importer = path.join(sourceRoot, 'features', 'forum', 'components', 'forum-page.tsx');
  const relativeSeed = '../../../../server/seed.mjs';
  const relativeServerFixture = '../../../../server/fixtures/proporcoes.pdf';
  const relativeTransport = '../../../../tests/http-server.test.mjs';
  const aliasedLegacyStorage = '@/lib/demo-storage';
  const aliasedServerFixture = '@/server/seed.mjs';
  const allowedAlias = '@/lib/utils';

  assert.equal(resolveClientImportTarget(projectRoot, importer, relativeSeed), path.join(projectRoot, 'server', 'seed.mjs'));
  assert.equal(isForbiddenClientImport(projectRoot, importer, relativeSeed), true);
  assert.equal(isForbiddenClientImport(projectRoot, importer, relativeServerFixture), true);
  assert.equal(isForbiddenClientImport(projectRoot, importer, relativeTransport), true);
  assert.equal(isForbiddenClientImport(projectRoot, importer, aliasedLegacyStorage), true);
  assert.equal(isForbiddenClientImport(projectRoot, importer, aliasedServerFixture), true);
  assert.equal(isForbiddenClientImport(projectRoot, importer, allowedAlias), false);
});

test('client import policy handles relative, tsconfig alias, reexport, dynamic import, type-only and mixed value imports', async t => {
  const root = await createTempWorkspace(t, {
    'server/seed.mjs': 'export const seed = {};\n',
    'tests/support/legacy/demo-storage.ts': 'export type LegacyHelper = { ok: boolean };\nexport const migrate = () => null;\n',
    'src/models/database.ts': 'export interface MockDatabase { users: unknown[] }\nexport const loadDb = () => ({ users: [] });\n',
    'src/models/legacy.ts': 'export interface LegacyRecord { id: string }\nexport const legacyMarker = 1;\n',
    'src/lib/demo-storage.ts': 'export type LegacyStore = { ok: boolean };\nexport const readStore = () => null;\n',
    'src/lib/pure.ts': 'export const ok = true;\n',
    'src/features/alpha/ok-types.ts': [
      "import type { MockDatabase } from '@/models/database';",
      "import { type MockDatabase as InlineDb } from '../../models/database';",
      "export type { MockDatabase as ReexportedDb } from '@/models/database';",
      "export { type MockDatabase as InlineReexportedDb } from '../../models/database';",
      "export type { LegacyRecord } from '@/models/legacy';",
      "export type QueryDb = import('@/models/database').MockDatabase;",
      "import { ok } from '@/lib/pure';",
      'export type Combined = [MockDatabase, InlineDb, QueryDb];',
      'export const flag = ok;'
    ].join('\n'),
    'src/features/alpha/bad-mixed.ts': "import { type MockDatabase, loadDb } from '@/models/database';\nexport { loadDb };\nexport type Db = MockDatabase;\n",
    'src/features/alpha/bad-legacy-model-value.ts': "import { legacyMarker } from '@/models/legacy';\nexport const n = legacyMarker;\n",
    'src/features/alpha/bad-legacy-support-type.ts': "import type { LegacyHelper } from '../../../tests/support/legacy/demo-storage';\nexport type H = LegacyHelper;\n",
    'src/features/alpha/bad-reexport.ts': "export * from '../../../server/seed.mjs';\n",
    'src/features/alpha/bad-dynamic.ts': "export const loadSeed = () => import('../../../server/seed.mjs');\n",
    'src/features/alpha/bad-legacy-type.ts': "import { type LegacyStore } from '@/lib/demo-storage';\nexport type S = LegacyStore;\n"
  });

  const files = await sourceFiles(path.join(root, 'src'));
  const violations = findClientImportViolations(root, files).map(({ file, specifier }) => (
    `${path.relative(path.join(root, 'src'), file).replaceAll('\\', '/')} -> ${specifier}`
  )).sort();

  assert.deepEqual(violations, [
    'features/alpha/bad-dynamic.ts -> ../../../server/seed.mjs',
    'features/alpha/bad-legacy-model-value.ts -> @/models/legacy',
    'features/alpha/bad-legacy-support-type.ts -> ../../../tests/support/legacy/demo-storage',
    'features/alpha/bad-legacy-type.ts -> @/lib/demo-storage',
    'features/alpha/bad-mixed.ts -> @/models/database',
    'features/alpha/bad-reexport.ts -> ../../../server/seed.mjs'
  ]);
});

test('architecture check enforces feature public entries across static, reexport, dynamic import and import type', async t => {
  const root = await createTempWorkspace(t, {
    'src/features/alpha/api.ts': 'export const alphaApi = () => 1;\nexport interface PrivateAlpha { id: string }\n',
    'src/features/alpha/index.ts': "export { alphaApi } from './api';\n",
    'src/features/beta/valid.ts': "import { alphaApi } from '@/features/alpha';\nexport const beta = alphaApi;\n",
    'src/features/beta/bad-relative.ts': "import { alphaApi } from '../alpha/api';\nexport const x = alphaApi;\n",
    'src/features/beta/bad-reexport.ts': "export { alphaApi } from '@/features/alpha/api';\n",
    'src/features/beta/bad-dynamic.ts': "export const loadPrivate = () => import('@/features/alpha/api');\n",
    'src/features/beta/bad-import-type.ts': "export type Leak = import('../alpha/api').PrivateAlpha;\n"
  });

  const { errors } = checkArchitecture(root);
  assert.equal(errors.length, 4);
  assert.ok(errors.some(error => error.includes('src/features/beta/bad-relative.ts') && error.includes('use a entrada pública de alpha')));
  assert.ok(errors.some(error => error.includes('src/features/beta/bad-reexport.ts') && error.includes('use a entrada pública de alpha')));
  assert.ok(errors.some(error => error.includes('src/features/beta/bad-dynamic.ts') && error.includes('use a entrada pública de alpha')));
  assert.ok(errors.some(error => error.includes('src/features/beta/bad-import-type.ts') && error.includes('use a entrada pública de alpha')));
});

test('architecture check blocks src/hooks from importing features or routes, including dynamic import', async t => {
  const root = await createTempWorkspace(t, {
    'src/app/page.tsx': 'export default function Page() { return null; }\n',
    'src/lib/query.ts': 'export const createQuery = () => ({});\n',
    'src/providers/app-context.ts': 'export const useSession = () => ({});\n',
    'src/features/materials/index.ts': 'export const createStudyTools = () => [];\n',
    'src/hooks/use-valid.ts': "import { createQuery } from '@/lib/query';\nimport { useSession } from '@/providers/app-context';\nexport const useValid = () => [createQuery, useSession];\n",
    'src/hooks/use-bad-feature.ts': "import { createStudyTools } from '@/features/materials';\nexport const useBad = () => createStudyTools();\n",
    'src/hooks/use-bad-dynamic.ts': "export const loadFeature = () => import('@/features/materials');\n",
    'src/hooks/use-bad-route.ts': "import Page from '@/app/page';\nexport const badRoute = Page;\n"
  });

  const { errors } = checkArchitecture(root);
  assert.ok(errors.some(error => error.includes('src/hooks/use-bad-feature.ts') && error.includes('@/features/materials')));
  assert.ok(errors.some(error => error.includes('src/hooks/use-bad-dynamic.ts') && error.includes('@/features/materials')));
  assert.ok(errors.some(error => error.includes('src/hooks/use-bad-route.ts') && error.includes('@/app/page')));
  assert.ok(!errors.some(error => error.includes('src/hooks/use-valid.ts')));
});

test('architecture check distinguishes static value cycles (including mixed imports) from type-only cycles', async t => {
  const typeOnlyRoot = await createTempWorkspace(t, {
    'src/lib/a.ts': "import type { B } from './b';\nexport interface A { b?: B }\nexport const aVal = 1;\n",
    'src/lib/b.ts': "import { type A } from './a';\nexport interface B { a?: A }\n",
    'src/lib/c.ts': "export { type D } from './d';\nexport interface C { id: string }\n",
    'src/lib/d.ts': "export type CRef = import('./c').C;\nexport interface D { c?: CRef }\n",
    'src/lib/e.ts': "export { type F } from './f';\nexport interface E { id: string }\n",
    'src/lib/f.ts': "export { type E } from './e';\nexport interface F { id: string }\n"
  });
  assert.deepEqual(checkArchitecture(typeOnlyRoot).errors, []);

  const mixedCycleRoot = await createTempWorkspace(t, {
    'src/lib/a.ts': "import { type B, bVal } from './b';\nexport interface A { b?: B }\nexport const aVal = bVal + 1;\n",
    'src/lib/b.ts': "import { aVal } from './a';\nexport interface B { n: number }\nexport const bVal = aVal;\n"
  });
  const mixedErrors = checkArchitecture(mixedCycleRoot).errors;
  assert.equal(mixedErrors.length, 1);
  assert.match(mixedErrors[0], /^Dependência circular: src\/lib\/a\.ts -> src\/lib\/b\.ts -> src\/lib\/a\.ts$/);
});

test('shared ts-local-references reader classifies reference natures and resolves tsconfig paths and extensions', async t => {
  const root = await createTempWorkspace(t, {
    'src/lib/helper.mjs': 'export const helper = 1;\n',
    'src/components/ui/card.jsx': 'export function Card() { return null; }\n',
    'src/models/types.ts': 'export interface Item { id: string }\nexport const itemDefault = {};\n',
    'src/features/alpha/sample.tsx': [
      "import './missing.css';",
      "import type { Item } from '#models/types';",
      "import { type Item as InlineItem } from '../../models/types';",
      "import { type Item as MixedItem, itemDefault } from '#models/types';",
      "export type { Item as ExportedItem } from '#models/types';",
      "export { type Item as InlineExportedItem } from '#models/types';",
      "export { helper } from '@/lib/helper';",
      "export const loadCard = () => import('@/components/ui/card');",
      "export type CardModule = typeof import('@/components/ui/card');",
      "import React from 'react';",
      'export const keep = [itemDefault, React];',
      'export type KeepTypes = [Item, InlineItem, MixedItem, CardModule];'
    ].join('\n')
  }, { '@/*': ['./src/*'], '#models/*': ['./src/models/*'] });

  const sampleFile = path.join(root, 'src', 'features', 'alpha', 'sample.tsx');
  const refs = collectLocalReferences(root, sampleFile).map(ref => ({
    specifier: ref.specifier,
    found: Boolean(ref.target),
    syntax: ref.syntax,
    typeOnly: ref.typeOnly,
    staticValue: ref.staticValue,
    dynamic: ref.dynamic,
    sideEffect: ref.sideEffect
  }));

  assert.deepEqual(refs, [
    { specifier: './missing.css', found: false, syntax: 'import', typeOnly: false, staticValue: true, dynamic: false, sideEffect: true },
    { specifier: '#models/types', found: true, syntax: 'import', typeOnly: true, staticValue: false, dynamic: false, sideEffect: false },
    { specifier: '../../models/types', found: true, syntax: 'import', typeOnly: true, staticValue: false, dynamic: false, sideEffect: false },
    { specifier: '#models/types', found: true, syntax: 'import', typeOnly: false, staticValue: true, dynamic: false, sideEffect: false },
    { specifier: '#models/types', found: true, syntax: 'export', typeOnly: true, staticValue: false, dynamic: false, sideEffect: false },
    { specifier: '#models/types', found: true, syntax: 'export', typeOnly: true, staticValue: false, dynamic: false, sideEffect: false },
    { specifier: '@/lib/helper', found: true, syntax: 'export', typeOnly: false, staticValue: true, dynamic: false, sideEffect: false },
    { specifier: '@/components/ui/card', found: true, syntax: 'dynamic-import', typeOnly: false, staticValue: false, dynamic: true, sideEffect: false },
    { specifier: '@/components/ui/card', found: true, syntax: 'import-type', typeOnly: true, staticValue: false, dynamic: false, sideEffect: false }
  ]);
});

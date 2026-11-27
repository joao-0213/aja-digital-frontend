import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { findClientImportViolations, isForbiddenClientImport, resolveClientImportTarget } from '../scripts/client-import-policy.mjs';

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

test('frontend source does not import seeds or legacy browser transport/storage', async () => {
  const files = await sourceFiles(sourceRoot);
  const violations = findClientImportViolations(projectRoot, files).map(({ file, specifier }) => `${path.relative(sourceRoot, file)} -> ${specifier}`);
  assert.deepEqual(violations, [], 'remove seed, server, test transport, and legacy storage imports from src/');
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

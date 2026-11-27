import fs from 'node:fs';
import path from 'node:path';
import { collectLocalReferences, resolveLocalModule } from './ts-local-references.mjs';

const legacySourcePaths = new Set([
  'lib/demo-storage',
  'lib/demo-mutations',
  'lib/material-files',
  'models/database',
  'models/legacy',
  'providers/use-demo-state',
  'hooks/use-mock-query',
  'hooks/use-activity-clock'
]);

function classifySourceTarget(root, target) {
  const sourceRoot = path.resolve(root, 'src');
  const relative = path.relative(sourceRoot, target).replaceAll('\\', '/');
  if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) {
    return { outsideSource: true, withoutExtension: '' };
  }
  return { outsideSource: false, withoutExtension: relative.replace(/\.[^./]+$/, '') };
}

export function resolveClientImportTarget(root, importerFile, specifier) {
  return resolveLocalModule(root, importerFile, specifier)?.candidateTarget ?? null;
}

export function isForbiddenClientImport(root, importerFile, specifier) {
  const target = resolveClientImportTarget(root, importerFile, specifier);
  if (!target) return false;
  const { outsideSource, withoutExtension } = classifySourceTarget(root, target);
  if (outsideSource) return true;
  const segments = withoutExtension.split('/');
  if (segments.some(segment => ['mocks', 'server', 'tests', 'test', 'fixtures', '__fixtures__'].includes(segment))) return true;
  return legacySourcePaths.has(withoutExtension);
}

function isErasedModelDatabaseReference(root, reference) {
  if (!reference.typeOnly || !reference.candidateTarget) return false;
  // The legacy rule modules and model barrel still share these types for server/tests; type-only edges are erased by TS.
  const { outsideSource, withoutExtension } = classifySourceTarget(root, reference.candidateTarget);
  return !outsideSource && (withoutExtension === 'models/database' || withoutExtension === 'models/legacy');
}

export function sourceModuleSpecifiers(root, file, source) {
  return collectLocalReferences(root, file, source)
    .filter(reference => !isErasedModelDatabaseReference(root, reference))
    .map(reference => reference.specifier);
}

export function findClientImportViolations(root, sourceFiles) {
  const violations = [];
  for (const file of sourceFiles) {
    const source = fs.readFileSync(file, 'utf8');
    for (const specifier of sourceModuleSpecifiers(root, file, source)) {
      if (isForbiddenClientImport(root, file, specifier)) violations.push({ file, specifier });
    }
  }
  return violations;
}

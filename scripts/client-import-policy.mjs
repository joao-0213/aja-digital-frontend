import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'];
const legacySourcePaths = new Set([
  'lib/demo-storage',
  'lib/demo-mutations',
  'lib/material-files',
  'models/database',
  'providers/use-demo-state',
  'hooks/use-mock-query',
  'hooks/use-activity-clock',
]);

function resolveAlias(root, specifier) {
  const configPath = path.join(root, 'tsconfig.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const paths = config.compilerOptions?.paths ?? {};
  const baseUrl = path.resolve(root, config.compilerOptions?.baseUrl ?? '.');

  for (const [pattern, substitutions] of Object.entries(paths)) {
    const star = pattern.indexOf('*');
    const prefix = star < 0 ? pattern : pattern.slice(0, star);
    const suffix = star < 0 ? '' : pattern.slice(star + 1);
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue;
    const capture = specifier.slice(prefix.length, specifier.length - suffix.length || undefined);
    return substitutions.map(substitution => {
      const target = substitution.replace('*', capture);
      return path.resolve(baseUrl, target);
    });
  }
  return [];
}

function resolveFileCandidate(base) {
  const candidates = path.extname(base)
    ? [base]
    : [base, ...extensions.map(extension => `${base}${extension}`), ...extensions.map(extension => path.join(base, `index${extension}`))];
  return candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? candidates[0];
}

export function resolveClientImportTarget(root, importerFile, specifier) {
  let bases;
  if (specifier.startsWith('.')) bases = [path.resolve(path.dirname(importerFile), specifier)];
  else if (specifier.startsWith('@/')) bases = resolveAlias(root, specifier);
  else return null;
  return bases.length ? resolveFileCandidate(bases[0]) : null;
}

export function isForbiddenClientImport(root, importerFile, specifier) {
  const target = resolveClientImportTarget(root, importerFile, specifier);
  if (!target) return false;
  const sourceRoot = path.resolve(root, 'src');
  const relative = path.relative(sourceRoot, target).replaceAll('\\', '/');
  if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) return true;
  const withoutExtension = relative.replace(/\.[^.\/]+$/, '');
  const segments = withoutExtension.split('/');
  if (segments.some(segment => ['mocks', 'server', 'tests', 'test', 'fixtures', '__fixtures__'].includes(segment))) return true;
  return legacySourcePaths.has(withoutExtension);
}

export function sourceModuleSpecifiers(root, file, source) {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const specifiers = [];
  const addString = node => {
    if (node && ts.isStringLiteralLike(node)) specifiers.push(node.text);
  };
  const visit = node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      const clause = ts.isImportDeclaration(node) ? node.importClause : node.exportClause;
      const named = clause && 'elements' in clause && clause.elements;
      const onlyTypes = ts.isImportDeclaration(node)
        ? !!node.importClause?.isTypeOnly || !!named && named.length > 0 && named.every(element => element.isTypeOnly)
        : !!node.isTypeOnly || !!named && named.length > 0 && named.every(element => element.isTypeOnly);
      if (!(onlyTypes && isTypeOnlyModelDatabaseExport(root, file, node.moduleSpecifier.text))) addString(node.moduleSpecifier);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) addString(node.arguments[0]);
    if (ts.isImportTypeNode(node)) addString(node.argument.literal);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specifiers;
}

function isTypeOnlyModelDatabaseExport(root, importerFile, specifier) {
  const target = resolveClientImportTarget(root, importerFile, specifier);
  // The legacy rule modules still share this type for server/tests; this barrel edge is erased by TS.
  return target === resolveFileCandidate(path.join(root, 'src', 'models', 'database'));
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

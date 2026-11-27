import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export const SOURCE_FILE_PATTERN = /\.[cm]?[jt]sx?$/;
export const MODULE_EXTENSIONS = ['.ts', '.tsx', '.d.ts', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json'];

const tsconfigCache = new Map();

export function walkSourceFiles(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));
  return entries.flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkSourceFiles(fullPath);
    return SOURCE_FILE_PATTERN.test(entry.name) ? [fullPath] : [];
  });
}

export function scriptKindForFile(file) {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (file.endsWith('.js') || file.endsWith('.mjs') || file.endsWith('.cjs')) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

export function parseTypeScriptFile(file, sourceText = fs.readFileSync(file, 'utf8')) {
  return ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, scriptKindForFile(file));
}

function readTsconfigPaths(root) {
  const normalizedRoot = path.resolve(root);
  const configPath = path.join(normalizedRoot, 'tsconfig.json');
  if (!fs.existsSync(configPath)) {
    return { baseUrl: normalizedRoot, paths: { '@/*': ['./src/*'] } };
  }
  const mtimeMs = fs.statSync(configPath).mtimeMs;
  const cached = tsconfigCache.get(configPath);
  if (cached && cached.mtimeMs === mtimeMs) return cached.value;

  const parsed = ts.readConfigFile(configPath, ts.sys.readFile);
  const compilerOptions = parsed.config?.compilerOptions ?? {};
  const value = {
    baseUrl: path.resolve(normalizedRoot, compilerOptions.baseUrl ?? '.'),
    paths: compilerOptions.paths ?? {}
  };
  tsconfigCache.set(configPath, { mtimeMs, value });
  return value;
}

function resolveAliasBases(root, specifier) {
  const { baseUrl, paths } = readTsconfigPaths(root);
  for (const [pattern, substitutions] of Object.entries(paths)) {
    const star = pattern.indexOf('*');
    if (star < 0) {
      if (specifier !== pattern) continue;
      return substitutions.map(substitution => path.resolve(baseUrl, substitution));
    }
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix) || specifier.length < prefix.length + suffix.length) continue;
    const capture = specifier.slice(prefix.length, suffix.length ? -suffix.length : undefined);
    return substitutions.map(substitution => path.resolve(baseUrl, substitution.replace('*', capture)));
  }
  return [];
}

function candidatePathsForBase(base) {
  return [
    base,
    ...MODULE_EXTENSIONS.map(extension => `${base}${extension}`),
    ...MODULE_EXTENSIONS.map(extension => path.join(base, `index${extension}`))
  ];
}

export function resolveLocalModule(root, importerFile, specifier) {
  let bases;
  if (specifier.startsWith('.')) {
    bases = [path.resolve(path.dirname(importerFile), specifier)];
  } else if (path.isAbsolute(specifier)) {
    bases = [path.normalize(specifier)];
  } else {
    bases = resolveAliasBases(root, specifier);
  }
  if (!bases.length) return null;

  for (const base of bases) {
    const found = candidatePathsForBase(base).find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (found) return { specifier, target: found, candidateTarget: found };
  }
  return { specifier, target: null, candidateTarget: bases[0] };
}

export function collectLocalReferences(root, file, sourceOrAst) {
  const sourceFile = typeof sourceOrAst === 'string' || sourceOrAst === undefined
    ? parseTypeScriptFile(file, sourceOrAst)
    : sourceOrAst;

  const references = [];
  const pushReference = (specifier, syntax, typeOnly, sideEffect = false) => {
    const resolved = resolveLocalModule(root, file, specifier);
    if (!resolved) return;
    const dynamic = syntax === 'dynamic-import';
    references.push({
      file,
      specifier,
      target: resolved.target,
      candidateTarget: resolved.candidateTarget,
      syntax,
      typeOnly,
      staticValue: !typeOnly && !dynamic,
      dynamic,
      sideEffect
    });
  };

  const visit = node => {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const clause = node.importClause;
      const named = clause?.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements : null;
      const clauseTypeOnly = Boolean(clause?.isTypeOnly || clause?.phaseModifier === ts.SyntaxKind.TypeKeyword);
      const inlineTypeOnly = Boolean(clause && !clause.name && named && named.length > 0 && named.every(element => element.isTypeOnly));
      pushReference(node.moduleSpecifier.text, 'import', clauseTypeOnly || inlineTypeOnly, !clause);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const named = node.exportClause && ts.isNamedExports(node.exportClause) ? node.exportClause.elements : null;
      const inlineTypeOnly = Boolean(named && named.length > 0 && named.every(element => element.isTypeOnly));
      pushReference(node.moduleSpecifier.text, 'export', Boolean(node.isTypeOnly) || inlineTypeOnly);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression && ts.isStringLiteralLike(node.moduleReference.expression)) {
      pushReference(node.moduleReference.expression.text, 'import-equals', Boolean(node.isTypeOnly));
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length > 0 && ts.isStringLiteralLike(node.arguments[0])) {
      pushReference(node.arguments[0].text, 'dynamic-import', false);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) {
      pushReference(node.argument.literal.text, 'import-type', true);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return references;
}

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const normalize = value => value.replaceAll('\\', '/');
const relative = file => normalize(path.relative(root, file));
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(file) : /\.tsx?$/.test(file) ? [file] : [];
});
const files = walk(path.join(root, 'src'));
const graph = new Map(files.map(file => [file, []]));
const errors = [];
const domain = file => relative(file).match(/^src\/features\/([^/]+)\//)?.[1];
const resolve = (file, specifier) => {
  const base = specifier.startsWith('@/') ? path.join(root, 'src', specifier.slice(2)) : path.resolve(path.dirname(file), specifier);
  return [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]
    .find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
};

for (const file of files) {
  const source = relative(file);
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  if (source === 'src/app/layout.tsx' && !sf.statements.some(statement => ts.isImportDeclaration(statement) && !statement.importClause && statement.moduleSpecifier.text === './globals.css')) {
    errors.push(`${source}: preserve o import dos estilos globais da aplicação.`);
  }
  if (/^src\/app\/(.*\/)?(page|layout)\.tsx$/.test(source) && sf.statements.some(statement => ts.isExpressionStatement(statement) && statement.expression.text === 'use client')) {
    errors.push(`${source}: páginas e layouts devem compor as fronteiras cliente das features.`);
  }
  for (const statement of sf.statements) {
    if (!(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) || !statement.moduleSpecifier) continue;
    const specifier = statement.moduleSpecifier.text;
    if (!(specifier.startsWith('@/') || specifier.startsWith('.'))) continue;
    const target = resolve(file, specifier);
    if (!target) { errors.push(`${source}: import interno inexistente: ${specifier}`); continue; }
    const destination = relative(target);
    if (!source.startsWith('src/app/') && destination.startsWith('src/app/')) {
      errors.push(`${source}: módulos reutilizáveis não podem importar rotas (${specifier}).`);
    }
    if (/^src\/components\/(ui|shared)\//.test(source) && /^src\/(features|providers|mocks|models)\//.test(destination)) {
      errors.push(`${source}: UI genérica não pode depender de domínio ou estado da aplicação (${specifier}).`);
    }
    if (source.startsWith('src/components/ui/') && /^src\/components\/(shared|layout)\//.test(destination)) {
      errors.push(`${source}: elementos de UI não podem importar composições (${specifier}).`);
    }
    if (domain(target) && domain(file) !== domain(target) && destination !== `src/features/${domain(target)}/index.ts`) {
      errors.push(`${source}: use a entrada pública de ${domain(target)} (${specifier}).`);
    }
    if (source.startsWith('src/features/') && destination === 'src/components/providers.tsx') {
      errors.push(`${source}: use o contrato de src/providers/app-context.ts (${specifier}).`);
    }
    if (/^src\/(models|lib|mocks)\//.test(source) && /^src\/(app|features|components|providers)\//.test(destination)) {
      errors.push(`${source}: tipos, regras e infraestrutura não podem depender da interface (${specifier}).`);
    }
    const clause = ts.isImportDeclaration(statement) ? statement.importClause : null;
    const typeOnly = statement.isTypeOnly || clause?.isTypeOnly || clause && !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.length > 0 && clause.namedBindings.elements.every(binding => binding.isTypeOnly);
    if (!typeOnly) graph.get(file).push(target);
  }
}

const active = new Set();
const visited = new Set();
const visit = (file, trail) => {
  if (active.has(file)) {
    errors.push(`Dependência circular: ${[...trail.slice(trail.indexOf(file)), file].map(relative).join(' -> ')}`);
    return;
  }
  if (visited.has(file)) return;
  active.add(file);
  for (const target of graph.get(file) ?? []) visit(target, [...trail, file]);
  active.delete(file);
  visited.add(file);
};
for (const file of files) visit(file, []);

if (errors.length) {
  process.stderr.write(`${errors.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Arquitetura validada: ${files.length} módulos, fronteiras preservadas e nenhum ciclo de imports estáticos.\n`);
}

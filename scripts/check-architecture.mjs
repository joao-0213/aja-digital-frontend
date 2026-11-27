import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { collectLocalReferences, parseTypeScriptFile, walkSourceFiles } from './ts-local-references.mjs';

const defaultRoot = fileURLToPath(new URL('../', import.meta.url));
const normalize = value => value.replaceAll('\\', '/');

export function checkArchitecture(root = defaultRoot) {
  const resolvedRoot = path.resolve(root);
  const relative = file => normalize(path.relative(resolvedRoot, file));
  const srcDir = path.join(resolvedRoot, 'src');
  const files = fs.existsSync(srcDir) ? walkSourceFiles(srcDir) : [];
  const graph = new Map(files.map(file => [file, []]));
  const errors = [];
  const domain = file => relative(file).match(/^src\/features\/([^/]+)\//)?.[1];

  for (const file of files) {
    const source = relative(file);
    const sf = parseTypeScriptFile(file);
    const references = collectLocalReferences(resolvedRoot, file, sf);
    if (source === 'src/app/layout.tsx' && !references.some(ref => ref.syntax === 'import' && ref.sideEffect && ref.specifier === './globals.css')) {
      errors.push(`${source}: preserve o import dos estilos globais da aplicação.`);
    }
    if (/^src\/app\/(.*\/)?(page|layout)\.tsx$/.test(source) && sf.statements.some(statement => ts.isExpressionStatement(statement) && ts.isStringLiteralLike(statement.expression) && statement.expression.text === 'use client')) {
      errors.push(`${source}: páginas e layouts devem compor as fronteiras cliente das features.`);
    }
    for (const ref of references) {
      const { specifier, target } = ref;
      if (!target) {
        errors.push(`${source}: import interno inexistente: ${specifier}`);
        continue;
      }
      const destination = relative(target);
      if (!destination.startsWith('src/')) {
        errors.push(`${source}: módulos em src/ não podem importar fora de src/ (${specifier}).`);
      }
      if (!source.startsWith('src/app/') && destination.startsWith('src/app/')) {
        errors.push(`${source}: módulos reutilizáveis não podem importar rotas (${specifier}).`);
      }
      if (/^src\/components\/(ui|shared)\//.test(source) && /^src\/(features|providers|mocks|models)\//.test(destination)) {
        errors.push(`${source}: UI genérica não pode depender de domínio ou estado da aplicação (${specifier}).`);
      }
      if (source.startsWith('src/components/ui/') && /^src\/components\/(shared|layout)\//.test(destination)) {
        errors.push(`${source}: elementos de UI não podem importar composições (${specifier}).`);
      }
      if (domain(target) && domain(file) !== domain(target) && !/^src\/features\/[^/]+\/index\.[cm]?[jt]sx?$/.test(destination)) {
        errors.push(`${source}: use a entrada pública de ${domain(target)} (${specifier}).`);
      }
      if (/^src\/(features|hooks)\//.test(source) && destination === 'src/components/providers.tsx') {
        errors.push(`${source}: use o contrato de src/providers/app-context.ts (${specifier}).`);
      }
      if (/^src\/(models|lib|mocks)\//.test(source) && /^src\/(app|features|components|providers|hooks)\//.test(destination)) {
        errors.push(`${source}: tipos, regras e infraestrutura não podem depender da interface (${specifier}).`);
      }
      if (source.startsWith('src/hooks/') && /^src\/(app|features)\//.test(destination)) {
        errors.push(`${source}: hooks compartilhados não podem depender de features ou rotas (${specifier}).`);
      }
      if (ref.staticValue && graph.has(target)) {
        const edges = graph.get(file);
        if (!edges.includes(target)) edges.push(target);
      }
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

  return { files, errors };
}

const isDirectExecution = Boolean(process.argv[1]) && fs.existsSync(process.argv[1])
  && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  const { files, errors } = checkArchitecture();
  if (errors.length) {
    process.stderr.write(`${errors.join('\n')}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`Arquitetura validada: ${files.length} módulos, fronteiras preservadas e nenhum ciclo de imports estáticos.\n`);
  }
}

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveLocalModule } from './ts-local-references.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function resolve(specifier, context, nextResolve) {
  if (
    context.parentURL?.startsWith('file://')
    && !context.parentURL.includes('/node_modules/')
    && !specifier.startsWith('node:')
    && !specifier.startsWith('file://')
    && (specifier.startsWith('.') || specifier.startsWith('@/') || specifier.startsWith('/'))
  ) {
    const parentFile = fileURLToPath(context.parentURL);
    const resolved = resolveLocalModule(projectRoot, parentFile, specifier);
    if (resolved?.target) {
      return { url: pathToFileURL(resolved.target).href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}

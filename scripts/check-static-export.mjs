import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const forbidden = [
  '@aja.local.test',
  'AjaLocal-',
  'Aja@2026',
  'Adriana Gestão',
  'teacher-unassigned',
  'student-pending',
  'server/seed.mjs',
  'seed.json',
  'useDemoState',
  'useMockQuery',
  'mockRequest',
  'aja-digital-demo-v1'
];

async function filesIn(directory) {
  const entries = await fsp.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(target) : [target];
  }));
  return nested.flat();
}

export function extractRoutesFromMatrix(markdown) {
  const sectionMatch = markdown.match(/## Cobertura das 22 rotas\r?\n([\s\S]*?)(?:\r?\n## |$)/);
  if (!sectionMatch) throw new Error('Seção "Cobertura das 22 rotas" não encontrada em docs/http/route-matrix.md.');
  const routes = [];
  for (const line of sectionMatch[1].split(/\r?\n/)) {
    const rowMatch = line.match(/^\|\s*\d+\s*\|\s*`([^`]+)`/);
    if (!rowMatch) continue;
    const raw = rowMatch[1].split(/[?#]/)[0].trim();
    const normalized = raw === '/' ? '/' : `/${raw.replace(/^\/+|\/+$/g, '')}`;
    if (!routes.includes(normalized)) routes.push(normalized);
  }
  return routes;
}

function exportedCandidates(outDir, route) {
  if (route === '/') return [path.join(outDir, 'index.html')];
  const relative = route.replace(/^\/+/, '');
  return [path.join(outDir, `${relative}.html`), path.join(outDir, relative, 'index.html')];
}

export async function checkStaticExport({
  root = defaultRoot,
  outDir = path.join(root, 'out'),
  matrixPath = path.join(root, 'docs', 'http', 'route-matrix.md')
} = {}) {
  assert.ok(await fsp.stat(outDir).catch(() => null), 'run npm run build before checking out/');
  const matrix = await fsp.readFile(matrixPath, 'utf8');
  const routes = extractRoutesFromMatrix(matrix);
  assert.equal(routes.length, 22, `esperadas 22 rotas na matriz, encontradas ${routes.length}`);

  const missingRoutes = [];
  for (const route of routes) {
    const exists = exportedCandidates(outDir, route).some(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (!exists) missingRoutes.push(route);
  }
  assert.deepEqual(missingRoutes, [], `páginas ausentes no export estático: ${missingRoutes.join(', ')}`);

  const files = await filesIn(outDir);
  const findings = [];
  for (const file of files) {
    const contents = await fsp.readFile(file);
    if (contents.includes(0)) continue;
    const text = contents.toString('utf8');
    for (const marker of forbidden) {
      if (text.includes(marker)) findings.push(`${path.relative(outDir, file)} contains a private seed/runtime marker`);
    }
  }
  assert.deepEqual(findings, [], 'private fixture content must stay out of the static export');
  return { fileCount: files.length, routes };
}

const isDirectExecution = Boolean(process.argv[1]) && fs.existsSync(process.argv[1])
  && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  const { fileCount, routes } = await checkStaticExport();
  process.stdout.write(`Static export boundary: ${fileCount} files scanned, ${routes.length} routes verified; no private seed/credential markers found.\n`);
}

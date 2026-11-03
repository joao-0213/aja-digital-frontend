import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('out');
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
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(target) : [target];
  }));
  return nested.flat();
}

assert.ok(await fs.stat(root).catch(() => null), 'run npm run build before checking out/');
const files = await filesIn(root);
const findings = [];
for (const file of files) {
  const contents = await fs.readFile(file);
  if (contents.includes(0)) continue;
  const text = contents.toString('utf8');
  for (const marker of forbidden) if (text.includes(marker)) findings.push(`${path.relative(root, file)} contains a private seed/runtime marker`);
}
assert.deepEqual(findings, [], 'private fixture content must stay out of the static export');
process.stdout.write(`Static export boundary: ${files.length} files scanned; no private seed/credential markers found.\n`);

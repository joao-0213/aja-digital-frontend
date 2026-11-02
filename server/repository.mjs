import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jsonServer from 'json-server';

export const runtimeRoot = fileURLToPath(new URL('./runtime/', import.meta.url));
const seedFile = fileURLToPath(new URL('./seed.json', import.meta.url));

function prepare(directory) {
  const absolute = path.resolve(directory);
  // Reject symlink/junction components before writing private runtime data.
  let current = path.parse(absolute).root;
  for (const segment of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('Pasta de execução não pode usar links simbólicos.');
  }
  fs.mkdirSync(absolute, { recursive: true });
  const filename = path.join(absolute, 'db.json');
  if (fs.existsSync(filename) && (!fs.lstatSync(filename).isFile() || fs.lstatSync(filename).isSymbolicLink())) throw new Error('Arquivo de execução inválido.');
  return filename;
}

export function openRepository(directory = runtimeRoot) {
  const filename = prepare(directory);
  if (!fs.existsSync(filename)) fs.copyFileSync(seedFile, filename, fs.constants.COPYFILE_EXCL);
  // Fail closed on corruption: never silently replace existing work with fixtures.
  const data = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error('Base de execução inválida.');
  const router = jsonServer.router(filename);
  return { db: router.db, filename };
}

export function resetRepository(directory = runtimeRoot, { allowedRoot = runtimeRoot } = {}) {
  if (path.resolve(directory) !== path.resolve(allowedRoot)) throw new Error('Reset restrito à pasta de execução.');
  const filename = prepare(directory);
  const temporary = path.join(path.dirname(filename), `.reset-${process.pid}-${Date.now()}.tmp`);
  try {
    fs.copyFileSync(seedFile, temporary, fs.constants.COPYFILE_EXCL);
    fs.renameSync(temporary, filename);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

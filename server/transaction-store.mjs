import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { synchronous } from './synchronous.mjs';

const queues = new Map();

export function atomicPersist(filename, state) {
  const temporary = path.join(path.dirname(filename), `.commit-${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
    fs.renameSync(temporary, filename);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

/** One process owns writes. All service instances sharing a file share its queue. */
export function createTransactionStore({ filename, persist = atomicPersist }) {
  const resolved = fs.realpathSync(filename);
  const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const enqueue = work => {
    const previous = queues.get(key) ?? Promise.resolve();
    const result = previous.catch(() => {}).then(work);
    const tail = result.catch(() => {});
    queues.set(key, tail);
    void tail.finally(() => { if (queues.get(key) === tail) queues.delete(key); });
    return result;
  };
  const latest = () => JSON.parse(fs.readFileSync(resolved, 'utf8'));
  return {
    read: () => enqueue(() => latest()),
    transact: mutate => enqueue(async () => {
      const before = latest();
      const draft = structuredClone(before);
      const result = synchronous(mutate(draft));
      if (JSON.stringify(before) !== JSON.stringify(draft)) {
        try { await persist(resolved, draft); }
        catch (cause) { throw Object.assign(new Error('Não foi possível salvar. Tente novamente.'), { status: 500, code: 'PERSISTENCE_FAILED', cause }); }
      }
      return structuredClone(result);
    })
  };
}

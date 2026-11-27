import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readConfig } from '../server/config.mjs';
import { openRepository, resetRepository } from '../server/repository.mjs';

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'aja-http-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function start(t, directory) {
  const child = spawn(process.execPath, ['--experimental-strip-types', 'server/index.mjs'], {
    env: { ...process.env, API_PORT: '0', AJA_TEST_RUNTIME: directory, NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await once(child, 'exit');
    }
  });
  let output = '';
  const address = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('API startup timeout'));
    }, 10000);
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/API pronta: (http:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`API exited ${code}: ${output}`));
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
  });
  return { child, address };
}

test('repository initializes once, persists across reopen, and reset restores seed without deleting unrelated files', async (t) => {
  const directory = await fixture(t);
  const repository = openRepository(directory);
  repository.db.set('probe', [{ id: 'persisted' }]).write();
  assert.deepEqual(openRepository(directory).db.get('probe').value(), [{ id: 'persisted' }]);
  await writeFile(path.join(directory, 'keep.txt'), 'preserve');
  resetRepository(directory, { allowedRoot: directory });
  assert.equal(openRepository(directory).db.has('probe').value(), false);
  assert.equal(await readFile(path.join(directory, 'keep.txt'), 'utf8'), 'preserve');
});

test('corrupt persisted data is rejected and preserved rather than replaced with seed', async (t) => {
  const directory = await fixture(t);
  openRepository(directory);
  await writeFile(path.join(directory, 'db.json'), '{broken');
  assert.throws(() => openRepository(directory));
  assert.equal(await readFile(path.join(directory, 'db.json'), 'utf8'), '{broken');
});

test('real API process serves documented health, blocks all raw routes and persists through restart', async (t) => {
  const directory = await fixture(t);
  const first = await start(t, directory);
  const response = await fetch(`${first.address}/api/v1/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', version: '1' });
  assert.equal((await fetch(`${first.address}/api/v1/health?unknown=1`)).status, 422);
  for (const route of [
    '/db',
    '/users',
    '/api/v1/credentials',
    '/credentials',
    '/outbox',
    '/files',
    '/runtime/db.json',
    '/api/v1/health/',
    '/API/v1/health',
    '/api/v1/%68ealth'
  ]) {
    assert.equal((await fetch(first.address + route)).status, 404, route);
  }
  assert.equal((await fetch(first.address + '/api/v1/users')).status, 401);
  assert.equal((await fetch(`${first.address}/api/v1/health`, { method: 'POST' })).status, 404);
  const allowed = await fetch(`${first.address}/api/v1/health`, {
    headers: { Origin: 'http://127.0.0.1:3000' }
  });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://127.0.0.1:3000');
  const preflight = await fetch(first.address + '/api/v1/health', {
    method: 'OPTIONS',
    headers: { Origin: 'http://127.0.0.1:3000', 'Access-Control-Request-Method': 'GET' }
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-methods'), 'GET');
  const denied = await fetch(`${first.address}/api/v1/health`, {
    headers: { Origin: 'https://untrusted.example' }
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  openRepository(directory)
    .db.set('probe', [{ id: 'restart' }])
    .write();
  first.child.kill();
  await once(first.child, 'exit');
  const second = await start(t, directory);
  assert.equal((await fetch(`${second.address}/api/v1/health`)).status, 200);
  assert.deepEqual(openRepository(directory).db.get('probe').value(), [{ id: 'restart' }]);
  resetRepository(directory, { allowedRoot: directory });
  assert.equal(openRepository(directory).db.has('probe').value(), false);
});

test('configuration rejects invalid ports, wildcard origins and production test runtime', () => {
  for (const API_PORT of ['0', '-1', 'abc', '65536', '3002.5', ''])
    assert.throws(() => readConfig({ API_PORT }));
  for (const API_ALLOWED_ORIGINS of [
    '*',
    'https://example.com/path',
    'null',
    'https://user:pass@example.com'
  ])
    assert.throws(() => readConfig({ API_ALLOWED_ORIGINS }));
  assert.throws(() => readConfig({ AJA_TEST_RUNTIME: '../outside', NODE_ENV: 'production' }));
  assert.equal(readConfig({}).port, 3102);
});

test('reset refuses arbitrary directories before making changes', async (t) => {
  const directory = await fixture(t);
  await writeFile(path.join(directory, 'db.json'), 'preserve');
  assert.throws(() => resetRepository(directory), /restrito/);
  assert.equal(await readFile(path.join(directory, 'db.json'), 'utf8'), 'preserve');
});

test('repository and reset reject a runtime junction without changing its target', async (t) => {
  const directory = await fixture(t);
  const target = await fixture(t);
  await writeFile(path.join(target, 'db.json'), '{"keep":[]}');
  const link = path.join(directory, 'runtime-link');
  await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => openRepository(link), /simbólicos/);
  assert.throws(() => resetRepository(link, { allowedRoot: link }), /simbólicos/);
  assert.equal(await readFile(path.join(target, 'db.json'), 'utf8'), '{"keep":[]}');
});

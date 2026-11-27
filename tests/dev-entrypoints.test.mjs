import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { readConfig } from '../server/config.mjs';

import { discoverTestFiles } from '../scripts/run-tests.mjs';

const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('default development commands use the configured API and keep JSON Server opt-in', () => {
  assert.match(packageJson.scripts.dev, /next dev/);
  assert.doesNotMatch(packageJson.scripts.dev, /server\/index\.mjs/);
  assert.doesNotMatch(packageJson.scripts['dev:full'], /dev-full\.mjs|server\/index\.mjs/);
  assert.equal(packageJson.scripts['dev:mock'], 'node scripts/dev-mock.mjs');
  assert.equal(packageJson.scripts.test, 'node scripts/run-tests.mjs');
  assert.ok(discoverTestFiles().includes('tests/dev-entrypoints.test.mjs'));
});

test('mock development launcher overrides an inherited gateway URL for Next', () => {
  const launcher = fs.readFileSync(new URL('../scripts/dev-mock.mjs', import.meta.url), 'utf8');
  const children = [];
  const processStub = {
    execPath: process.execPath,
    env: { NEXT_PUBLIC_API_URL: 'http://127.0.0.1:3002/api/v1' },
    on() {},
    exitCode: undefined
  };
  const source = launcher
    .replace(/^import \{ spawn \} from 'node:child_process';\r?\n/m, '')
    .replace(/^import \{ fileURLToPath \} from 'node:url';\r?\n/m, '')
    .replace("const root = fileURLToPath(new URL('../', import.meta.url));", "const root = 'C:/frontend';");

  vm.runInNewContext(source, {
    process: processStub,
    spawn(...args) {
      children.push(args);
      return { exitCode: null, kill() {}, on() {} };
    }
  });

  assert.equal(children.length, 2);
  assert.equal(children[0][2].env.API_PORT, '3102');
  assert.equal(children[1][2].env.NEXT_PUBLIC_API_URL, 'http://127.0.0.1:3102/api/v1');
  assert.match(children[0][1][1], /server\/index\.mjs/);
});

test('standalone mock API defaults away from the integrated gateway port', () => {
  assert.equal(readConfig({}).port, 3102);
});

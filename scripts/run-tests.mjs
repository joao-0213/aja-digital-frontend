import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_FILE_PATTERN = /\.test\.(ts|mjs)$/;

export function discoverTestFiles(root = defaultRoot) {
  const testsDir = path.join(root, 'tests');
  const walk = (directory) => {
    const entries = fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    return entries.flatMap((entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return walk(fullPath);
      return TEST_FILE_PATTERN.test(entry.name)
        ? [path.relative(root, fullPath).replaceAll('\\', '/')]
        : [];
    });
  };
  return fs.existsSync(testsDir) ? walk(testsDir).sort((a, b) => a.localeCompare(b)) : [];
}

const isDirectExecution =
  Boolean(process.argv[1]) &&
  fs.existsSync(process.argv[1]) &&
  fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  const cliTargets = process.argv.slice(2);
  const targets = cliTargets.length > 0 ? cliTargets : discoverTestFiles(defaultRoot);
  if (targets.length === 0) {
    process.stderr.write('Nenhum arquivo de teste encontrado em tests/.\n');
    process.exitCode = 1;
  } else {
    const hasConcurrencyFlag = cliTargets.some((arg) => arg.startsWith('--test-concurrency'));
    const concurrencyArgs =
      !hasConcurrencyFlag && process.platform === 'win32' ? ['--test-concurrency=4'] : [];
    const result = spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        '--import',
        './scripts/register-ts-paths.mjs',
        '--test',
        ...concurrencyArgs,
        ...targets
      ],
      { cwd: defaultRoot, stdio: 'inherit' }
    );
    process.exitCode = result.status ?? 1;
  }
}

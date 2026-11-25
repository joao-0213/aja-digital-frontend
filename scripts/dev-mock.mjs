import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const children = [
  spawn(process.execPath, ['--experimental-strip-types', 'server/index.mjs'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, API_PORT: '3102' }
  }),
  spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3000'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, NEXT_PUBLIC_API_URL: 'http://127.0.0.1:3102/api/v1' }
  })
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) if (child.exitCode === null) child.kill();
}
for (const child of children) {
  child.on('error', () => stop(1));
  child.on('exit', code => { if (!stopping) stop(code ?? 1); });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

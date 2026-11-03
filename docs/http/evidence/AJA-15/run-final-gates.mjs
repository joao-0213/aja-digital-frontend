import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const commands = [
  ['npm.cmd test', 'Full test suite'],
  ['npm.cmd run typecheck', 'Typecheck'],
  ['npm.cmd run check:architecture', 'Architecture'],
  ['npm.cmd run build', 'Default Turbopack static build']
];
const entries = [];
for (const [command, label] of commands) {
  const result = spawnSync(command, { shell: true, encoding: 'utf8', maxBuffer: 24 * 1024 * 1024, windowsHide: true });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  entries.push(`COMMAND: ${command}\nLABEL: ${label}\nEXIT: ${result.status ?? 'spawn error'}\n${output.trimEnd()}`);
  if (result.error || result.status !== 0) break;
}
writeFileSync(new URL('./final-gates.log', import.meta.url), `${entries.join('\n\n')}\n`, 'utf8');
for (const entry of entries) {
  const command = entry.split('\n').slice(0, 3).join(' | ');
  const summary = entry.split('\n').filter(line => ['ℹ tests ', 'ℹ pass ', 'ℹ fail ', 'Arquitetura validada', 'Compiled successfully', 'Generating static pages', '/frequencia', '/alunos/perfil', 'Static)'].some(match => line.includes(match))).join('\n');
  console.log(`${command}${summary ? `\n${summary}` : ''}`);
}
if (entries.length !== commands.length) process.exitCode = 1;

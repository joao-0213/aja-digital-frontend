import { resetRepository } from './repository.mjs';
// CLI accepts no path and no runtime environment override.
if (process.argv.length !== 2) {
  process.stderr.write('Reset não aceita caminhos ou argumentos.\n');
  process.exitCode = 1;
} else {
  try { resetRepository(); process.stdout.write('Base local reinicializada.\n'); }
  catch (error) { process.stderr.write(`Reset recusado: ${error.message}\n`); process.exitCode = 1; }
}

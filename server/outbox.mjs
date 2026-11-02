import { openRepository } from './repository.mjs';

// Explicit operator-only CLI. Never mount this data or these links on the HTTP app.
if (process.argv.length !== 2) {
  process.stderr.write('Uso: node server/outbox.mjs (sem argumentos).\n');
  process.exitCode = 1;
} else {
  try {
    const { db } = openRepository();
    const messages = db.get('outbox').value() ?? [];
    if (!messages.length) process.stdout.write('Caixa de saída local vazia.\n');
    for (const message of messages) process.stdout.write(`${message.createdAt} | ${message.purpose} | ${message.email}\n${message.url}\n`);
  } catch {
    process.stderr.write('Não foi possível consultar a caixa de saída local.\n');
    process.exitCode = 1;
  }
}

import { readConfig } from './config.mjs';
import { createApp } from './app.mjs';
import { openRepository } from './repository.mjs';

try {
  const config = readConfig();
  openRepository(config.testRuntime);
  const server = createApp(config).listen(config.port, '127.0.0.1', () => {
    process.stdout.write(`API pronta: http://127.0.0.1:${server.address().port}\n`);
  });
  server.on('error', error => { process.stderr.write(`Não foi possível iniciar a API: ${error.code ?? 'falha'}\n`); process.exitCode = 1; });
  const stop = () => { server.close(() => process.exit(0)); server.closeAllConnections(); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
} catch (error) {
  process.stderr.write(`Não foi possível iniciar a API: ${error.message}\n`);
  process.exitCode = 1;
}

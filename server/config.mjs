export function readConfig(env = process.env) {
  const portText = env.API_PORT ?? '3002';
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < (env.NODE_ENV === 'test' ? 0 : 1) || port > 65535) throw new Error('API_PORT deve ser uma porta válida.');
  const origins = (env.API_ALLOWED_ORIGINS ?? 'http://127.0.0.1:3000,http://127.0.0.1:3001').split(',').map(value => value.trim());
  for (const origin of origins) {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin || parsed.username || parsed.password) throw new Error('API_ALLOWED_ORIGINS exige origens HTTP explícitas.');
  }
  if (env.AJA_TEST_RUNTIME && env.NODE_ENV !== 'test') throw new Error('Runtime isolado disponível somente em testes.');
  return { port, origins, testRuntime: env.NODE_ENV === 'test' ? env.AJA_TEST_RUNTIME : undefined };
}

import jsonServer from 'json-server';
import { randomUUID } from 'node:crypto';

export function createApp({ origins }) {
  const app = jsonServer.create();
  app.disable('x-powered-by');
  app.use((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const error = (status, code, message) => res.status(status).json({ error: { code, message, requestId: randomUUID() } });
    const origin = req.headers.origin;
    res.setHeader('Vary', 'Origin');
    if (origin && !origins.includes(origin)) return error(403, 'FORBIDDEN', 'Origem não permitida.');
    // Deliberately no defaults(), static(), router mounting, JSONP or rewrite middleware.
    if (req.url.split('?')[0] !== '/api/v1/health') return error(404, 'NOT_FOUND', 'Recurso não encontrado.');
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    if (req.method === 'OPTIONS' && origin && req.headers['access-control-request-method'] === 'GET' && !req.headers['access-control-request-headers']) {
      res.setHeader('Access-Control-Allow-Methods', 'GET');
      return res.status(204).end();
    }
    if (req.method !== 'GET') return error(404, 'NOT_FOUND', 'Recurso não encontrado.');
    if (new URL(req.url, 'http://localhost').searchParams.size) return error(422, 'VALIDATION_ERROR', 'Esta operação não aceita parâmetros de consulta.');
    return res.json({ status: 'ok', version: '1' });
  });
  return app;
}

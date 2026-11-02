import jsonServer from 'json-server';
import { randomUUID } from 'node:crypto';
import { createAuthService } from './auth-service.mjs';

export function createApp(config) {
  const { origins, store } = config;
  const auth = store && createAuthService(config);
  const routes = new Map([
    ['/api/v1/health', { GET: 'health' }],
    ...['register', 'login', 'logout', 'email-confirmation-requests', 'email-confirmations', 'password-reset-requests', 'password-resets'].map(route => [`/api/v1/auth/${route}`, { POST: route }]),
    ['/api/v1/auth/session', { GET: 'session' }],
    ['/api/v1/me', { GET: 'me', PATCH: 'profile' }],
    ['/api/v1/me/enrollments', { GET: 'enrollments' }]
  ]);
  const app = jsonServer.create();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const error = (status, code, message) => res.status(status).json({ error: { code, message, requestId: randomUUID() } });
    const origin = req.headers.origin;
    res.setHeader('Vary', 'Origin');
    if (origin && !origins.includes(origin)) return error(403, 'FORBIDDEN', 'Origem não permitida.');
    // Deliberately no defaults(), static(), router mounting, JSONP or rewrite middleware.
    const methods = routes.get(req.url.split('?')[0]);
    if (!methods) return error(404, 'NOT_FOUND', 'Recurso não encontrado.');
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    const requestedHeaders = (req.headers['access-control-request-headers'] ?? '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
    if (req.method === 'OPTIONS' && origin && methods[req.headers['access-control-request-method']] && requestedHeaders.every(header => header === 'content-type')) {
      res.setHeader('Access-Control-Allow-Methods', Object.keys(methods).join(', '));
      if (requestedHeaders.length) res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      return res.status(204).end();
    }
    const route = methods[req.method];
    if (!route) return error(404, 'NOT_FOUND', 'Recurso não encontrado.');
    if (route !== 'enrollments' && new URL(req.url, 'http://localhost').searchParams.size) return error(422, 'VALIDATION_ERROR', 'Esta operação não aceita parâmetros de consulta.');
    if (route === 'health') return res.json({ status: 'ok', version: '1' });
    if (!auth) return error(503, 'API_UNAVAILABLE', 'Serviço indisponível.');
    if (!['GET', 'HEAD'].includes(req.method) && (!origin || !origins.includes(origin))) return error(403, 'FORBIDDEN', 'Origem não permitida.');
    if (!['GET', 'HEAD'].includes(req.method) && route !== 'logout' && !req.is('application/json')) return error(422, 'VALIDATION_ERROR', 'Envie os campos em JSON.');
    req.authRoute = route;
    next();
  });
  app.use(jsonServer.bodyParser);
  app.use(async (req, res) => {
    try {
      const result = await auth.execute(req, req.authRoute);
      if (result.cookie) res.setHeader('Set-Cookie', result.cookie);
      if (result.status === 204) res.status(204).end(); else res.status(result.status).json(result.body);
    } catch (error) {
      const status = error.status ?? 500;
      const body = { code: error.code ?? 'INTERNAL_ERROR', message: error.status ? error.message : 'Não foi possível concluir a operação.', requestId: randomUUID() };
      if (error.details && ![401, 403].includes(status)) body.details = error.details;
      res.status(status).json({ error: body });
    }
  });
  app.use((error, _req, res, _next) => res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Não foi possível ler os campos informados.', requestId: randomUUID() } }));
  return app;
}

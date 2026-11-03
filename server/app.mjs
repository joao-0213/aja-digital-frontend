import jsonServer from 'json-server';
import { randomUUID } from 'node:crypto';
import { createAuthService } from './auth-service.mjs';
import { createAdministrationService } from './administration-service.mjs';
import { createSubjectService } from './subject-service.mjs';
import { createFileService } from './file-service.mjs';
import { createMaterialService } from './material-service.mjs';
import { createQuestionService } from './question-service.mjs';
import { createAssessmentService } from './assessment-service.mjs';
import { createWorkService } from './work-service.mjs';
import { createAnnouncementService } from './announcement-service.mjs';
import { createForumService } from './forum-service.mjs';
import { createAttendanceService } from './attendance-service.mjs';

export function createApp(config) {
  const { origins, store } = config;
  const auth = store && createAuthService(config);
  const administration = auth && createAdministrationService(config, auth);
  const subjects = auth && createSubjectService(config, auth);
  const files = auth && createFileService(config, auth);
  const materials = auth && createMaterialService(config, auth, files);
  const questions = auth && createQuestionService(config, auth);
  const assessments = auth && createAssessmentService(config, auth);
  const work = auth && createWorkService(config, auth, files);
  const announcements = auth && createAnnouncementService(config, auth);
  const forum = auth && createForumService(config, auth, files);
  const attendance = auth && createAttendanceService(config, auth);
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
    const path = req.url.split('?')[0];
    const administrative = path.startsWith('/api/v1/') && (administration?.resolve(path.slice('/api/v1'.length)) ?? subjects?.resolve(path.slice('/api/v1'.length)) ?? files?.resolve(path.slice('/api/v1'.length)) ?? materials?.resolve(path.slice('/api/v1'.length)) ?? questions?.resolve(path.slice('/api/v1'.length)) ?? assessments?.resolve(path.slice('/api/v1'.length)) ?? work?.resolve(path.slice('/api/v1'.length)) ?? announcements?.resolve(path.slice('/api/v1'.length)) ?? forum?.resolve(path.slice('/api/v1'.length)) ?? attendance?.resolve(path.slice('/api/v1'.length)));
    const methods = routes.get(path) ?? administrative?.methods;
    if (!methods) return error(404, 'NOT_FOUND', 'Recurso não encontrado.');
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    const requestedHeaders = (req.headers['access-control-request-headers'] ?? '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
    if (req.method === 'OPTIONS' && origin && methods[req.headers['access-control-request-method']] && requestedHeaders.every(header => header === 'content-type' || administrative && header === 'idempotency-key')) {
      res.setHeader('Access-Control-Allow-Methods', Object.keys(methods).join(', '));
      if (requestedHeaders.length) res.setHeader('Access-Control-Allow-Headers', administrative ? 'Content-Type, Idempotency-Key' : 'Content-Type');
      return res.status(204).end();
    }
    const route = methods[req.method];
    if (!route) return error(404, 'NOT_FOUND', 'Recurso não encontrado.');
    if (administrative && req.method !== 'GET' && !administrative.acceptsQuery && new URL(req.url, 'http://localhost').searchParams.size) return error(422, 'VALIDATION_ERROR', 'Esta operação não aceita parâmetros de consulta.');
    if (!administrative && route !== 'enrollments' && new URL(req.url, 'http://localhost').searchParams.size) return error(422, 'VALIDATION_ERROR', 'Esta operação não aceita parâmetros de consulta.');
    if (route === 'health') return res.json({ status: 'ok', version: '1' });
    if (!auth) return error(503, 'API_UNAVAILABLE', 'Serviço indisponível.');
    if (!['GET', 'HEAD'].includes(req.method) && (!origin || !origins.includes(origin))) return error(403, 'FORBIDDEN', 'Origem não permitida.');
    if (!['GET', 'HEAD'].includes(req.method) && route !== 'logout' && !(administrative?.multipartUpload ? req.is('multipart/form-data') : req.is('application/json'))) return error(422, 'VALIDATION_ERROR', administrative?.multipartUpload ? 'Envie os campos como multipart/form-data.' : 'Envie os campos em JSON.');
    req.authRoute = route;
    if (administrative) { req.administrationHandler = route; req.administrationParams = administrative.params; }
    next();
  });
  app.use(jsonServer.bodyParser);
  app.use(async (req, res) => {
    try {
      if (req.administrationHandler) { req.params = req.administrationParams; return await req.administrationHandler(req, res); }
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

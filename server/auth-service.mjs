import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { executeEnrollmentCommand, normalizeEmail, validEmail } from '../src/lib/enrollment.ts';
import { HttpError } from './command-service.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const available = user => user && user.active !== false && !user.deletedAt;
const invalid = message => { throw new HttpError(422, 'VALIDATION_ERROR', message); };
const accepted = { message: 'Solicitação recebida. Consulte as instruções disponíveis para continuar.' };

function fields(body, allowed, required = allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key)) || required.some(key => !(key in body))) invalid('Confira os campos informados.');
}
function email(value) { if (typeof value !== 'string' || value.length > 254 || !validEmail(value)) invalid('Informe um e-mail válido.'); return normalizeEmail(value); }
function password(value) { if (typeof value !== 'string' || value.length < 8 || value.length > 128) invalid('A senha deve ter de 8 a 128 caracteres.'); return value; }
function name(value) { if (typeof value !== 'string' || value.trim().length < 3 || value.trim().length > 100) invalid('O nome deve ter de 3 a 100 caracteres.'); return value.trim(); }
function verifier(value, userId) {
  const salt = randomBytes(32).toString('hex');
  return { id: `credential-${userId}`, userId, algorithm: 'scrypt', salt, hash: scryptSync(value, salt, 64).toString('hex') };
}

export function selfUser(user) {
  return { id: user.id, revision: user.revision, createdAt: user.createdAt ?? user.updatedAt, updatedAt: user.updatedAt, updatedBy: user.updatedBy, name: user.name, email: user.email, role: user.role, active: user.active !== false, emailConfirmedAt: user.emailConfirmedAt ?? null };
}

export function createAuthService({ store, now = () => new Date().toISOString(), frontendOrigin = 'http://127.0.0.1:3000', secureCookie = false, sessionDurationMs = 28800000, tokenDurationMs = 1800000 }) {
  const sessionCookie = (value, expiresAt, clearing = false) => `aja_session=${value}; Path=/api/v1; HttpOnly; SameSite=Lax; Max-Age=${clearing ? 0 : Math.floor(sessionDurationMs / 1000)}; Expires=${new Date(expiresAt).toUTCString()}${secureCookie ? '; Secure' : ''}`;
  function sessionFor(req, state, timestamp) {
    const cookies = (req.headers.cookie ?? '').split(';').map(value => value.trim()).filter(value => value.startsWith('aja_session='));
    const value = cookies.length === 1 ? cookies[0].slice('aja_session='.length) : '';
    const session = /^[a-f0-9]{64}$/.test(value) && state.sessions.find(item => item.hash === digest(value) && !item.revokedAt && Date.parse(item.expiresAt) > Date.parse(timestamp));
    const user = session && state.users.find(item => item.id === session.userId);
    if (!available(user)) throw new HttpError(401, 'SESSION_REQUIRED', 'Entre novamente para continuar.');
    return { session, user };
  }
  function issue(state, user, purpose, timestamp) {
    for (const old of state.tokens.filter(t => t.userId === user.id && t.purpose === purpose && !t.usedAt)) old.revokedAt = timestamp;
    const value = randomBytes(32).toString('hex');
    state.tokens.push({ id: randomUUID(), userId: user.id, email: user.email, purpose, hash: digest(value), createdAt: timestamp, expiresAt: new Date(Date.parse(timestamp) + tokenDurationMs).toISOString() });
    const route = purpose === 'email-confirmation' ? '/cadastro' : '/recuperar-senha';
    state.outbox.push({ id: randomUUID(), userId: user.id, purpose, email: user.email, url: `${frontendOrigin}${route}?token=${value}`, createdAt: timestamp });
  }
  function consume(state, value, purpose, timestamp) {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new HttpError(422, 'TOKEN_INVALID', 'Token inválido ou já utilizado.');
    const token = state.tokens.find(t => t.hash === digest(value) && t.purpose === purpose && !t.usedAt && !t.revokedAt);
    if (!token) throw new HttpError(422, 'TOKEN_INVALID', 'Token inválido ou já utilizado.');
    if (Date.parse(token.expiresAt) <= Date.parse(timestamp)) throw new HttpError(422, 'TOKEN_EXPIRED', 'O token expirou. Solicite novas instruções.');
    const user = state.users.find(u => u.id === token.userId);
    if (!available(user) || user.email !== token.email) throw new HttpError(422, 'TOKEN_INVALID', 'Token inválido ou já utilizado.');
    token.usedAt = timestamp;
    return user;
  }
  // Public and authenticated operations share the same atomic store, without inventing a public actor.
  async function execute(req, route) {
    return store.transact(state => {
      const timestamp = now();
      const before = structuredClone(state);
      let actorId = 'system';
      let result, cookie, status = 200;
      const body = req.body;
      if (route === 'register') {
        fields(body, ['name', 'email', 'password']);
        const normalized = email(body.email), displayName = name(body.name), secret = password(body.password);
        if (state.users.some(u => u.email.toLowerCase() === normalized)) throw new HttpError(409, 'REVISION_CONFLICT', 'Este e-mail já está cadastrado.');
        const id = `user-${randomUUID()}`;
        const user = { id, name: displayName, email: normalized, role: 'student', active: true, emailConfirmedAt: null, createdAt: timestamp };
        state.users.push(user); state.credentials.push(verifier(secret, id)); actorId = id;
        issue(state, user, 'email-confirmation', timestamp);
        result = () => selfUser(user); status = 201;
      } else if (route === 'login') {
        fields(body, ['email', 'password']); const normalized = email(body.email);
        if (typeof body.password !== 'string' || body.password.length > 128) invalid('Confira a senha informada.');
        const user = state.users.find(u => u.email.toLowerCase() === normalized);
        const credential = user && state.credentials.find(c => c.userId === user.id);
        const attempt = scryptSync(body.password, credential?.salt ?? 'aja-unknown-account', 64);
        const expected = credential && Buffer.from(credential.hash, 'hex');
        // Both a successful change of identity and an incorrect login end the previous session.
        try { const old = sessionFor(req, state, timestamp); old.session.revokedAt = timestamp; actorId = old.user.id; } catch { /* No previous valid session. */ }
        if (!available(user) || !expected || expected.length !== attempt.length || !timingSafeEqual(expected, attempt)) {
          status = 401; cookie = sessionCookie('', '1970-01-01T00:00:00Z', true);
          result = () => ({ error: { code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha incorretos.', requestId: randomUUID() } });
        } else {
          const value = randomBytes(32).toString('hex');
          const expiresAt = new Date(Date.parse(timestamp) + sessionDurationMs).toISOString();
          const sessionId = randomUUID();
          state.sessions.push({ id: sessionId, userId: user.id, hash: digest(value), createdAt: timestamp, expiresAt });
          actorId = user.id; cookie = sessionCookie(value, expiresAt); result = () => ({ sessionId, user: selfUser(user), expiresAt });
        }
      } else if (route === 'email-confirmation-requests' || route === 'password-reset-requests') {
        fields(body, ['email']); const normalized = email(body.email);
        const user = state.users.find(u => u.email.toLowerCase() === normalized);
        if (available(user) && (route === 'password-reset-requests' || user.emailConfirmedAt === null)) {
          actorId = user.id; issue(state, user, route === 'password-reset-requests' ? 'password-reset' : 'email-confirmation', timestamp);
        }
        status = 202; result = () => accepted;
      } else if (route === 'email-confirmations') {
        fields(body, ['token']); const user = consume(state, body.token, 'email-confirmation', timestamp); actorId = user.id;
        try { executeEnrollmentCommand(state, user, { type: 'confirm' }, timestamp); }
        catch (cause) { throw new HttpError(409, 'REVISION_CONFLICT', cause.message); }
        result = () => selfUser(user);
      } else if (route === 'password-resets') {
        fields(body, ['token', 'password']); const secret = password(body.password);
        const user = consume(state, body.token, 'password-reset', timestamp); actorId = user.id;
        const index = state.credentials.findIndex(c => c.userId === user.id);
        const next = verifier(secret, user.id);
        if (index < 0) state.credentials.push(next); else state.credentials[index] = next;
        for (const s of state.sessions.filter(s => s.userId === user.id)) s.revokedAt = timestamp;
        for (const token of state.tokens.filter(t => t.userId === user.id && t.purpose === 'password-reset' && !t.usedAt)) token.revokedAt = timestamp;
        result = () => ({ message: 'Senha redefinida. Entre com a nova senha.' });
      } else {
        const { user, session } = sessionFor(req, state, timestamp); actorId = user.id;
        if (route === 'logout') { session.revokedAt = timestamp; cookie = sessionCookie('', '1970-01-01T00:00:00Z', true); status = 204; }
        else if (route === 'session') result = () => ({ sessionId: session.id, user: selfUser(user), expiresAt: session.expiresAt });
        else if (route === 'profile') {
          fields(body, ['expectedRevision', 'name'], ['expectedRevision']);
          if (!Number.isInteger(body.expectedRevision) || body.expectedRevision < 1) invalid('Informe a revisão do perfil.');
          if (body.expectedRevision !== user.revision) throw new HttpError(409, 'REVISION_CONFLICT', 'O perfil foi alterado. Confira a versão atual.', { currentRevision: user.revision });
          if ('name' in body) user.name = name(body.name);
          result = () => selfUser(user);
        } else if (route === 'me') result = () => selfUser(user);
        else if (route === 'enrollments') {
          const params = new URL(req.url, 'http://localhost').searchParams;
          if ([...params.keys()].some(key => !['page', 'pageSize', 'sort'].includes(key)) || [...params.keys()].some(key => params.getAll(key).length > 1)) invalid('Confira os filtros informados.');
          const page = Number(params.get('page') ?? 1), pageSize = Number(params.get('pageSize') ?? 20), sort = params.get('sort') ?? 'id';
          if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || !['id', '-id'].includes(sort)) invalid('Confira a paginação informada.');
          const records = state.enrollments.filter(e => e.studentId === user.id || e.status === 'pending' && e.email === user.email).sort((a, b) => a.id.localeCompare(b.id) * (sort === '-id' ? -1 : 1));
          result = () => ({ items: records.slice((page - 1) * pageSize, page * pageSize).map(e => ({ id: e.id, revision: e.revision, createdAt: e.createdAt, updatedAt: e.updatedAt, updatedBy: e.updatedBy, classId: e.classId, className: state.classes.find(c => c.id === e.classId)?.name ?? null, email: e.email, studentId: e.studentId ?? null, status: e.status, createdBy: e.createdBy, enrolledAt: e.enrolledAt ?? null, endedAt: e.endedAt ?? null, legacy: e.legacy ?? false, unassignedAssessmentIds: e.unassignedAssessmentIds })), page, pageSize, total: records.length });
        } else throw new HttpError(404, 'NOT_FOUND', 'Recurso não encontrado.');
      }
      for (const [collection, rows] of Object.entries(state)) {
        if (!Array.isArray(rows) || collection === 'audit' || collection === 'idempotency') continue;
        for (const record of rows) {
          const old = before[collection]?.find(r => r.id === record.id);
          if (JSON.stringify(old) !== JSON.stringify(record)) {
            record.revision = (old?.revision ?? 0) + 1; record.updatedAt = timestamp; record.updatedBy = actorId;
            state.audit.push({ id: randomUUID(), actorId, action: old ? 'update' : 'create', collection, targetId: record.id, createdAt: timestamp });
          }
        }
      }
      return { status, body: result?.(), cookie };
    });
  }
  return { execute, resolveActor: (req, state) => sessionFor(req, state, now()).user.id };
}

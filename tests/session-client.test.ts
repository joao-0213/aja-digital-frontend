import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHttpClient, HttpError } from '../src/lib/http-client.ts';
import { createSessionClient } from '../src/providers/session-client.ts';

const user = { id: 'u1', name: 'Nome aluno', email: 'aluno@example.test', role: 'student' as const, active: true, emailConfirmedAt: null, revision: 1 };
const session = { user, expiresAt: '2030-01-01T00:00:00Z', sessionId: 'public-session-1' };

test('session starts without local persona and never restores identity after failed HTTP', async () => {
  const client = createSessionClient({ request: async () => { throw new HttpError('unavailable', 'Indisponível.'); } });
  assert.equal(client.getSnapshot().user, null);
  assert.equal(client.getSnapshot().status, 'loading');
  await client.refresh();
  assert.equal(client.getSnapshot().status, 'error');
  assert.equal(client.getSnapshot().user, null);
});

test('verified session exposes a stable opaque session identifier for tab-scoped answer recovery', async () => {
  const client = createSessionClient({ request: async <T>(): Promise<T> => session as T });
  await client.login(user.email, 'password');
  assert.equal(client.getSnapshot().sessionId, session.sessionId);
  const reloaded = createSessionClient({ request: async <T>(): Promise<T> => session as T });
  await reloaded.refresh();
  assert.equal(reloaded.getSnapshot().sessionId, client.getSnapshot().sessionId);
  await reloaded.logout();
  assert.equal(reloaded.getSnapshot().sessionId, null);
});

test('composition idempotency metadata survives remount in one session and is cleared for another session', async () => {
  let reply = session;
  const client = createSessionClient({ request: async <T>(): Promise<T> => reply as T });
  await client.login(user.email, 'password');
  const context = 'announcement:u1:s1', firstSessionKey = client.getSnapshot().sessionKey;
  client.saveDraft(context, { fields: { title: 'Comunicado' }, expectedRevision: 0 }, firstSessionKey);
  client.saveDraftExtra(context, { fingerprint: '{"title":"Comunicado"}', key: 'session-one-key' }, firstSessionKey);
  assert.equal(client.readDraftExtra<{ key: string }>(context)?.key, 'session-one-key');
  await client.refresh();
  assert.equal(client.getSnapshot().sessionKey, firstSessionKey);
  assert.equal(client.readDraftExtra<{ key: string }>(context)?.key, 'session-one-key');
  assert.equal(client.readDraftExtra(context.replace('u1', 'u2')), undefined);
  reply = { ...session, sessionId: 'public-session-2' };
  await client.refresh();
  assert.equal(client.readDraft(context), undefined);
  assert.equal(client.readDraftExtra(context), undefined);
});

test('session 401 becomes anonymous while login failure preserves actual error without a fallback user', async () => {
  const client = createSessionClient({ request: async () => { throw new HttpError('session', 'Senha incorreta.', { status: 401 }); } });
  await client.refresh();
  assert.equal(client.getSnapshot().status, 'anonymous');
  await assert.rejects(client.login('aluno@example.test', 'wrong'), /Senha incorreta/);
  assert.equal(client.getSnapshot().user, null);
});

test('logout clears identity immediately and blocks stale session responses that ignore abort', async () => {
  let resolve!: (value: unknown) => void;
  let refresh = false;
  const request = async <T>(path: string): Promise<T> => {
    if (path === '/auth/login') return session as T;
    if (path === '/auth/session' && refresh) return await new Promise<unknown>(done => { resolve = done; }) as T;
    return undefined as T;
  };
  const client = createSessionClient({ request });
  await client.login(user.email, 'password');
  const authenticatedKey = client.getSnapshot().sessionKey;
  refresh = true;
  const pending = client.refresh();
  const exit = client.logout();
  assert.equal(client.getSnapshot().user, null);
  assert.notEqual(client.getSnapshot().sessionKey, authenticatedKey);
  resolve(session);
  await pending;
  await exit;
  assert.equal(client.getSnapshot().user, null);
  assert.equal(client.getSnapshot().status, 'anonymous');
});

test('successful profile update uses revision and failed update retains current identity', async () => {
  const bodies: unknown[] = [];
  const client = createSessionClient({ request: async <T>(path: string, options?: { json?: unknown }): Promise<T> => {
    if (path === '/auth/login') return session as T;
    bodies.push(options?.json);
    if (bodies.length > 1) throw new HttpError('conflict', 'Confira a versão atual.', { status: 409 });
    return { ...user, name: 'Novo nome', revision: 2 } as T;
  } });
  await client.login(user.email, 'password');
  await client.updateProfile('Novo nome', 1);
  assert.deepEqual(bodies[0], { name: 'Novo nome', expectedRevision: 1 });
  assert.equal(client.getSnapshot().user?.name, 'Novo nome');
  await assert.rejects(client.updateProfile('Nome em conflito', 1), /Confira/);
  assert.equal(client.getSnapshot().user?.name, 'Novo nome');
});

test('refresh of the same account keeps query identity and form mounted; revoked reads clear it', async () => {
  const client = createSessionClient({ request: async <T>(path: string): Promise<T> => {
    if (path === '/me/enrollments') throw new HttpError('session', 'Sessão expirada.', { status: 401 });
    return session as T;
  } });
  await client.login(user.email, 'password');
  const key = client.getSnapshot().sessionKey;
  const refresh = client.refresh();
  assert.equal(client.getSnapshot().status, 'authenticated');
  await refresh;
  assert.equal(client.getSnapshot().sessionKey, key);
  await assert.rejects(client.readEnrollments(), /Sessão expirada/);
  assert.equal(client.getSnapshot().user, null);
  assert.equal(client.getSnapshot().status, 'anonymous');
});

test('new session for same account and expiry or changed role invalidates private query identity', async () => {
  let reply = session;
  const client = createSessionClient({ request: async <T>(): Promise<T> => reply as T });
  await client.login(user.email, 'password');
  const first = client.getSnapshot().sessionKey;
  reply = { ...session, sessionId: 'public-session-2' };
  await client.refresh();
  const second = client.getSnapshot().sessionKey;
  assert.notEqual(second, first, 'same account/expiry must not reuse prior session cache');
  reply = { ...reply, user: { ...user, role: 'teacher' as typeof user.role } };
  await client.refresh();
  assert.notEqual(client.getSnapshot().sessionKey, second, 'role change must invalidate prior permission projection');
});

test('profile response revealing a changed role invalidates old permission projections', async () => {
  const client = createSessionClient({ request: async <T>(path: string): Promise<T> => (path === '/me' ? { ...user, role: 'teacher' } : session) as T });
  await client.login(user.email, 'password');
  const before = client.getSnapshot().sessionKey;
  await client.updateProfile('Nome aluno', 1);
  assert.equal(client.getSnapshot().user?.role, 'teacher');
  assert.notEqual(client.getSnapshot().sessionKey, before);
});

test('profile draft survives unavailable refresh only after same session is confirmed and never crosses logout or account', async () => {
  let offline = false;
  let reply = session;
  const client = createSessionClient({ request: async <T>(): Promise<T> => {
    if (offline) throw new HttpError('unavailable', 'Serviço indisponível.');
    return reply as T;
  } });
  await client.login(user.email, 'password');
  client.saveProfileDraft({ name: 'Texto ainda não salvo', revision: 1 });
  offline = true;
  await client.refresh();
  assert.equal(client.getSnapshot().user, null);
  assert.equal(client.readProfileDraft(), undefined, 'unverified identity must not expose composition');
  offline = false;
  reply = { ...session, user: { ...user, name: 'Nome alterado por outra sessão', revision: 2 } };
  await client.refresh();
  assert.deepEqual(client.readProfileDraft(), { name: 'Texto ainda não salvo', revision: 1 });
  reply = { ...session, sessionId: 'other-session' };
  await client.refresh();
  assert.equal(client.readProfileDraft(), undefined);
  client.saveProfileDraft({ name: 'Another draft', revision: 1 });
  await client.logout();
  await client.login(user.email, 'password');
  assert.equal(client.readProfileDraft(), undefined);
});

test('denied session refresh discards unpublished profile text even if a later response reuses its session identifier', async () => {
  let revoked = false;
  const client = createSessionClient({ request: async <T>(): Promise<T> => {
    if (revoked) throw new HttpError('session', 'Sessão encerrada.', { status: 401 });
    return session as T;
  } });
  await client.login(user.email, 'password');
  client.saveProfileDraft({ name: 'Texto privado', revision: 1 });
  revoked = true;
  await client.refresh();
  assert.equal(client.readProfileDraft(), undefined);
  revoked = false;
  await client.refresh();
  assert.equal(client.readProfileDraft(), undefined);
});

test('registration and one-use token commands send only writable fields and do not create local sessions', async () => {
  const commands: { path: string; json: unknown }[] = [];
  const client = createSessionClient({ request: async <T>(path: string, options?: { json?: unknown }): Promise<T> => {
    commands.push({ path, json: options?.json });
    return (path === '/auth/register' || path === '/auth/email-confirmations' ? user : { message: 'Solicitação recebida.' }) as T;
  } });
  let notifications = 0;
  const unsubscribe = client.subscribe(() => notifications++);
  await client.register(user.name, user.email, 'own-password');
  await client.requestConfirmation(user.email);
  await client.confirmEmail('confirmation-token');
  await client.requestRecovery(user.email);
  await client.resetPassword('reset-token', 'new-password');
  assert.deepEqual(commands, [
    { path: '/auth/register', json: { name: user.name, email: user.email, password: 'own-password' } },
    { path: '/auth/email-confirmation-requests', json: { email: user.email } },
    { path: '/auth/email-confirmations', json: { token: 'confirmation-token' } },
    { path: '/auth/password-reset-requests', json: { email: user.email } },
    { path: '/auth/password-resets', json: { token: 'reset-token', password: 'new-password' } }
  ]);
  assert.equal(client.getSnapshot().user, null);
  assert.equal(notifications, 0);
  unsubscribe();
  client.dispose();
});

test('real HTTP login, reload and logout use session endpoint and never browser storage', async () => {
  const paths: string[] = [];
  let logged = false;
  const server = createServer(async (req, res) => {
    paths.push(req.url!);
    let body = '';
    for await (const chunk of req) body += chunk;
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/v1/auth/login') { assert.deepEqual(JSON.parse(body), { email: user.email, password: 'own-password' }); logged = true; res.end(JSON.stringify(session)); }
    else if (req.url === '/api/v1/auth/logout') { logged = false; res.writeHead(204).end(); }
    else if (logged) res.end(JSON.stringify(session));
    else res.writeHead(401).end(JSON.stringify({ error: { code: 'SESSION_REQUIRED', message: 'Entre na conta.' } }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    const http = createHttpClient({ baseUrl: `http://127.0.0.1:${address.port}/api/v1` });
    const first = createSessionClient(http);
    await first.login(user.email, 'own-password');
    const reloaded = createSessionClient(http);
    await reloaded.refresh();
    assert.equal(reloaded.getSnapshot().user?.id, user.id);
    await reloaded.logout();
    await first.refresh();
    assert.equal(first.getSnapshot().user, null);
    assert.deepEqual(paths, ['/api/v1/auth/login', '/api/v1/auth/session', '/api/v1/auth/logout', '/api/v1/auth/session']);
  } finally { await new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()); }); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server/app.mjs';
import { createTransactionStore } from '../server/transaction-store.mjs';
import { openRepository } from '../server/repository.mjs';

const origin = 'http://127.0.0.1:3000';
async function setup(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aja-auth-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { filename } = openRepository(directory, { baseDate: '2031-06-15' });
  const store = createTransactionStore({ filename, ...options });
  let time = '2031-06-15T12:00:00Z';
  const app = createApp({
    origins: [origin],
    frontendOrigin: origin,
    store,
    now: () => time,
    sessionDurationMs: 3600000,
    tokenDurationMs: 600000
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      })
  );
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  function client() {
    let cookie = '';
    return {
      get cookie() {
        return cookie;
      },
      async call(route, body, { method = body ? 'POST' : 'GET', requestOrigin = origin } = {}) {
        const response = await fetch(base + route, {
          method,
          headers: {
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...(cookie ? { Cookie: cookie } : {}),
            ...(requestOrigin ? { Origin: requestOrigin } : {})
          },
          ...(body ? { body: JSON.stringify(body) } : {})
        });
        const header = response.headers.get('set-cookie');
        if (header) cookie = header.split(';')[0];
        return response;
      },
      login(id = 'student') {
        return this.call('/auth/login', {
          email: `${id}@aja.local.test`,
          password: `AjaLocal-${id}-2031!`
        });
      }
    };
  }
  const token = async (purpose) => {
    const message = (await store.read()).outbox.filter((m) => m.purpose === purpose).at(-1);
    assert.ok(message, `outbox ${purpose}`);
    return new URL(message.url).searchParams.get('token');
  };
  return {
    client,
    store,
    token,
    setTime: (value) => {
      time = value;
    },
    base
  };
}

test('independent HTTP sessions login reload profile logout expiry and inactive-account revocation without credentials leakage', async (t) => {
  const { client, store, setTime } = await setup(t);
  const alex = client(),
    bia = client();
  assert.equal((await alex.call('/auth/session')).status, 401);
  assert.equal(
    (await alex.call('/auth/login', { email: 'student@aja.local.test', password: 'incorrect' }))
      .status,
    401
  );
  const login = await alex.login();
  assert.equal(login.status, 200);
  const header = login.headers.get('set-cookie');
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Lax/);
  assert.match(header, /Path=\/api\/v1/);
  const session = await login.json();
  assert.equal(session.user.id, 'student');
  assert.ok(session.expiresAt);
  assert.equal(typeof session.sessionId, 'string');
  assert.notEqual(session.sessionId, alex.cookie.split('=')[1]);
  assert.equal(JSON.stringify(session).includes('hash'), false);
  assert.equal(JSON.stringify(session).includes('password'), false);
  assert.equal((await (await alex.call('/auth/session')).json()).user.id, 'student');
  assert.equal((await bia.call('/me')).status, 401);
  assert.equal((await bia.login('student-two')).status, 200);
  const me = await (await alex.call('/me')).json();
  const saved = await alex.call(
    '/me',
    { expectedRevision: me.revision, name: 'Alex Atualizado' },
    { method: 'PATCH' }
  );
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).name, 'Alex Atualizado');
  assert.equal((await (await bia.call('/me')).json()).name, 'Bia Aprendiz');
  assert.equal(
    (await alex.call('/me', { expectedRevision: me.revision, name: 'Stale' }, { method: 'PATCH' }))
      .status,
    409
  );
  const links = await (await alex.call('/me/enrollments')).json();
  assert.ok(links.items.every((e) => e.studentId === 'student'));
  assert.equal(links.items.find((e) => e.classId === 'c1').className, 'Turma Horizonte');
  await store.transact((s) => {
    s.classes = s.classes.filter((c) => c.id !== 'c-closed');
  });
  const history = await (await alex.call('/me/enrollments')).json();
  assert.equal(history.items.find((e) => e.classId === 'c-closed').className, null);
  const cookie = alex.cookie;
  assert.equal((await alex.call('/auth/logout', undefined, { method: 'POST' })).status, 204);
  assert.equal((await alex.call('/auth/session')).status, 401);
  assert.ok(
    (await store.read()).sessions.every((s) => !JSON.stringify(s).includes(cookie.split('=')[1]))
  );
  await store.transact((s) => {
    s.users.find((u) => u.id === 'student-two').active = false;
  });
  assert.equal((await bia.call('/me')).status, 401);
  const teacher = client();
  await teacher.login('teacher-a');
  setTime('2031-06-15T13:00:01Z');
  assert.equal((await teacher.call('/auth/session')).status, 401);
});

test('register enforces student identity, uniqueness and strict fields; tokens confirm pending enrollment once', async (t) => {
  const { client, token, store } = await setup(t);
  const c = client();
  const body = { name: 'Pessoa Nova', email: 'nova@example.test', password: 'Senha-local-123!' };
  assert.equal((await c.call('/auth/register', { ...body, role: 'admin' })).status, 422);
  const response = await c.call('/auth/register', body);
  assert.equal(response.status, 201);
  const user = await response.json();
  assert.equal(user.role, 'student');
  assert.equal(user.emailConfirmedAt, null);
  assert.equal((await c.call('/auth/session')).status, 401);
  assert.equal((await c.call('/auth/register', body)).status, 409);
  assert.equal(
    (await c.call('/auth/email-confirmation-requests', { email: 'student-pending@aja.local.test' }))
      .status,
    202
  );
  const value = await token('email-confirmation');
  assert.equal((await c.call('/auth/email-confirmations', { token: 'invalid' })).status, 422);
  const confirmed = await c.call('/auth/email-confirmations', { token: value });
  assert.equal(confirmed.status, 200);
  assert.ok((await confirmed.json()).emailConfirmedAt);
  assert.equal((await c.call('/auth/email-confirmations', { token: value })).status, 422);
  const data = await store.read();
  assert.equal(data.enrollments.find((e) => e.id === 'e-pending').status, 'active');
  assert.ok(data.classes.find((x) => x.id === 'c1').studentIds.includes('student-pending'));
  assert.ok(data.tokens.every((x) => !JSON.stringify(x).includes(value)));
});

test('password recovery is neutral and one-use, expires, revokes sessions and accepts only the new password', async (t) => {
  const { client, token, setTime } = await setup(t);
  const a = client(),
    b = client();
  await a.login();
  await b.login();
  const known = await b.call('/auth/password-reset-requests', { email: 'student@aja.local.test' });
  const unknown = await b.call('/auth/password-reset-requests', { email: 'absent@example.test' });
  assert.equal(known.status, 202);
  assert.deepEqual(await known.json(), await unknown.json());
  const expired = await token('password-reset');
  setTime('2031-06-15T12:11:00Z');
  assert.equal(
    (await b.call('/auth/password-resets', { token: expired, password: 'New-local-123!' })).status,
    422
  );
  await b.call('/auth/password-reset-requests', { email: 'student@aja.local.test' });
  const valid = await token('password-reset');
  assert.equal(
    (await b.call('/auth/password-resets', { token: valid, password: 'New-local-123!' })).status,
    200
  );
  assert.equal(
    (await b.call('/auth/password-resets', { token: valid, password: 'Again-local-123!' })).status,
    422
  );
  assert.equal((await a.call('/me')).status, 401);
  assert.equal((await b.call('/me')).status, 401);
  assert.equal((await a.login()).status, 401);
  assert.equal(
    (await a.call('/auth/login', { email: 'student@aja.local.test', password: 'New-local-123!' }))
      .status,
    200
  );
});

test('auth origin restrictions, preflight and hidden collections preserve explicit allowlist', async (t) => {
  const { client, base } = await setup(t);
  const c = client();
  for (const requestOrigin of [null, 'https://untrusted.example'])
    assert.equal(
      (
        await c.call(
          '/auth/login',
          { email: 'student@aja.local.test', password: 'AjaLocal-student-2031!' },
          { requestOrigin }
        )
      ).status,
      403
    );
  const preflight = await fetch(base + '/auth/login', {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type'
    }
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
  for (const route of ['/db', '/sessions', '/tokens', '/outbox', '/auth/login/', '/auth/%6cogin'])
    assert.equal((await c.call(route)).status, 404);
  assert.equal(
    (
      await c.call('/auth/login', {
        email: 'student@aja.local.test',
        password: 'AjaLocal-student-2031!',
        role: 'admin'
      })
    ).status,
    422
  );
});

test('auth persistence failure preserves users credentials tokens outbox sessions and audit atomically', async (t) => {
  const { client, store } = await setup(t, {
    persist: () => {
      throw new Error('disk full');
    }
  });
  const before = await store.read();
  const result = await client().call('/auth/register', {
    name: 'Failed Account',
    email: 'failed@example.test',
    password: 'Senha-local-123!'
  });
  assert.equal(result.status, 500);
  assert.deepEqual(await store.read(), before);
});

test('a failed login attempt clears an existing session instead of restoring the previous identity on reload', async (t) => {
  const { client } = await setup(t);
  const c = client();
  await c.login();
  assert.equal(
    (await c.call('/auth/login', { email: 'student-two@aja.local.test', password: 'wrong' }))
      .status,
    401
  );
  assert.equal((await c.call('/auth/session')).status, 401);
});

test('reissued tokens invalidate old links and concurrent token consumption commits exactly once', async (t) => {
  const { client, token, store } = await setup(t);
  const a = client(),
    b = client();
  await a.call('/auth/email-confirmation-requests', { email: 'student-pending@aja.local.test' });
  const old = await token('email-confirmation');
  await a.call('/auth/email-confirmation-requests', { email: 'student-pending@aja.local.test' });
  const current = await token('email-confirmation');
  assert.notEqual(current, old);
  assert.equal((await a.call('/auth/email-confirmations', { token: old })).status, 422);
  const results = await Promise.all(
    [a, b].map((c) => c.call('/auth/email-confirmations', { token: current }))
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 422]);
  assert.equal(
    (await store.read()).enrollments.filter(
      (e) => e.studentId === 'student-pending' && e.status === 'active'
    ).length,
    1
  );
  await a.call('/auth/password-reset-requests', { email: 'student@aja.local.test' });
  const reset = await token('password-reset');
  const resets = await Promise.all(
    [a, b].map((c) =>
      c.call('/auth/password-resets', { token: reset, password: 'Concurrent-pass-123!' })
    )
  );
  assert.deepEqual(resets.map((r) => r.status).sort(), [200, 422]);
});

test('confirmation never restores cancelled enrollment or activates an inactive destination and preserves token on conflict', async (t) => {
  const { client, token, store } = await setup(t);
  const c = client();
  await c.call('/auth/email-confirmation-requests', { email: 'student-pending@aja.local.test' });
  const value = await token('email-confirmation');
  await store.transact((s) => {
    s.classes.find((x) => x.id === 'c1').active = false;
  });
  const before = await store.read();
  assert.equal((await c.call('/auth/email-confirmations', { token: value })).status, 409);
  assert.deepEqual(await store.read(), before);
  await store.transact((s) => {
    s.classes.find((x) => x.id === 'c1').active = true;
    const e = s.enrollments.find((e) => e.id === 'e-pending');
    e.status = 'cancelled';
    e.deletedAt = '2031-06-15T12:00:00Z';
  });
  assert.equal((await c.call('/auth/email-confirmations', { token: value })).status, 200);
  const after = await store.read();
  assert.equal(after.enrollments.find((e) => e.id === 'e-pending').status, 'cancelled');
  assert.equal(
    after.classes.find((c) => c.id === 'c1').studentIds.includes('student-pending'),
    false
  );
});

test('confirmation tokens bind the issued e-mail and expiry instead of confirming a subsequently changed address', async (t) => {
  const { client, token, store, setTime } = await setup(t);
  const c = client();
  await c.call('/auth/email-confirmation-requests', { email: 'student-pending@aja.local.test' });
  const value = await token('email-confirmation');
  await store.transact((s) => {
    s.users.find((u) => u.id === 'student-pending').email = 'changed@example.test';
  });
  assert.equal((await c.call('/auth/email-confirmations', { token: value })).status, 422);
  await c.call('/auth/email-confirmation-requests', { email: 'changed@example.test' });
  const expired = await token('email-confirmation');
  setTime('2031-06-15T12:11:00Z');
  const result = await c.call('/auth/email-confirmations', { token: expired });
  assert.equal(result.status, 422);
  assert.equal((await result.json()).error.code, 'TOKEN_EXPIRED');
});

test('same-account sessions have independent noncredential IDs even with identical expiration timestamps', async (t) => {
  const { client } = await setup(t);
  const a = client(),
    b = client();
  const first = await (await a.login()).json(),
    second = await (await b.login()).json();
  assert.equal(first.expiresAt, second.expiresAt);
  assert.notEqual(first.sessionId, second.sessionId);
  assert.notEqual(a.cookie, b.cookie);
  assert.equal((await (await a.call('/auth/session')).json()).sessionId, first.sessionId);
  await a.call('/auth/logout', undefined, { method: 'POST' });
  assert.equal((await a.call('/auth/session')).status, 401);
  assert.equal((await b.call('/auth/session')).status, 200);
});

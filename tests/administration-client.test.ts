import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpError } from '../src/lib/http-client.ts';
import { createHttpEditor } from '../src/lib/http-editor.ts';
import { createHttpClient } from '../src/lib/http-client.ts';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createUsersApi } from '../src/features/users/api.ts';
import { createClassesApi } from '../src/features/classes/api.ts';
import { createStudentsApi } from '../src/features/students/api.ts';
import { createSessionClient } from '../src/providers/session-client.ts';

test('shared editor preserves typed text and opened revision until current record is explicitly reviewed', async () => {
  const editor = createHttpEditor({ name: 'Inicial' }, 2);
  editor.change({ name: 'Texto docente ainda não salvo' });
  const result = await editor.submit(
    async () => {
      throw new HttpError('conflict', 'Registro mudou.', { status: 409 });
    },
    async () => ({ id: 't1', revision: 3, name: 'Outro docente' })
  );
  assert.equal(result, false);
  assert.equal(editor.getSnapshot().fields.name, 'Texto docente ainda não salvo');
  assert.equal(editor.getSnapshot().expectedRevision, 2);
  assert.equal(editor.getSnapshot().conflicted, true);
  assert.equal(
    await editor.submit(
      async () => {
        throw new Error('must not submit unreviewed');
      },
      async () => ({ id: 't1', revision: 3 })
    ),
    false
  );
  editor.acknowledge();
  assert.equal(editor.getSnapshot().expectedRevision, 3);
  const requests: unknown[] = [];
  assert.equal(
    await editor.submit(
      async (fields, revision) => {
        requests.push({ fields, revision });
        return { id: 't1', revision: 4 };
      },
      async () => ({ id: 't1', revision: 4 })
    ),
    true
  );
  assert.deepEqual(requests, [{ fields: { name: 'Texto docente ainda não salvo' }, revision: 3 }]);
});

test('unavailable save preserves fields and server denial while checking conflict never permits acknowledgment', async () => {
  const editor = createHttpEditor({ email: 'pending@example.test' }, 1);
  assert.equal(
    await editor.submit(
      async () => {
        throw new HttpError('unavailable', 'Serviço indisponível.');
      },
      async () => ({ id: 'x', revision: 2 })
    ),
    false
  );
  assert.equal(editor.getSnapshot().fields.email, 'pending@example.test');
  assert.equal(editor.getSnapshot().expectedRevision, 1);
  await editor.submit(
    async () => {
      throw new HttpError('conflict', 'Mudou.');
    },
    async () => {
      throw new HttpError('not-found', 'Sem acesso.', { status: 404 });
    }
  );
  editor.acknowledge();
  assert.equal(editor.getSnapshot().blocked, true);
  assert.equal(editor.getSnapshot().expectedRevision, 1);
  assert.equal(editor.getSnapshot().conflicted, true);
});

test('pending editor rejects duplicate operations and does not clear fields before durable success', async () => {
  const editor = createHttpEditor({ name: 'Nova turma' }, 0);
  let complete!: (record: { id: string; revision: number }) => void;
  let writes = 0;
  const save = async () => {
    writes++;
    return new Promise<{ id: string; revision: number }>((resolve) => {
      complete = resolve;
    });
  };
  const pending = editor.submit(save, async () => ({ id: 'c', revision: 1 }));
  assert.equal(editor.getSnapshot().busy, true);
  assert.equal(await editor.submit(save, async () => ({ id: 'c', revision: 1 })), false);
  assert.equal(writes, 1);
  complete({ id: 'c', revision: 1 });
  assert.equal(await pending, true);
});

test('administration adapters send HTTP writes, stable intent keys and filters without browser actor fields', async () => {
  const calls: { method: string; url: string; body: unknown; key?: string }[] = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    calls.push({
      method: req.method!,
      url: req.url!,
      body: body ? JSON.parse(body) : undefined,
      key: req.headers['idempotency-key'] as string | undefined
    });
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({ id: 'record1', revision: 2, items: [], page: 1, pageSize: 20, total: 0 })
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    const http = createHttpClient({ baseUrl: `http://127.0.0.1:${address.port}/api/v1` });
    const users = createUsersApi(http);
    const classes = createClassesApi(http);
    const students = createStudentsApi(http);
    await users.save(
      { name: 'Docente', email: 'docente@example.test' },
      0,
      undefined,
      'teacher-intent'
    );
    await users.command('u1', 'role', 4, 'teacher');
    await classes.save(
      { name: 'Turma', code: 'T1', year: 2026, shift: 'Noite' },
      0,
      undefined,
      'class-intent'
    );
    await classes.command('c1', 'close', 5, 'close-intent');
    await students.preview('c1', 'aluno+tag@example.test');
    await students.add('c1', 'aluno@example.test', 'add-intent');
    await students.command('e1', 'end', 6, 'end-intent');
    await users.list('Nome & texto', 'teacher', 2);
    await students.list('c1', 'Aluno', true, 3);
    await students.enrollments('c1', 'pending+', true, 2);
    assert.deepEqual(calls[0], {
      method: 'POST',
      url: '/api/v1/users',
      body: { name: 'Docente', email: 'docente@example.test', role: 'teacher' },
      key: 'teacher-intent'
    });
    assert.deepEqual(calls[1].body, { expectedRevision: 4, role: 'teacher' });
    assert.deepEqual(calls[2].body, { name: 'Turma', code: 'T1', year: 2026, shift: 'Noite' });
    assert.equal(calls[3].url, '/api/v1/classes/c1/close');
    assert.deepEqual(calls[3].body, { expectedRevision: 5 });
    assert.equal(
      calls[4].url,
      '/api/v1/enrollments/preview?classId=c1&email=aluno%2Btag%40example.test'
    );
    assert.deepEqual(calls[5].body, { classId: 'c1', email: 'aluno@example.test' });
    assert.equal(calls[6].key, 'end-intent');
    assert.equal(calls[7].url, '/api/v1/users?page=2&pageSize=20&q=Nome+%26+texto&role=teacher');
    assert.equal(
      calls[8].url,
      '/api/v1/students?classId=c1&history=true&page=3&pageSize=20&q=Aluno'
    );
    assert.equal(
      calls[9].url,
      '/api/v1/enrollments?classId=c1&status=pending%2Ccancelled&page=2&pageSize=20&q=pending%2B'
    );
  } finally {
    await new Promise<void>((done) => {
      server.closeAllConnections();
      server.close(() => done());
    });
  }
});

test('compositions are hidden on failure, restored with original revision only for verified same session, and stale callbacks cannot write another session', async () => {
  const user = {
    id: 'admin',
    name: 'Admin',
    email: 'admin@example.test',
    role: 'admin' as const,
    revision: 1
  };
  let reply = { user, sessionId: 'public1', expiresAt: '2030-01-01T00:00:00Z' };
  let offline = false;
  const client = createSessionClient({
    request: async <T>(): Promise<T> => {
      if (offline) throw new HttpError('unavailable', 'Offline');
      return reply as T;
    }
  });
  await client.login(user.email, 'password');
  const key = client.getSnapshot().sessionKey;
  client.saveDraft('users-fields', { fields: { name: 'Unsaved' }, expectedRevision: 4 }, key);
  offline = true;
  await client.refresh();
  assert.equal(client.readDraft('users-fields'), undefined);
  offline = false;
  await client.refresh();
  assert.deepEqual(client.readDraft('users-fields'), {
    fields: { name: 'Unsaved' },
    expectedRevision: 4
  });
  reply = { ...reply, sessionId: 'public2' };
  await client.refresh();
  client.saveDraft('users-fields', { fields: { name: 'Old callback' }, expectedRevision: 4 }, key);
  assert.equal(client.readDraft('users-fields'), undefined);
});

test('verified session refresh invalidates resource projections without changing the editor identity', async () => {
  const reply = {
    user: { id: 'admin', name: 'Admin', email: 'admin@example.test', role: 'admin' as const },
    sessionId: 'stable-public',
    expiresAt: '2030-01-01T00:00:00Z'
  };
  const client = createSessionClient({ request: async <T>(): Promise<T> => reply as T });
  await client.login(reply.user.email, 'password');
  const before = client.getSnapshot();
  await client.refresh();
  const after = client.getSnapshot();
  assert.equal(after.sessionKey, before.sessionKey);
  assert.ok(
    after.resourceEpoch > before.resourceEpoch,
    'focus refresh must trigger resource reload even for unchanged session'
  );
});

test('failed conflict inspection can be retried without recognizing a newer revision or overwriting text', async () => {
  const editor = createHttpEditor({ name: 'Meu texto' }, 2);
  let notifications = 0;
  const unsubscribe = editor.subscribe(() => notifications++);
  await editor.submit(
    async () => {
      throw new HttpError('conflict', 'Mudou.', {
        code: 'REVISION_CONFLICT',
        details: { currentRevision: 3 }
      });
    },
    async () => {
      throw new HttpError('unavailable', 'Sem conexão.');
    }
  );
  assert.equal(editor.getSnapshot().conflicted, true);
  editor.acknowledge();
  assert.equal(editor.getSnapshot().expectedRevision, 2);
  await editor.review(async () => ({ id: 'u1', revision: 3 }));
  assert.equal(editor.getSnapshot().expectedRevision, 2);
  editor.acknowledge();
  assert.equal(editor.getSnapshot().expectedRevision, 3);
  assert.equal(editor.getSnapshot().fields.name, 'Meu texto');
  const count = notifications;
  unsubscribe();
  editor.change({ name: 'Outro texto' });
  assert.equal(notifications, count);
});

test('class selector loads authorized later pages and keeps inactive historical destinations available', async () => {
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const url = new URL(req.url!, 'http://local');
    const page = Number(url.searchParams.get('page'));
    const items =
      page === 1
        ? Array.from({ length: 100 }, (_, index) => ({
            id: `c${index}`,
            name: `Turma ${index}`,
            active: true
          }))
        : [{ id: 'historic', name: 'Turma encerrada', active: false }];
    res.end(JSON.stringify({ items, page, pageSize: 100, total: 101 }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    const api = createClassesApi(
      createHttpClient({ baseUrl: `http://127.0.0.1:${address.port}/api/v1` })
    );
    const classes = await api.options();
    assert.equal(classes.length, 101);
    assert.deepEqual(classes.at(-1), { id: 'historic', name: 'Turma encerrada', active: false });
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      api.options(controller.signal),
      (error: unknown) => error instanceof HttpError && error.kind === 'cancelled'
    );
  } finally {
    await new Promise<void>((done) => {
      server.closeAllConnections();
      server.close(() => done());
    });
  }
});

test('creation business conflict preserves useful error and permits corrected fields without reading an absent record', async () => {
  const editor = createHttpEditor({ email: 'duplicate@example.test' }, 0);
  let reads = 0;
  const read = async () => {
    reads++;
    throw new Error('Creation has no record ID');
  };
  await editor.submit(async () => {
    throw new HttpError('conflict', 'Este e-mail já está cadastrado.', {
      code: 'BUSINESS_CONFLICT',
      status: 409
    });
  }, read);
  assert.equal(editor.getSnapshot().error, 'Este e-mail já está cadastrado.');
  assert.equal(editor.getSnapshot().conflicted, false);
  assert.equal(editor.getSnapshot().blocked, false);
  assert.equal(reads, 0);
  editor.change({ email: 'new@example.test' });
  assert.equal(
    await editor.submit(async (fields) => {
      assert.equal(fields.email, 'new@example.test');
      return { id: 'new', revision: 1 };
    }, read),
    true
  );
});

test('idempotency conflict blocks the old creation intent until the operator verifies it and starts a new intent', async () => {
  const editor = createHttpEditor({ name: 'Nova turma' }, 0);
  let reads = 0;
  await editor.submit(
    async () => {
      throw new HttpError('conflict', 'Esta intenção já foi usada. Confira a operação anterior.', {
        code: 'IDEMPOTENCY_CONFLICT',
        status: 409
      });
    },
    async () => {
      reads++;
      return { id: 'none', revision: 1 };
    }
  );
  assert.equal(editor.getSnapshot().blocked, true);
  assert.equal(editor.getSnapshot().conflicted, false);
  assert.equal(reads, 0);
  editor.change({ name: 'Outro nome' });
  let writes = 0;
  assert.equal(
    await editor.submit(
      async () => {
        writes++;
        return { id: 'new', revision: 1 };
      },
      async () => ({ id: 'none', revision: 1 })
    ),
    false
  );
  assert.equal(writes, 0);
});

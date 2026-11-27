async page => {
  const browser = page.context().browser();
  const api = 'http://127.0.0.1:3203/api/v1';
  const site = 'http://127.0.0.1:3001';
  const seen = [];
  const login = async id => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const current = await context.newPage();
    current.on('response', response => {
      const url = new URL(response.url());
      if (url.pathname.startsWith('/api/v1/')) seen.push({ actor: id, method: response.request().method(), path: url.pathname, status: response.status() });
    });
    await current.goto(`${site}/login`, { waitUntil: 'domcontentloaded' });
    await current.getByLabel('E-mail').fill(`${id}@aja.local.test`);
    await current.getByRole('textbox', { name: 'Senha' }).fill(`AjaLocal-${id}-2031!`);
    await current.getByRole('button', { name: 'Entrar' }).click();
    await current.waitForFunction(() => location.pathname.startsWith('/perfil'), null, { timeout: 15000 });
    return { context, page: current };
  };
  const request = (actor, path, method = 'GET', body) => actor.page.evaluate(async ({ api, path, method, body }) => {
    const response = await fetch(`${api}${path}`, { method, credentials: 'include', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, payload: response.status === 204 ? null : await response.json() };
  }, { api, path, method, body });

  const teacherA = await login('teacher-a');
  const teacherB = await login('teacher-b');
  const current = await request(teacherA, '/modules/m1');
  if (current.status !== 200) throw new Error(`module GET returned ${current.status}`);
  const revision = current.payload.revision;
  const first = await request(teacherA, '/modules/m1', 'PATCH', { expectedRevision: revision, description: 'Conflict probe AJA-18 A' });
  const second = await request(teacherB, '/modules/m1', 'PATCH', { expectedRevision: revision, description: 'Conflict probe AJA-18 B' });
  if (first.status !== 200 || second.status !== 409) throw new Error(`expected one 200 and one 409 for stale revision; got ${first.status},${second.status}`);
  const afterConflict = await request(teacherA, '/modules/m1');
  if (!['Conflict probe AJA-18 A', 'Conflict probe AJA-18 B'].includes(afterConflict.payload.description)) throw new Error('stale write changed neither durable winner nor module state');

  const invalidAttendance = await request(teacherA, '/attendance', 'POST', {});
  if (invalidAttendance.status !== 422) throw new Error(`invalid attendance expected real 422, got ${invalidAttendance.status}`);

  await teacherA.page.route('**/api/v1/health?aja18-timeout', async route => {
    await new Promise(resolve => setTimeout(resolve, 100));
    await route.abort('timedout');
  });
  const timeout = await teacherA.page.evaluate(async api => {
    try {
      await fetch(`${api}/health?aja18-timeout`, { signal: AbortSignal.timeout(30) });
      return { outcome: 'unexpected-response' };
    } catch (error) { return { outcome: error.name, message: error.message }; }
  }, api);
  if (timeout.outcome !== 'TimeoutError') throw new Error(`expected browser TimeoutError, got ${timeout.outcome}`);

  await teacherA.page.route('**/api/v1/files', async route => {
    if (route.request().method() === 'POST') await route.abort('connectionaborted');
    else await route.continue();
  });
  const upload = await teacherA.page.evaluate(async api => {
    const body = new FormData();
    body.append('file', new Blob(['AJA-18 interrupted upload probe'], { type: 'text/plain' }), 'interrupted.txt');
    try {
      const response = await fetch(`${api}/files`, { method: 'POST', body, credentials: 'include' });
      return { outcome: 'response', status: response.status };
    } catch (error) { return { outcome: 'network-error', name: error.name }; }
  }, api);
  if (upload.outcome !== 'network-error') throw new Error(`interrupted upload was expected to fail at transport: ${JSON.stringify(upload)}`);

  const outcomes = { conflict: { initialRevision: revision, first: first.status, secondStale: second.status, persistedDescription: afterConflict.payload.description }, invalidAttendance: invalidAttendance.status, timeout, interruptedUpload: upload, seen };
  await teacherA.context.close();
  await teacherB.context.close();
  return { result: 'PASS', outcomes };
}

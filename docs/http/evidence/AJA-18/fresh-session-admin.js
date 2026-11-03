async page => {
  const browser = page.context().browser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const fresh = await context.newPage();
  const responses = [];
  fresh.on('response', response => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/v1/')) responses.push({ method: response.request().method(), path: url.pathname, status: response.status() });
  });
  await fresh.goto('http://127.0.0.1:3001/login', { waitUntil: 'domcontentloaded' });
  const firstOpen = await fresh.evaluate(() => ({ localStorage: localStorage.length, sessionStorage: sessionStorage.length }));
  if (firstOpen.localStorage !== 0 || firstOpen.sessionStorage !== 0) throw new Error(`fresh browser context was not empty: ${JSON.stringify(firstOpen)}`);
  await fresh.getByLabel('E-mail').fill('admin@aja.local.test');
  await fresh.getByRole('textbox', { name: 'Senha' }).fill('AjaLocal-admin-2031!');
  await fresh.getByRole('button', { name: 'Entrar' }).click();
  await fresh.waitForFunction(() => document.querySelector('main h1')?.innerText !== 'Entrar no AJA Digital', null, { timeout: 15000 });
  await fresh.waitForTimeout(400);
  const loaded = await fresh.evaluate(() => ({ url: location.pathname, heading: document.querySelector('main h1')?.innerText || '', text: document.querySelector('main')?.innerText || '' }));
  if (!loaded.heading || /Entrar no AJA Digital/.test(loaded.heading)) throw new Error(`login did not reach an authenticated screen: ${JSON.stringify(loaded)}`);
  if (!responses.some(item => item.method === 'POST' && item.path === '/api/v1/auth/login' && item.status === 200)) throw new Error(`no real successful login response was observed: ${JSON.stringify(responses)}`);
  if (!responses.some(item => item.method === 'GET' && item.path === '/api/v1/me/enrollments' && item.status === 200)) throw new Error(`no authenticated enrollment response was observed: ${JSON.stringify(responses)}`);
  await context.close();
  return { result: 'PASS', emptyStorageBeforeLogin: firstOpen, account: 'admin (fictitious operator seed)', loaded, apiResponses: responses };
}

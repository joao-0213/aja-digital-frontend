async page => {
  const browser = page.context().browser();
  const context = await browser.newContext();
  const current = await context.newPage();
  const outcomes = [];
  current.on('response', response => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/v1/')) outcomes.push({ method: response.request().method(), path: url.pathname, status: response.status() });
  });
  await current.goto('http://127.0.0.1:3001/login', { waitUntil: 'domcontentloaded' });
  await current.getByLabel('E-mail').fill('admin@aja.local.test');
  await current.getByRole('textbox', { name: 'Senha' }).fill('AjaLocal-admin-2031!');
  await current.getByRole('button', { name: 'Entrar' }).click();
  await current.waitForTimeout(2000);
  const result = await current.evaluate(() => ({ url: location.href, main: document.querySelector('main')?.innerText || '' }));
  await context.close();
  return { result: result.url.includes('/perfil') ? 'PASS' : 'FAIL', ...result, observedHttp: outcomes };
}

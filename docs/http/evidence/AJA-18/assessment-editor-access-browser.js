async page => {
  const browser = page.context().browser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const current = await context.newPage();
  const responses = [];
  current.on('response', response => { const url = new URL(response.url()); if (url.pathname.startsWith('/api/v1/')) responses.push({ method: response.request().method(), path: url.pathname, status: response.status() }); });
  await current.goto('http://127.0.0.1:3001/login', { waitUntil: 'domcontentloaded' });
  await current.getByLabel('E-mail').fill('teacher-a@aja.local.test');
  await current.getByRole('textbox', { name: 'Senha' }).fill('AjaLocal-teacher-a-2031!');
  await current.getByRole('button', { name: 'Entrar' }).click();
  await current.waitForFunction(() => location.pathname.startsWith('/perfil'), null, { timeout: 15000 });
  await current.goto('http://127.0.0.1:3001/questionarios/criar?id=assessment-1294a55f-1b7e-4978-a249-d4bfca717726', { waitUntil: 'domcontentloaded' });
  await current.waitForTimeout(1200);
  const dom = await current.evaluate(() => ({ url: location.href, heading: document.querySelector('main h1')?.innerText || '', text: document.querySelector('main')?.innerText.slice(0, 1000) || '' }));
  await context.close();
  if (!dom.heading) throw new Error('assessment editor heading missing after loaded UI: ' + JSON.stringify(dom));
  return { result: 'PASS', dom, responses };
}

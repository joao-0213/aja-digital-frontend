async page => {
  const token = process.env.AJA18_RECOVERY_TOKEN;
  if (!token) throw new Error('Temporary recovery token was not provided through the process environment.');
  const browser = page.context().browser();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const current = await context.newPage();
  const responses = [];
  current.on('response', response => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/v1/')) responses.push({ method: response.request().method(), path: url.pathname, status: response.status() });
  });
  await current.goto(`http://127.0.0.1:3001/recuperar-senha?token=${encodeURIComponent(token)}`, { waitUntil: 'domcontentloaded' });
  if (await current.locator('main h1').innerText() !== 'Definir nova senha') throw new Error('recovery link did not render the new-password form');
  await current.getByRole('textbox', { name: 'Nova senha' }).fill('AjaLocal-reset-2031!');
  await current.getByRole('button', { name: 'Salvar nova senha' }).click();
  await current.getByText(/senha.*atualizada|acessar/i).waitFor({ state: 'visible', timeout: 10000 });
  if (!responses.some(item => item.method === 'POST' && item.path === '/api/v1/auth/password-resets' && item.status === 200)) throw new Error(`password reset response not observed: ${JSON.stringify(responses)}`);
  await current.goto('http://127.0.0.1:3001/login', { waitUntil: 'domcontentloaded' });
  await current.getByLabel('E-mail').fill('student-empty@aja.local.test');
  await current.getByRole('textbox', { name: 'Senha' }).fill('AjaLocal-reset-2031!');
  await current.getByRole('button', { name: 'Entrar' }).click();
  await current.waitForFunction(() => document.querySelector('main h1')?.innerText !== 'Entrar no AJA Digital', null, { timeout: 15000 });
  if (!responses.some(item => item.method === 'POST' && item.path === '/api/v1/auth/login' && item.status === 200)) throw new Error(`login with reset password did not use real API success: ${JSON.stringify(responses)}`);
  const final = await current.evaluate(() => ({ urlPath: location.pathname, heading: document.querySelector('main h1')?.innerText || '' }));
  await context.close();
  return { result: 'PASS', tokenSentToRealAPIWithoutLogging: true, resetStatus: 200, loginWithNewPassword: 200, final, responses };
}

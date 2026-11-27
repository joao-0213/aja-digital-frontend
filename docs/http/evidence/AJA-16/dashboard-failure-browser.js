async page => {
  const context = await page.context().browser().newContext();
  const checkPage = await context.newPage();
  const statuses = [];
  checkPage.on('response', response => {
    if (response.url().endsWith('/api/v1/me/dashboard')) statuses.push(response.status());
  });
  await checkPage.goto('http://127.0.0.1:3000/login');
  await checkPage.getByLabel('E-mail').fill('teacher-b@aja.local.test');
  await checkPage.getByRole('textbox', { name: 'Senha' }).fill('AjaLocal-teacher-b-2031!');
  await checkPage.getByRole('button', { name: 'Entrar' }).click();
  await checkPage.waitForURL(url => url.pathname.replace(/\/$/, '') === '/perfil');
  await checkPage.route('**/api/v1/me/dashboard', route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'API_UNAVAILABLE', message: 'Serviço indisponível.', requestId: 'AJA16-browser-failure' } })
  }));
  await checkPage.goto('http://127.0.0.1:3000/');
  await checkPage.getByRole('alert').getByText('Serviço indisponível.').waitFor();
  const subjectCardsBeforeRetry = await checkPage.locator('a[href*="/disciplinas/detalhes"]').count();
  await checkPage.unroute('**/api/v1/me/dashboard');
  const retryResponse = checkPage.waitForResponse(response => response.url().endsWith('/api/v1/me/dashboard') && response.status() === 200);
  await checkPage.getByRole('button', { name: 'Tentar novamente' }).click();
  await retryResponse;
  await checkPage.getByText('Disciplinas', { exact: true }).waitFor();
  const result = { dashboardResponses: statuses, subjectCardsBeforeRetry, retryStatus: 200, recoveredAfterRetry: true };
  await context.close();
  return result;
}

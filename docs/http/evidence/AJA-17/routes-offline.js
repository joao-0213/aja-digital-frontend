async page => {
  const base = 'http://127.0.0.1:3001';
  const routes = [
    '/', '/login', '/cadastro', '/recuperar-senha', '/perfil', '/usuarios', '/turmas',
    '/alunos', '/alunos/perfil?id=student', '/disciplinas',
    '/disciplinas/detalhes?id=s1&aba=materiais#module-m1', '/materiais?id=material-text',
    '/questoes?id=q1', '/questionarios', '/questionarios/criar?id=quiz-draft',
    '/questionarios/responder?id=quiz-open', '/questionarios/resultado?id=attempt-sent',
    '/avisos', '/calendario', '/forum?disciplina=s1&questao=q2&material=material-text',
    '/forum/topico?id=topic1', '/frequencia'
  ];
  const apiProbe = await page.evaluate(async () => {
    try { const response = await fetch('http://127.0.0.1:3002/api/v1/health', { credentials: 'include' }); return { outcome: 'http', status: response.status }; }
    catch (error) { return { outcome: 'network-failure', name: error?.name || '', message: error?.message || '' }; }
  });
  if (apiProbe.outcome !== 'network-failure') throw new Error(`API should be truly offline: ${JSON.stringify(apiProbe)}`);
  const results = [];
  for (const route of routes) {
    const response = await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const pageData = await page.evaluate(() => ({
      heading: document.querySelector('main h1, main h2')?.innerText || '',
      text: document.querySelector('main')?.innerText || document.body.innerText,
      alerts: [...document.querySelectorAll('[role="alert"],[role="status"]')].map(node => node.innerText.trim()).filter(Boolean)
    }));
    results.push({ route, staticHttp: response?.status() ?? null, heading: pageData.heading, visibleError: /indisponível|indisponibilidade|não foi possível|entre na sua conta/i.test(pageData.text) });
    if (response?.status() !== 200) throw new Error(`${route}: static export returned ${response?.status()}`);
    if (!pageData.heading) throw new Error(`${route}: no post-load heading in offline state`);
    if (!['/login', '/cadastro', '/recuperar-senha'].includes(new URL(route, base).pathname) && !/indisponível|não foi possível/i.test(pageData.text)) throw new Error(`${route}: API error was not visible after loading`);
  }
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  const loginFailures = [];
  page.on('requestfailed', request => {
    if (request.url().includes('/api/v1/auth/login')) loginFailures.push(request.failure()?.errorText || 'network failure');
  });
  await page.getByLabel('E-mail').fill('offline-check@invalid.local');
  await page.getByRole('textbox', { name: 'Senha' }).fill('offline-verification-only');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForTimeout(1200);
  const afterLogin = await page.evaluate(() => ({
    url: location.pathname,
    text: document.querySelector('main')?.innerText || '',
    alerts: [...document.querySelectorAll('[role="alert"],[role="status"]')].map(node => node.innerText.trim()).filter(Boolean)
  }));
  const noSuccess = !/sessão iniciada|login realizado|bem-vindo|entraram na conta/i.test(`${afterLogin.text}\n${afterLogin.alerts.join('\n')}`);
  if (!loginFailures.length || !noSuccess) throw new Error(`offline sign-in falsely succeeded or did not fail: ${JSON.stringify({ loginFailures, afterLogin })}`);
  return { result: 'PASS', api: 'unavailable', apiProbe, routesVisited: results.length, routes: results, loginFailure: loginFailures, loginAfter: { url: afterLogin.url, errorVisible: afterLogin.alerts.length > 0 || /não foi possível|falha|conectar|indisponível/i.test(afterLogin.text), successDisplayed: !noSuccess } };
}

async page => {
  const browser = page.context().browser();
  const site = 'http://127.0.0.1:3001';
  const apiOrigin = 'http://127.0.0.1:3203';
  const routes = [
    { path: '/', actor: 'student' },
    { path: '/perfil', actor: 'admin' },
    { path: '/usuarios', actor: 'admin' },
    { path: '/turmas', actor: 'admin' },
    { path: '/alunos?turma=c1', actor: 'admin' },
    { path: '/alunos/perfil?id=student', actor: 'admin' },
    { path: '/disciplinas?turma=c1', actor: 'admin' },
    { path: '/disciplinas/detalhes?id=s1&aba=materiais', actor: 'teacher-a' },
    { path: '/materiais?id=material-text', actor: 'student' },
    { path: '/questoes?id=q1', actor: 'student' },
    { path: '/questionarios', actor: 'student' },
    { path: '/questionarios/criar?id=quiz-draft', actor: 'teacher-a' },
    { path: '/questionarios/responder?id=quiz-open', actor: 'student' },
    { path: '/questionarios/resultado?id=attempt-sent', actor: 'student' },
    { path: '/avisos', actor: 'student' },
    { path: '/calendario', actor: 'student' },
    { path: '/forum?disciplina=s1&questao=q2&material=material-text', actor: 'student' },
    { path: '/forum/topico?id=topic1', actor: 'student' },
    { path: '/frequencia?disciplina=s1', actor: 'teacher-a' }
  ];
  const credentials = {
    admin: ['admin@aja.local.test', 'AjaLocal-admin-2031!'],
    'teacher-a': ['teacher-a@aja.local.test', 'AjaLocal-teacher-a-2031!'],
    student: ['student@aja.local.test', 'AjaLocal-student-2031!']
  };
  const contexts = {};
  const apiFailures = [];
  for (const [actor, [email, password]] of Object.entries(credentials)) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const loginPage = await context.newPage();
    await loginPage.goto(`${site}/login`, { waitUntil: 'domcontentloaded' });
    await loginPage.getByLabel('E-mail').fill(email);
    await loginPage.getByRole('textbox', { name: 'Senha' }).fill(password);
    await loginPage.getByRole('button', { name: 'Entrar' }).click();
    try {
      await loginPage.waitForFunction(() => location.pathname.startsWith('/perfil'), null, { timeout: 8000 });
    } catch {
      const visible = await loginPage.locator('main').innerText().catch(() => '');
      await context.close();
      return { result: 'FAIL', phase: 'login', actor, visibleText: visible.slice(0, 240) };
    }
    contexts[actor] = context;
    await loginPage.close();
  }

  const results = [];
  for (const item of routes) {
    const context = contexts[item.actor];
    const current = await context.newPage();
    let shouldFail = true;
    current.on('requestfailed', request => {
      if (new URL(request.url()).pathname.startsWith('/api/v1/')) apiFailures.push({ route: item.path, actor: item.actor, method: request.method(), path: new URL(request.url()).pathname, error: request.failure()?.errorText || 'request-failed' });
    });
    await context.route(`${apiOrigin}/api/v1/**`, route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/v1/auth/session') return route.continue();
      return shouldFail ? route.abort('failed') : route.continue();
    });
    let response = null, state = null, failure = '';
    try {
      response = await current.goto(`${site}${item.path}`, { waitUntil: 'domcontentloaded' });
      await current.waitForFunction(() => /N[aã]o conseguimos carregar esta p[aá]gina|Servi[cç]o indispon[ií]vel/i.test(document.querySelector('main')?.innerText || ''), null, { timeout: 12000 });
      state = await current.evaluate(() => ({ heading: document.querySelector('main h1, main h2')?.innerText || '', mainText: document.querySelector('main')?.innerText || '', width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      if (response.status() !== 200 || state.scrollWidth > state.width || !/Tentar novamente/.test(state.mainText)) failure = 'missing HTTP 200, PT-BR network error, retry action, or no-overflow assertion';
    } catch (error) {
      failure = error.name || 'navigation failure';
      state = await current.evaluate(() => ({ url: location.href, heading: document.querySelector('main h1, main h2')?.innerText || '', mainText: document.querySelector('main')?.innerText || '', width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    }
    const failuresForRoute = apiFailures.filter(value => value.route === item.path && value.actor === item.actor);
    if (!failuresForRoute.length) failure ||= 'no intercepted API request';
    results.push({ route: item.path, actor: item.actor, outcome: failure ? 'FAIL' : 'PASS', failure, staticHttp: response?.status() ?? null, postLoadHeading: state.heading, postLoadUrl: state.url, visiblePTBRError: state.mainText.match(/N[aã]o conseguimos carregar esta p[aá]gina|Servi[cç]o indispon[ií]vel[^\n]*/i)?.[0] || '', retryAction: /Tentar novamente/.test(state.mainText), networkFailures: failuresForRoute, width: state.width, noHorizontalOverflow: state.scrollWidth <= state.width });
    shouldFail = false;
    await context.unroute(`${apiOrigin}/api/v1/**`);
    await current.close();
  }
  const responsiveContext = contexts.student;
  const responsivePage = await responsiveContext.newPage();
  const responsiveFailures = [];
  responsivePage.on('requestfailed', request => {
    if (new URL(request.url()).pathname.startsWith('/api/v1/')) responsiveFailures.push({ method: request.method(), path: new URL(request.url()).pathname, error: request.failure()?.errorText || 'request-failed' });
  });
  await responsiveContext.route(`${apiOrigin}/api/v1/**`, route => new URL(route.request().url()).pathname === '/api/v1/auth/session' ? route.continue() : route.abort('failed'));
  const forumResponsive = [];
  for (const width of [390, 768, 1440]) {
    const previousFailureCount = responsiveFailures.length;
    await responsivePage.setViewportSize({ width, height: 1000 });
    await responsivePage.goto(`${site}/forum/topico?id=topic1`, { waitUntil: 'domcontentloaded' });
    await responsivePage.waitForFunction(() => /N[aã]o conseguimos carregar esta p[aá]gina|Servi[cç]o indispon[ií]vel/i.test(document.querySelector('main')?.innerText || ''), null, { timeout: 12000 });
    await responsivePage.keyboard.press('Tab');
    const state = await responsivePage.evaluate(() => {
      const active = document.activeElement;
      const rect = active?.getBoundingClientRect();
      const main = document.querySelector('main');
      return { heading: main?.querySelector('h1, h2')?.innerText || '', mainText: main?.innerText || '', viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth, focusTag: active?.tagName || '', focusVisible: Boolean(rect && rect.width && rect.height && rect.bottom > 0 && rect.top < innerHeight) };
    });
    const failuresForViewport = responsiveFailures.slice(previousFailureCount);
    const passed = state.documentWidth <= state.viewportWidth && state.focusVisible && /Tentar novamente/.test(state.mainText) && failuresForViewport.length > 0;
    forumResponsive.push({ width, outcome: passed ? 'PASS' : 'FAIL', ...state, retryAction: /Tentar novamente/.test(state.mainText), networkFailures: failuresForViewport });
    if (!passed) throw new Error(`forum offline responsive check failed at ${width}px: ${JSON.stringify(state)}`);
  }
  await responsiveContext.unroute(`${apiOrigin}/api/v1/**`);
  await responsivePage.close();
  for (const context of Object.values(contexts)) await context.close();
  return { result: results.every(item => item.outcome === 'PASS') && forumResponsive.every(item => item.outcome === 'PASS') ? 'PASS' : 'PARTIAL', site, apiOrigin, routeCount: results.length, passed: results.filter(item => item.outcome === 'PASS').length, failed: results.filter(item => item.outcome === 'FAIL').length, forumResponsive, routes: results };
}

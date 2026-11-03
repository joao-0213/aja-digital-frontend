async page => {
  const site = 'http://127.0.0.1:3001';
  const apiOrigin = 'http://127.0.0.1:3203';
  const browser = page.context().browser();
  const credentials = {
    admin: ['admin@aja.local.test', 'AjaLocal-admin-2031!'],
    teacher: ['teacher-a@aja.local.test', 'AjaLocal-teacher-a-2031!'],
    student: ['student@aja.local.test', 'AjaLocal-student-2031!']
  };
  const cases = [
    ['/', 'student'], ['/perfil', 'admin'], ['/usuarios', 'admin'], ['/turmas', 'admin'],
    ['/alunos?turma=c1', 'admin'], ['/alunos/perfil?id=student', 'admin'], ['/disciplinas?turma=c1', 'admin'],
    ['/disciplinas/detalhes?id=s1&aba=materiais', 'teacher'], ['/materiais?id=material-text', 'student'],
    ['/questoes?id=q1', 'student'], ['/questionarios', 'student'], ['/questionarios/criar?id=quiz-draft', 'teacher'],
    ['/questionarios/responder?id=quiz-open', 'student'], ['/questionarios/resultado?id=attempt-sent', 'student'],
    ['/avisos', 'student'], ['/calendario', 'student'], ['/forum?disciplina=s1&questao=q2&material=material-text', 'student'],
    ['/forum/topico?id=topic1', 'student'], ['/frequencia?disciplina=s1', 'teacher']
  ];
  const contexts = {};
  for (const [actor, [email, password]] of Object.entries(credentials)) {
    const context = await browser.newContext();
    const login = await context.newPage();
    await login.goto(`${site}/login`);
    await login.getByLabel('E-mail').fill(email);
    await login.getByRole('textbox', { name: 'Senha' }).fill(password);
    await login.getByRole('button', { name: 'Entrar' }).click();
    await login.waitForFunction(() => location.pathname.replace(/\/$/, '') === '/perfil', null, { timeout: 10000 });
    await login.close();
    contexts[actor] = context;
  }
  const results = [];
  for (const [routePath, actor] of cases) {
    const context = contexts[actor];
    for (const width of [390, 768, 1440]) {
      const failedRequests = [];
      const current = await context.newPage();
      await current.setViewportSize({ width, height: 900 });
      current.on('requestfailed', request => {
        if (new URL(request.url()).pathname.startsWith('/api/v1/')) failedRequests.push({ method: request.method(), path: new URL(request.url()).pathname, error: request.failure()?.errorText || 'request-failed' });
      });
      await context.route(`${apiOrigin}/api/v1/**`, route => new URL(route.request().url()).pathname === '/api/v1/auth/session' ? route.continue() : route.abort('failed'));
      const response = await current.goto(`${site}${routePath}`, { waitUntil: 'domcontentloaded' });
      await current.waitForFunction(() => /N[aã]o conseguimos carregar esta p[aá]gina|Servi[cç]o indispon[ií]vel/i.test(document.querySelector('main')?.innerText || ''), null, { timeout: 12000 });
      await current.keyboard.press('Tab');
      const beforeReload = await current.evaluate(() => {
        const active = document.activeElement;
        const rect = active?.getBoundingClientRect();
        const mainText = document.querySelector('main')?.innerText || '';
        return { mainText, focusTag: active?.tagName || '', focusVisible: Boolean(rect && rect.width && rect.height && rect.bottom > 0 && rect.top < innerHeight), viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth };
      });
      const firstRequestCount = failedRequests.length;
      await current.reload({ waitUntil: 'domcontentloaded' });
      await current.waitForFunction(() => /N[aã]o conseguimos carregar esta p[aá]gina|Servi[cç]o indispon[ií]vel/i.test(document.querySelector('main')?.innerText || ''), null, { timeout: 12000 });
      const afterReload = await current.evaluate(() => ({ mainText: document.querySelector('main')?.innerText || '', viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth }));
      const retryVisibleBefore = /Tentar novamente/.test(beforeReload.mainText);
      const retryVisibleAfter = /Tentar novamente/.test(afterReload.mainText);
      const passed = response.status() === 200 && failedRequests.length > firstRequestCount && retryVisibleBefore && retryVisibleAfter && beforeReload.focusVisible && beforeReload.documentWidth <= width && afterReload.documentWidth <= width;
      results.push({ route: routePath, actor, width, outcome: passed ? 'PASS' : 'FAIL', staticHttp: response.status(), failedRequests, retryVisibleBefore, retryVisibleAfter, focusTag: beforeReload.focusTag, focusVisible: beforeReload.focusVisible, beforeReloadWidth: beforeReload.documentWidth, afterReloadWidth: afterReload.documentWidth });
      await context.unroute(`${apiOrigin}/api/v1/**`);
      await current.close();
    }
  }
  const publicResults = [];
  for (const routePath of ['/login', '/cadastro', '/recuperar-senha']) {
    const context = await browser.newContext();
    const current = await context.newPage();
    const errors = [];
    current.on('requestfailed', request => { if (new URL(request.url()).pathname.startsWith('/api/v1/')) errors.push(request.failure()?.errorText || 'request-failed'); });
    await current.setViewportSize({ width: 390, height: 900 });
    await context.route(`${apiOrigin}/api/v1/**`, route => route.continue());
    const response = await current.goto(`${site}${routePath}`, { waitUntil: 'domcontentloaded' });
    await current.locator('main').waitFor();
    const mainText = await current.locator('main').innerText();
    await current.keyboard.press('Tab');
    const focusVisible = await current.evaluate(() => { const rect = document.activeElement?.getBoundingClientRect(); return Boolean(rect && rect.width && rect.height && rect.bottom > 0 && rect.top < innerHeight); });
    publicResults.push({ route: routePath, width: 390, staticHttp: response.status(), noApiFailure: errors.length === 0, mainVisible: mainText.length > 0, focusVisible, outcome: response.status() === 200 && errors.length === 0 && mainText.length > 0 && focusVisible ? 'PASS' : 'FAIL' });
    await context.close();
  }
  for (const context of Object.values(contexts)) await context.close();
  const failed = results.filter(result => result.outcome !== 'PASS');
  return { result: failed.length || publicResults.some(result => result.outcome !== 'PASS') ? 'FAIL' : 'PASS', caseCount: results.length, passed: results.length - failed.length, failed, publicControl: publicResults, routes: results };
}

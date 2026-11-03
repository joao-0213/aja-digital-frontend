async page => {
  const browser = page.context().browser();
  const site = 'http://127.0.0.1:3001';
  const apiResponses = [];
  const actors = {};
  for (const id of ['admin', 'teacher-a', 'student']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const current = await context.newPage();
    current.on('response', response => {
      const url = new URL(response.url());
      if (url.pathname.startsWith('/api/v1/')) apiResponses.push({ actor: id, method: response.request().method(), path: url.pathname, status: response.status() });
    });
    await current.goto(`${site}/login`, { waitUntil: 'domcontentloaded' });
    await current.getByLabel('E-mail').fill(`${id}@aja.local.test`);
    await current.getByRole('textbox', { name: 'Senha' }).fill(`AjaLocal-${id}-2031!`);
    await current.getByRole('button', { name: 'Entrar' }).click();
    await current.waitForFunction(() => location.pathname.startsWith('/perfil'), null, { timeout: 15000 });
    actors[id] = { context, page: current };
  }
  const routes = [
    { path: '/', actor: 'student' },
    { path: '/login', actor: null },
    { path: '/cadastro', actor: null },
    { path: '/recuperar-senha', actor: null },
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
  const results = [];
  for (const item of routes) {
    let current;
    let anonymousContext;
    if (item.actor) current = actors[item.actor].page;
    else {
      anonymousContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
      current = await anonymousContext.newPage();
    }
    const viewportResults = [];
    for (const width of [390, 768, 1440]) {
      await current.setViewportSize({ width, height: 1000 });
      const response = await current.goto(`${site}${item.path}`, { waitUntil: 'domcontentloaded' });
      await current.waitForSelector('main h1', { timeout: 15000 });
      const dom = await current.evaluate(() => ({ heading: document.querySelector('main h1')?.innerText || '', mainText: document.querySelector('main')?.innerText || '', width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      if (response.status() !== 200 || !dom.heading || dom.scrollWidth > dom.width) throw new Error(`${item.path} at ${width}px failed: ${JSON.stringify({ status: response.status(), dom })}`);
      await current.keyboard.press('Tab');
      const focus = await current.evaluate(() => {
        const active = document.activeElement;
        const rect = active?.getBoundingClientRect();
        return { tag: active?.tagName || '', label: active?.getAttribute('aria-label') || active?.textContent?.trim().slice(0, 80) || '', visible: Boolean(rect && rect.width && rect.height && rect.bottom > 0 && rect.top < innerHeight) };
      });
      if (!focus.visible || focus.tag === 'BODY') throw new Error(`${item.path} keyboard focus failed at ${width}px: ${JSON.stringify(focus)}`);
      await current.reload({ waitUntil: 'domcontentloaded' });
      await current.waitForSelector('main h1', { timeout: 15000 });
      const afterReload = await current.locator('main h1').innerText();
      if (afterReload !== dom.heading) throw new Error(`${item.path} reload heading changed at ${width}px`);
      viewportResults.push({ width, staticHttp: response.status(), heading: dom.heading, horizontalOverflow: false, keyboardFocus: focus, reloadHeading: afterReload });
    }
    results.push({ route: item.path, actor: item.actor || 'public', viewportResults });
    if (anonymousContext) await anonymousContext.close();
  }
  for (const id of ['admin', 'teacher-a', 'student']) await actors[id].context.close();
  return { result: 'PASS', staticExport: site, isolatedAccounts: ['admin', 'teacher-a', 'student'], routeCount: results.length, routes: results, realApiOutcomes: apiResponses };
}

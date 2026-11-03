async page => {
  const site = 'http://127.0.0.1:3001';
  const api = 'http://127.0.0.1:3203/api/v1';
  const browser = page.context().browser();
  const actors = {
    admin: { role: 'admin', id: 'admin' },
    teacherAssigned: { role: 'teacher', id: 'teacher-a' },
    teacherUnassigned: { role: 'teacher', id: 'teacher-unassigned' },
    studentEnrolled: { role: 'student', id: 'student' },
    studentOther: { role: 'student', id: 'student-two' },
    studentUnassigned: { role: 'student', id: 'student-empty' },
    public: { role: 'public', id: null }
  };
  const scenarios = [
    { route: '/perfil', probe: '/me', probeRoles: ['admin', 'teacher', 'student'] },
    { route: '/usuarios', probe: '/users', probeRoles: ['admin'] },
    { route: '/turmas', probe: '/classes', probeRoles: ['admin', 'teacher', 'student'] },
    { route: '/alunos?turma=c1', probe: '/students', probeRoles: ['admin', 'teacher'] },
    { route: '/alunos/perfil?id=student', probe: '/students/student', probeRoles: ['admin', 'teacher'], scopeDenied: ['teacherUnassigned'] },
    { route: '/disciplinas?turma=c1', probe: '/subjects', probeRoles: ['admin', 'teacher', 'student'] },
    { route: '/disciplinas/detalhes?id=s1&aba=materiais', probe: '/subjects/s1', probeRoles: ['admin', 'teacher', 'student'], scopeDenied: ['teacherUnassigned', 'studentUnassigned'] },
    { route: '/materiais?id=material-text', probe: '/materials/material-text', probeRoles: ['admin', 'teacher', 'student'], scopeDenied: ['teacherUnassigned', 'studentUnassigned'] },
    { route: '/questoes?id=q1', probe: '/questions/q1', probeRoles: ['admin', 'teacher', 'student'] },
    { route: '/questionarios', probe: '/assessments', probeRoles: ['admin', 'teacher', 'student'] },
    { route: '/questionarios/criar?id=quiz-draft', probe: '/assessments/quiz-draft', probeRoles: ['admin', 'teacher', 'student'], scopeDenied: ['teacherUnassigned', 'studentEnrolled', 'studentOther', 'studentUnassigned'] },
    { route: '/questionarios/responder?id=quiz-open', probe: '/assessments/quiz-open', probeRoles: ['admin', 'teacher', 'student'], scopeDenied: ['teacherUnassigned', 'studentUnassigned'] },
    { route: '/questionarios/resultado?id=attempt-sent', probe: '/attempts/attempt-sent/result', probeRoles: ['admin', 'teacher', 'student'], scopeDenied: ['teacherUnassigned', 'studentOther', 'studentUnassigned'] },
    { route: '/avisos', probe: '/announcements', probeRoles: ['admin', 'teacher', 'student'] },
    { route: '/calendario', probe: '/calendar?from=2026-11-01&to=2026-11-30', probeRoles: ['admin', 'teacher', 'student'] },
    { route: '/forum?disciplina=s1&questao=q2&material=material-text', probe: '/topics', probeRoles: ['admin', 'teacher', 'student'] },
    { route: '/forum/topico?id=topic1', probe: '/topics/topic1', probeRoles: ['admin', 'teacher', 'student'], scopeDenied: ['teacherUnassigned', 'studentUnassigned'] },
    { route: '/frequencia?disciplina=s1', probe: '/attendance/eligible?subjectId=s1&date=2026-11-03&time=19:00', probeRoles: ['admin', 'teacher'], scopeDenied: ['teacherUnassigned'] },
    { route: '/', probe: '/me/dashboard', probeRoles: ['admin', 'teacher', 'student'] }
  ];
  const credential = actorId => [`${actorId}@aja.local.test`, actorId === 'student-empty' ? 'AjaLocal-reset-2031!' : `AjaLocal-${actorId}-2031!`];
  const rows = [];
  for (const scenario of scenarios.slice(0, 4)) {
    for (const [actorKey, actor] of Object.entries(actors)) {
      console.log(`route-role case start: ${scenario.route} actor=${actorKey}`);
      const allowed = actor.id !== null && scenario.probeRoles.includes(actor.role) && !(scenario.scopeDenied ?? []).includes(actorKey);
      const context = await browser.newContext();
      let loginPage;
      if (actor.id) {
        loginPage = await context.newPage();
        const [email, password] = credential(actor.id);
        await loginPage.goto(`${site}/login`);
        await loginPage.getByLabel('E-mail').fill(email);
        await loginPage.getByRole('textbox', { name: 'Senha' }).fill(password);
        await loginPage.getByRole('button', { name: 'Entrar' }).click();
        await loginPage.waitForFunction(() => location.pathname.replace(/\/$/, '') === '/perfil', null, { timeout: 12000 }).catch(async () => {
          const visible = await loginPage.locator('main').innerText().catch(() => '');
          throw new Error(`fresh login failed for ${actorKey}; url=${loginPage.url()}; ${visible.slice(0, 180)}`);
        });
        await loginPage.close();
      }
      const widths = [];
      for (const width of [390, 768, 1440]) {
        const current = await context.newPage();
        await current.setViewportSize({ width, height: 900 });
        const pageResponses = [];
        current.on('response', response => {
          const url = new URL(response.url());
          if (url.pathname.startsWith('/api/v1/')) pageResponses.push({ method: response.request().method(), path: url.pathname, status: response.status() });
        });
        const onlineResponse = await current.goto(`${site}${scenario.route}`, { waitUntil: 'domcontentloaded' });
        await current.locator('main h1:visible, main h2:visible').first().waitFor({ timeout: 8000 }).catch(() => {});
        let onlineDom = await current.evaluate(() => ({ heading: [...document.querySelectorAll('main h1, main h2')].find(node => node.getClientRects().length)?.innerText || '', text: document.querySelector('main')?.innerText || '', width: innerWidth, documentWidth: document.documentElement.scrollWidth }));
        const probe = await current.evaluate(async path => {
          const response = await fetch(`http://127.0.0.1:3203/api/v1${path}`, { credentials: 'include' });
          let body = null;
          try { body = await response.json(); } catch {}
          return { status: response.status, count: Array.isArray(body) ? body.length : null, hasData: body !== null && !Array.isArray(body) };
        }, scenario.probe);
        await current.waitForFunction(() => !/Carregando/i.test(document.querySelector('main')?.innerText || ''), null, { timeout: 1500 }).catch(() => {});
        onlineDom = await current.evaluate(() => ({ heading: [...document.querySelectorAll('main h1, main h2')].find(node => node.getClientRects().length)?.innerText || '', text: document.querySelector('main')?.innerText || '', width: innerWidth, documentWidth: document.documentElement.scrollWidth }));
        const expected = allowed ? probe.status >= 200 && probe.status < 300 : [401, 403, 404].includes(probe.status);
        await context.route(`${api}/**`, route => {
          const url = new URL(route.request().url());
          return url.pathname === '/api/v1/auth/session' ? route.continue() : route.abort('failed');
        });
        const failedRequests = [];
        current.on('requestfailed', request => {
          if (new URL(request.url()).pathname.startsWith('/api/v1/')) failedRequests.push({ method: request.method(), path: new URL(request.url()).pathname, error: request.failure()?.errorText || 'request-failed' });
        });
        const offlineResponse = await current.goto(`${site}${scenario.route}`, { waitUntil: 'domcontentloaded' });
        await current.locator('main h1:visible, main h2:visible').first().waitFor({ timeout: 8000 }).catch(() => {});
        await current.waitForFunction(() => /Tentar novamente|N[aã]o conseguimos|Servi[cç]o indispon[ií]vel|sem permiss[aã]o|acesso negado|indispon[ií]vel/i.test(document.querySelector('main')?.innerText || ''), null, { timeout: 2500 }).catch(() => {});
        for (let tab = 0; tab < 5; tab++) {
          const tag = await current.evaluate(() => document.activeElement?.tagName || 'BODY');
          if (tag !== 'BODY') break;
          await current.keyboard.press('Tab');
        }
        const offlineDom = await current.evaluate(() => {
          const active = document.activeElement;
          const rect = active?.getBoundingClientRect();
          const text = document.querySelector('main')?.innerText || '';
          return { text, focusTag: active?.tagName || '', focusVisible: Boolean(active && active.tagName !== 'BODY' && rect && rect.width && rect.height && rect.bottom > 0 && rect.top < innerHeight), width: innerWidth, documentWidth: document.documentElement.scrollWidth };
        });
        const offlineReloadResponse = await current.reload({ waitUntil: 'domcontentloaded' });
        await current.locator('main').waitFor({ timeout: 8000 }).catch(() => {});
        const reloadDom = await current.evaluate(() => ({ text: document.querySelector('main')?.innerText || '', width: innerWidth, documentWidth: document.documentElement.scrollWidth }));
        const errorText = /N[aã]o conseguimos carregar esta p[aá]gina|Servi[cç]o indispon[ií]vel|Tentar novamente|indispon[ií]vel|sem permiss[aã]o|acesso negado|n[aã]o (foi|foi poss[ií]vel|conseguimos|pode).*(carregar|salvar|acessar|servi[cç]o)/i.test(offlineDom.text);
        const publicRedirect = actor.id === null && probe.status === 401 && /Entrar no AJA Digital/.test(onlineDom.heading);
        const guardedDenied = /Seu perfil n[aã]o permite|Acesso restrito|Acesso reservado à equipe|esta área está disponível para a equipe autorizada|esta tela está disponível para professores e administradores|frequência pode ser registrada apenas|sem permiss[aã]o|acesso negado/i.test(offlineDom.text) && /Seu perfil n[aã]o permite|Acesso restrito|Acesso reservado à equipe|esta área está disponível para a equipe autorizada|esta tela está disponível para professores e administradores|frequência pode ser registrada apenas|sem permiss[aã]o|acesso negado/i.test(onlineDom.text);
        const networkEvidence = failedRequests.length > 0 || publicRedirect || guardedDenied;
        const offlineStateValid = errorText || publicRedirect || guardedDenied;
        const failed = onlineResponse.status() !== 200 || !onlineDom.heading || onlineDom.documentWidth > width || !expected || offlineResponse.status() !== 200 || offlineReloadResponse.status() !== 200 || !networkEvidence || !offlineStateValid || !offlineDom.focusVisible || offlineDom.documentWidth > width || reloadDom.documentWidth > width;
        widths.push({ width, onlineStatus: onlineResponse.status(), onlineHeading: onlineDom.heading, onlineDomText: onlineDom.text.slice(0, 220), onlineResponseStatus: probe.status, onlineResponseCount: probe.count, pageApiResponses: pageResponses, expectation: allowed ? 'allowed 2xx' : 'forbidden 401/403/404', expectedOutcome: expected ? 'PASS' : 'FAIL', offlineStaticStatus: offlineResponse.status(), offlineReloadStatus: offlineReloadResponse.status(), offlineMessage: offlineDom.text.slice(0, 280), offlineErrorVisible: errorText, offlineOutcome: publicRedirect ? 'not applicable: route redirects to login after real session 401' : guardedDenied ? 'not applicable: route permission gate suppresses API; denial DOM persists (API GET status recorded separately)' : 'API offline state', focusTag: offlineDom.focusTag, focusVisible: offlineDom.focusVisible, offlineDocumentWidth: offlineDom.documentWidth, reloadDocumentWidth: reloadDom.documentWidth, networkFailures: failedRequests, outcome: failed ? 'FAIL' : 'PASS' });
        await context.unroute(`${api}/**`);
        await current.close();
      }
      const failedWidths = widths.filter(item => item.outcome !== 'PASS');
      rows.push({ route: scenario.route, actor: actorKey, role: actor.role, permission: allowed ? 'allowed' : 'forbidden', probe: `/api/v1${scenario.probe}`, widths, outcome: failedWidths.length ? 'FAIL' : 'PASS' });
      await context.close();
    }
  }

  const publicFailures = [];
  for (const item of [
    { mode: 'login', route: '/login', apiPath: '/auth/login', fields: { email: 'E-mail', password: 'Senha' }, submit: 'Entrar' },
    { mode: 'register', route: '/cadastro', apiPath: '/auth/register', fields: { name: 'Nome completo', email: 'E-mail', password: 'Senha' }, submit: 'Criar conta' },
    { mode: 'recover', route: '/recuperar-senha', apiPath: '/auth/password-reset-requests', fields: { email: 'E-mail' }, submit: 'Solicitar recuperação' }
  ]) {
    for (const width of [390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const current = await context.newPage();
      const aborted = [];
      current.on('requestfailed', request => { if (new URL(request.url()).pathname === `${api}${item.apiPath}` || new URL(request.url()).pathname === item.apiPath.replace('/auth', '/api/v1/auth')) aborted.push({ method: request.method(), error: request.failure()?.errorText || 'request-failed' }); });
      await current.goto(`${site}${item.route}`);
      await context.route(`${api}/**`, route => route.abort('failed'));
      if (item.fields.name) await current.getByLabel(item.fields.name).fill('Conta Local AJA18');
      await current.getByLabel(item.fields.email).fill(item.mode === 'recover' ? 'student@aja.local.test' : 'aja18-browser-offline@example.test');
      if (item.fields.password) await current.getByRole('textbox', { name: item.fields.password }).fill('LocalForm-Only-2031!');
      await current.getByRole('button', { name: item.submit }).click();
      await current.locator('main [role="alert"]').waitFor({ timeout: 12000 });
      await current.keyboard.press('Tab');
      const state = await current.evaluate(labels => {
        const main = document.querySelector('main');
        const active = document.activeElement;
        const rect = active?.getBoundingClientRect();
        return { error: main?.querySelector('[role="alert"]')?.innerText || '', emailPreserved: [...document.querySelectorAll('input[type="email"]')].some(input => input.value.length > 0), namePreserved: [...document.querySelectorAll('input')].some(input => input.value === 'Conta Local AJA18'), width: innerWidth, documentWidth: document.documentElement.scrollWidth, focusVisible: Boolean(rect && rect.width && rect.height && rect.bottom > 0 && rect.top < innerHeight) };
      });
      const passed = aborted.length > 0 && state.error.length > 0 && state.emailPreserved && (item.mode !== 'register' || state.namePreserved) && state.width === width && state.documentWidth <= width && state.focusVisible;
      publicFailures.push({ mode: item.mode, width, abortedRequest: aborted, errorVisible: Boolean(state.error), emailPreserved: state.emailPreserved, namePreserved: state.namePreserved ?? null, focusVisible: state.focusVisible, documentWidth: state.documentWidth, outcome: passed ? 'PASS' : 'FAIL' });
      await context.close();
    }
  }
  const failures = rows.filter(item => item.outcome !== 'PASS');
  const publicFailuresFailed = publicFailures.filter(item => item.outcome !== 'PASS');
  return { result: failures.length || publicFailuresFailed.length ? 'FAIL' : 'PASS', scenarioCount: rows.length, passed: rows.length - failures.length, failures, rows, publicFormFailureCount: publicFailures.length, publicFormFailuresFailed: publicFailuresFailed, publicFailures };
}

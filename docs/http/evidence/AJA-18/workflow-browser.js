async page => {
  const base = 'http://127.0.0.1:3203/api/v1';
  const site = 'http://127.0.0.1:3001';
  const browser = page.context().browser();
  const actors = {};
  const apiResponses = [];
  const routes = [];
  const credentials = {
    admin: ['admin@aja.local.test', 'AjaLocal-admin-2031!'],
    'teacher-unassigned': ['teacher-unassigned@aja.local.test', 'AjaLocal-teacher-unassigned-2031!'],
    'teacher-a': ['teacher-a@aja.local.test', 'AjaLocal-teacher-a-2031!'],
    'teacher-b': ['teacher-b@aja.local.test', 'AjaLocal-teacher-b-2031!'],
    'student-empty': ['student-empty@aja.local.test', 'AjaLocal-student-empty-2031!']
  };
  async function login(id) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const current = await context.newPage();
    current.on('response', response => {
      const url = new URL(response.url());
      if (url.pathname.startsWith('/api/v1/')) apiResponses.push({ actor: id, method: response.request().method(), path: url.pathname, status: response.status() });
    });
    await current.goto(`${site}/login`, { waitUntil: 'domcontentloaded' });
    const storage = await current.evaluate(() => ({ localStorage: localStorage.length, sessionStorage: sessionStorage.length }));
    if (storage.localStorage !== 0 || storage.sessionStorage !== 0) throw new Error(`${id} browser session did not start empty: ${JSON.stringify(storage)}`);
    await current.getByLabel('E-mail').fill(credentials[id][0]);
    await current.getByRole('textbox', { name: 'Senha' }).fill(credentials[id][1]);
    await current.getByRole('button', { name: 'Entrar' }).click();
    await current.waitForFunction(() => document.querySelector('main h1')?.innerText !== 'Entrar no AJA Digital', null, { timeout: 15000 });
    if (!apiResponses.some(item => item.actor === id && item.method === 'POST' && item.path === '/api/v1/auth/login' && item.status === 200)) throw new Error(`${id} login did not use a real API success response`);
    const actor = { context, page: current, storage };
    actors[id] = actor;
    return actor;
  }
  async function request(actor, route, method = 'GET', body) {
    const result = await actor.page.evaluate(async ({ base, route, method, body }) => {
      const idempotencyRequired = method === 'POST' && (/\/submit$|\/publish-feedback$|^\/assessments\/[^/]+\/publish$/.test(route) || ['/submissions', '/assessments'].includes(route));
      const response = await fetch(base + route, {
        method,
        credentials: 'include',
        headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(idempotencyRequired ? { 'Idempotency-Key': crypto.randomUUID() } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      let payload;
      try { payload = await response.json(); } catch { payload = null; }
      return { status: response.status, payload };
    }, { base, route, method, body });
    apiResponses.push({ actor: actor.page.url(), method, path: `/api/v1${route.split('?')[0]}`, status: result.status });
    return result;
  }
  async function visit(actor, id, route) {
    const response = await actor.page.goto(`${site}${route}`, { waitUntil: 'domcontentloaded' });
    try { await actor.page.waitForSelector('main h1', { timeout: 10000 }); }
    catch (error) {
      const diagnostic = await actor.page.evaluate(() => ({ url: location.href, title: document.title, body: document.body.innerText.slice(0, 400) }));
      throw new Error(`${id} route ${route} rendered no main heading (HTTP ${response?.status()}): ${JSON.stringify(diagnostic)}; ${error.message}`);
    }
    await actor.page.waitForTimeout(450);
    const state = await actor.page.evaluate(() => ({
      heading: document.querySelector('main h1')?.innerText?.trim() || '',
      text: document.querySelector('main')?.innerText || '',
      overflow: document.documentElement.scrollWidth > window.innerWidth
    }));
    if (response?.status() !== 200 || !state.heading) throw new Error(`${id} ${route} did not render: ${JSON.stringify({ http: response?.status(), heading: state.heading })}`);
    routes.push({ actor: id, route, http: response.status(), heading: state.heading, overflow: state.overflow });
    return state;
  }

  const admin = await login('admin');
  await admin.page.goto(`${site}/alunos?turma=c1`, { waitUntil: 'domcontentloaded' });
  await admin.page.getByRole('button', { name: 'Adicionar aluno por e-mail' }).click();
  await admin.page.getByRole('textbox', { name: 'E-mail do aluno' }).fill('student-empty@aja.local.test');
  await admin.page.getByRole('button', { name: 'Conferir inclusão' }).click();
  await admin.page.getByText('Caio Sem Turma · Conta existente').waitFor({ state: 'visible' });
  await admin.page.getByRole('button', { name: 'Confirmar inclusão' }).click();
  await admin.page.getByText('Situação da matrícula registrada. Confira o vínculo na lista.').waitFor({ state: 'visible' });
  if (!apiResponses.some(item => item.actor === 'admin' && item.method === 'POST' && item.path === '/api/v1/enrollments' && item.status === 201)) throw new Error('admin enrollment was not committed by the API');

  await admin.page.goto(`${site}/disciplinas`, { waitUntil: 'domcontentloaded' });
  await admin.page.getByRole('button', { name: 'Editar Matemática', exact: true }).click();
  await admin.page.getByRole('checkbox', { name: 'Celina Docência' }).check();
  await admin.page.getByRole('button', { name: 'Salvar disciplina' }).click();
  await admin.page.getByText(/Equipe docente:.*Celina Docência/).waitFor({ state: 'visible' });
  if (!apiResponses.some(item => item.actor === 'admin' && item.method === 'PATCH' && item.path === '/api/v1/subjects/s1' && item.status === 200)) throw new Error('admin teacher assignment was not committed by the API');

  const teacher = await login('teacher-unassigned');
  await visit(teacher, 'teacher-unassigned', '/disciplinas/detalhes?id=s1&aba=materiais#module-m1');
  await teacher.page.getByRole('button', { name: 'Enviar materiais' }).click();
  await teacher.page.locator('input[type="file"]').last().setInputFiles('C:/Users/joaov/aja-digital-frontend/server/fixtures/proporcoes.pdf');
  await teacher.page.getByRole('button', { name: 'Publicar material' }).click();
  await teacher.page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 15000 });
  const publishedMaterials = await request(teacher, '/materials?subjectId=s1&page=1&pageSize=100');
  if (publishedMaterials.status !== 200) throw new Error(`teacher material list returned ${publishedMaterials.status}`);
  const material = publishedMaterials.payload.items.find(item => item.author?.id === 'teacher-unassigned' && item.file?.name === 'proporcoes.pdf');
  if (!material) throw new Error('published PDF from the assigned teacher is absent from the real material projection');
  if (!apiResponses.some(item => item.actor === 'teacher-unassigned' && item.method === 'POST' && item.path === '/api/v1/files' && item.status === 201)) throw new Error('real file upload response was not observed');
  if (!apiResponses.some(item => item.actor === 'teacher-unassigned' && item.method === 'POST' && item.path === '/api/v1/materials/batch' && item.status === 201)) throw new Error('real material publication response was not observed');

  const activityTitle = 'AJA-18 — atividade de retorno pela interface';
  await teacher.page.goto(`${site}/questionarios/criar?modulo=m1`, { waitUntil: 'domcontentloaded' });
  await teacher.page.getByRole('heading', { name: 'Criar atividade' }).waitFor({ state: 'visible' });
  await teacher.page.getByLabel('Tipo de atividade').selectOption('work');
  await teacher.page.getByRole('checkbox', { name: 'Permitir nota opcional' }).check();
  await teacher.page.getByLabel('Nota máxima').fill('10');
  await teacher.page.getByLabel('Título').fill(activityTitle);
  await teacher.page.getByLabel('Orientações').fill('Envie uma análise pelo link e confira o retorno publicado.');
  await teacher.page.getByRole('button', { name: 'Revisar publicação' }).click();
  await teacher.page.getByRole('dialog').getByText(activityTitle).waitFor({ state: 'visible' });
  const activityCreatedResponse = teacher.page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/assessments' && response.request().method() === 'POST' && response.status() === 201);
  await teacher.page.getByRole('dialog').getByRole('button', { name: 'Publicar atividade' }).click();
  const activityCreated = await activityCreatedResponse;
  const activityId = (await activityCreated.json()).id;
  await teacher.page.getByRole('heading', { name: 'Atividades' }).waitFor({ state: 'visible', timeout: 15000 });
  if (!activityId) throw new Error('assessment create UI did not produce a real 201 response ID');
  if (!apiResponses.some(item => item.actor === 'teacher-unassigned' && item.method === 'POST' && item.path === '/api/v1/assessments' && item.status === 201)) throw new Error('assessment was not created by the teacher UI');
  if (!apiResponses.some(item => item.actor === 'teacher-unassigned' && item.method === 'POST' && item.path === `/api/v1/assessments/${activityId}/publish` && item.status === 200)) throw new Error('assessment was not published by the teacher UI');

  const student = await login('student-empty');
  const materialScreen = await visit(student, 'student-empty', `/materiais?id=${material.id}`);
  if (!materialScreen.text.includes('proporcoes.pdf')) throw new Error('student cannot see the material metadata in the loaded UI');
  await visit(student, 'student-empty', `/questionarios/responder?id=${activityId}`);
  await student.page.getByLabel('Link do trabalho').fill('https://example.test/aja18-resposta');
  await student.page.getByRole('button', { name: 'Adicionar link' }).click();
  await student.page.getByRole('link', { name: 'https://example.test/aja18-resposta' }).waitFor({ state: 'visible' });
  await student.page.getByRole('button', { name: 'Conferir e enviar' }).click();
  await student.page.getByRole('dialog', { name: 'Confirmar entrega única' }).waitFor({ state: 'visible' });
  const submissionCreatedResponse = student.page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/submissions' && response.request().method() === 'POST' && response.status() === 201);
  await student.page.getByRole('dialog').getByRole('button', { name: 'Confirmar envio único' }).click();
  const submissionCreated = await submissionCreatedResponse;
  const submissionId = (await submissionCreated.json()).id;
  await student.page.getByRole('heading', { name: 'Comprovante de entrega' }).waitFor({ state: 'visible', timeout: 15000 });
  if (!submissionId) throw new Error('student submission UI did not produce a real 201 response ID');
  if (!apiResponses.some(item => item.actor === 'student-empty' && item.method === 'POST' && item.path === `/api/v1/submissions/${submissionId}/submit` && item.status === 200)) throw new Error('student UI did not submit the work through the real API');
  const studentReceipt = await student.page.locator('main').innerText();
  if (!studentReceipt.includes('Comprovante') || !studentReceipt.includes('Entrega confirmada')) throw new Error('student UI did not render the durable receipt after submit');

  await teacher.page.goto(`${site}/questionarios/responder?id=${activityId}`, { waitUntil: 'domcontentloaded' });
  await teacher.page.getByRole('link', { name: /Consultar entrega de Caio/ }).click();
  await teacher.page.waitForURL(new RegExp(`entrega=${submissionId}`), { timeout: 10000 });
  await teacher.page.getByLabel('Comentário privado').fill('Retorno docente AJA-18 confirmado pela interface.');
  await teacher.page.getByLabel('Nota opcional (0 a 10)').fill('9');
  await teacher.page.getByRole('button', { name: 'Salvar rascunho de retorno' }).click();
  await teacher.page.getByText(/Rascunho privado/).waitFor({ state: 'visible', timeout: 10000 });
  if (!apiResponses.some(item => item.actor === 'teacher-unassigned' && item.method === 'PATCH' && item.path === `/api/v1/submissions/${submissionId}/feedback` && item.status === 200)) throw new Error('teacher UI did not save a real feedback draft');
  await teacher.page.getByRole('button', { name: 'Publicar retorno' }).click();
  await teacher.page.getByText('Feedback disponível', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
  if (!apiResponses.some(item => item.actor === 'teacher-unassigned' && item.method === 'POST' && item.path === `/api/v1/submissions/${submissionId}/publish-feedback` && item.status === 200)) throw new Error('teacher UI did not publish a real feedback response');
  const feedbackTeacherDom = await teacher.page.locator('main').innerText();
  if (!feedbackTeacherDom.includes('Retorno docente AJA-18 confirmado pela interface.') || !feedbackTeacherDom.includes('9 / 10')) throw new Error('teacher UI did not render the saved/published feedback fields');

  await student.page.goto(`${site}/questionarios/responder?id=${activityId}&entrega=${submissionId}`, { waitUntil: 'domcontentloaded' });
  await student.page.getByRole('heading', { name: 'Comprovante de entrega' }).waitFor({ state: 'visible', timeout: 10000 });
  const studentFeedbackDom = await student.page.locator('main').innerText();
  if (!studentFeedbackDom.includes('Comprovante') || !studentFeedbackDom.includes('Retorno docente AJA-18 confirmado pela interface.') || !studentFeedbackDom.includes('Nota: 9 / 10')) throw new Error('student DOM did not show receipt, published comment and grade');
  await student.page.reload({ waitUntil: 'domcontentloaded' });
  await student.page.getByRole('heading', { name: 'Comprovante de entrega' }).waitFor({ state: 'visible', timeout: 10000 });
  const studentReloadDom = await student.page.locator('main').innerText();
  if (!studentReloadDom.includes('Comprovante') || !studentReloadDom.includes('Retorno docente AJA-18 confirmado pela interface.') || !studentReloadDom.includes('Nota: 9 / 10')) throw new Error('student DOM after reload lost receipt or published feedback');

  for (const [actor, id, route] of [
    [admin, 'admin', '/usuarios'], [admin, 'admin', '/turmas'], [admin, 'admin', '/alunos/perfil?id=student-empty'],
    [teacher, 'teacher-unassigned', '/avisos'], [teacher, 'teacher-unassigned', '/calendario'], [teacher, 'teacher-unassigned', '/forum?disciplina=s1&questao=q2&material=material-text'], [teacher, 'teacher-unassigned', '/frequencia?disciplina=s1'],
    [student, 'student-empty', '/forum?disciplina=s1&questao=q2&material=material-text'], [student, 'student-empty', '/calendario']
  ]) await visit(actor, id, route);

  const attendanceDenied = await request(student, '/attendance?subjectId=s1&from=2020-01-01&to=2040-01-01');
  if (attendanceDenied.status !== 403) throw new Error(`student attendance denial returned ${attendanceDenied.status}, expected 403`);
  await student.page.goto(`${site}/frequencia?disciplina=s1`, { waitUntil: 'domcontentloaded' });
  await student.page.getByText('Esta tela está disponível para professores e administradores.').waitFor({ state: 'visible' });
  routes.push({ actor: 'student-empty', route: '/frequencia?disciplina=s1', http: 200, heading: null, denied: 'Esta tela está disponível para professores e administradores.' });

  for (const width of [390, 768, 1440]) {
    await student.page.setViewportSize({ width, height: 900 });
    await visit(student, 'student-empty', '/forum/topico?id=topic1');
    const view = await student.page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    if (view.scrollWidth > view.width) throw new Error(`horizontal overflow at ${width}px: ${JSON.stringify(view)}`);
  }

  const recovery = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const recoveryPage = await recovery.newPage();
  recoveryPage.on('response', response => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/v1/')) apiResponses.push({ actor: 'public-recovery', method: response.request().method(), path: url.pathname, status: response.status() });
  });
  await recoveryPage.goto(`${site}/recuperar-senha`, { waitUntil: 'domcontentloaded' });
  await recoveryPage.getByLabel('E-mail').fill('student-empty@aja.local.test');
  await recoveryPage.getByRole('button', { name: /Solicitar|Enviar|Continuar/i }).click();
  await recoveryPage.waitForTimeout(500);
  if (!apiResponses.some(item => item.actor === 'public-recovery' && item.method === 'POST' && item.path === '/api/v1/auth/password-reset-requests' && item.status === 202)) throw new Error('browser password-recovery request did not receive the real 202 response');
  const recoveryText = await recoveryPage.locator('main').innerText();
  if (!/instru|e-mail|mensagem/i.test(recoveryText)) throw new Error(`password recovery did not show a PT-BR confirmation: ${recoveryText}`);

  for (const actor of Object.values(actors)) await actor.context.close();
  await recovery.close();
  return { result: 'PASS', staticPreview: site, api: base, newStorageSessions: Object.fromEntries(Object.entries(actors).map(([id, actor]) => [id, actor.storage])), enrollmentTeacherAssignment: 'admin UI actions; HTTP 201/200 observed', material: { id: material.id, title: material.title, upload: 201, batchPublish: 201 }, activity: { id: activityId, create: 201, publish: 200, routeHeading: activityTitle }, submission: { id: submissionId, submit: 200, receipt: studentReceipt, feedbackDraft: 200, feedbackPublish: 200, teacherDOM: feedbackTeacherDom, studentDOM: studentFeedbackDom, studentReloadDOM: studentReloadDom }, passwordRecovery: { status: 202, confirmation: recoveryText }, routes, responsiveWidths: [390, 768, 1440], apiResponses };
}

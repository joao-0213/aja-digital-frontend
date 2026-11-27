async page => {
  const browser = page.context().browser();
  const teacherContext = await browser.newContext({ timezoneId: 'America/Sao_Paulo' });
  const teacherPage = await teacherContext.newPage();
  const studentContext = await browser.newContext({ timezoneId: 'America/Sao_Paulo' });
  const studentPage = await studentContext.newPage();
  const responses = [];
  for (const [current, role] of [[teacherPage, 'teacher'], [studentPage, 'student']]) {
    current.on('response', response => {
      const url = new URL(response.url());
      if (url.pathname.startsWith('/api/v1/')) responses.push({ role, status: response.status(), method: response.request().method(), path: url.pathname });
    });
  }
  const login = async (current, account) => {
    await current.goto('http://127.0.0.1:3000/login');
    await current.getByLabel('E-mail').fill(`${account}@aja.local.test`);
    await current.getByRole('textbox', { name: 'Senha' }).fill(`AjaLocal-${account}-2031!`);
    await current.getByRole('button', { name: 'Entrar' }).click();
    await current.waitForURL(url => url.pathname.replace(/\/$/, '') === '/perfil');
  };
  const openDashboardBySpa = async current => {
    if (current.url().replace(/\/$/, '').endsWith('/perfil') === false) {
      await current.goto('http://127.0.0.1:3000/perfil');
      await current.waitForURL(url => url.pathname.replace(/\/$/, '') === '/perfil');
    }
    const timeOrigin = await current.evaluate(() => performance.timeOrigin);
    const response = current.waitForResponse(item => item.url().endsWith('/api/v1/me/dashboard') && item.status() === 200);
    await current.getByRole('link', { name: 'Meu painel' }).click();
    await current.waitForURL(url => url.pathname === '/' || url.pathname === '');
    await current.getByRole('heading', { name: /Meu painel|Sala dos professores/ }).waitFor();
    const dashboardResponse = await response;
    const payload = await dashboardResponse.json();
    const spaPreservedDocument = await current.evaluate(previous => performance.timeOrigin === previous, timeOrigin);
    if (!spaPreservedDocument) throw new Error('A transicao /perfil -> Meu painel recarregou o documento em vez de navegar pelo shell SPA.');
    return { payload, status: dashboardResponse.status(), spaPreservedDocument };
  };
  const expectedDateParts = date => {
    const value = new Date(`${date}T12:00:00-03:00`);
    return {
      day: new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit' }).format(value),
      month: new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', month: 'short' }).format(value)
    };
  };
  const assertNoticeInAgenda = async (current, selector, notice) => {
    const section = current.locator(selector);
    await section.waitFor();
    const link = section.locator(`a[href*="#aviso-${notice.id}"]`);
    if (await link.count() !== 1) throw new Error(`Aviso ${notice.id} nao esta como evento dentro de ${selector}.`);
    const text = (await link.innerText()).replace(/\s+/g, ' ').trim();
    const href = await link.getAttribute('href');
    const parts = expectedDateParts(notice.occurrence.date);
    if (!text.includes(notice.title) || !text.includes(parts.day) || !text.includes(parts.month) || !text.includes(notice.occurrence.time)) {
      throw new Error(`Card de acontecimento incompleto em ${selector}: ${text}`);
    }
    if (!href?.startsWith('/avisos') || !href.includes(`#aviso-${notice.id}`)) throw new Error(`Link de evento incorreto em ${selector}: ${href}`);
    return { text, href };
  };
  const assertAssessmentInAgenda = async (current, assessment) => {
    const section = current.locator('section[aria-labelledby="student-events"]');
    await section.waitFor();
    const link = section.locator(`a[href*="id=${assessment.sourceId}"]`);
    if (await link.count() !== 1) throw new Error(`Atividade ${assessment.sourceId} nao esta como evento dentro da agenda do aluno.`);
    const text = (await link.innerText()).replace(/\s+/g, ' ').trim();
    const href = await link.getAttribute('href');
    const parts = expectedDateParts(assessment.date);
    if (!text.includes(assessment.title) || !text.includes(parts.day) || !text.includes(parts.month) || !text.includes(assessment.time ?? '')) {
      throw new Error(`Card de prazo incompleto na agenda do aluno: ${text}`);
    }
    if (!href?.includes('/questionarios/responder') || !href.includes(`id=${assessment.sourceId}`)) throw new Error(`Link da atividade incorreto na agenda: ${href}`);
    return { text, href };
  };
  const clickNoticeAndAssertDestination = async (current, notice) => {
    const section = current.locator(current === studentPage ? 'section[aria-labelledby="student-events"]' : 'section[aria-labelledby="events-title"]');
    const link = section.locator(`a[href*="#aviso-${notice.id}"]`);
    const announcementRead = current.waitForResponse(response => response.request().method() === 'GET' && response.url().includes('/api/v1/announcements') && response.status() === 200);
    await link.click();
    await current.waitForURL(url => url.pathname.replace(/\/$/, '') === '/avisos' && url.hash === `#aviso-${notice.id}`);
    await announcementRead;
    await current.locator(`#aviso-${notice.id}`).getByRole('heading', { name: notice.title }).waitFor();
    return { url: current.url(), contentVisible: true };
  };

  await login(teacherPage, 'teacher-a');
  const title = `AJA-13 agenda ${Date.now()}`;
  const dateValue = new Date();
  dateValue.setDate(dateValue.getDate() + 2);
  const occurrenceDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(dateValue);
  await teacherPage.goto('http://127.0.0.1:3000/avisos');
  await teacherPage.getByRole('button', { name: 'Publicar aviso' }).click();
  const composer = teacherPage.getByRole('dialog', { name: 'Publicar aviso' });
  await composer.getByLabel('Turma').selectOption('c1');
  await composer.getByLabel('Disciplina').selectOption('s1');
  await composer.getByLabel('Título').fill(title);
  await composer.getByLabel('Mensagem').fill('Acontecimento ficticio para validar o link no painel.');
  await composer.getByLabel('Adicionar ao calendário').check();
  await composer.getByLabel('Data do acontecimento').fill(occurrenceDate);
  await composer.getByLabel('Horário do acontecimento').fill('18:30');
  const publishResponse = teacherPage.waitForResponse(response => response.url().endsWith('/api/v1/announcements') && response.request().method() === 'POST');
  await composer.getByRole('button', { name: 'Publicar aviso', exact: true }).click();
  const published = await publishResponse;
  if (published.status() !== 201) throw new Error(`Publicacao HTTP inesperada: ${published.status()}`);
  const notice = await published.json();
  await teacherPage.goto('http://127.0.0.1:3000/perfil');
  await teacherPage.waitForURL(url => url.pathname.replace(/\/$/, '') === '/perfil');
  const staffLoad = await openDashboardBySpa(teacherPage);
  const staffNotice = staffLoad.payload.upcoming.find(item => item.source === 'announcement' && item.sourceId === notice.id);
  if (!staffNotice) throw new Error('API do painel docente nao projetou o acontecimento publicado.');
  const staffAfterLoad = await assertNoticeInAgenda(teacherPage, 'section[aria-labelledby="events-title"]', notice);
  const staffReload = teacherPage.waitForResponse(response => response.url().endsWith('/api/v1/me/dashboard') && response.status() === 200);
  await teacherPage.reload();
  await teacherPage.getByRole('heading', { name: 'Sala dos professores' }).waitFor();
  const staffReloadPayload = await (await staffReload).json();
  if (!staffReloadPayload.upcoming.some(item => item.source === 'announcement' && item.sourceId === notice.id)) throw new Error('Acontecimento sumiu da projecao docente apos reload.');
  const staffAfterReload = await assertNoticeInAgenda(teacherPage, 'section[aria-labelledby="events-title"]', notice);
  const staffDestination = await clickNoticeAndAssertDestination(teacherPage, notice);

  await login(studentPage, 'student');
  const studentLoad = await openDashboardBySpa(studentPage);
  const studentNotice = studentLoad.payload.upcoming.find(item => item.source === 'announcement' && item.sourceId === notice.id);
  const assessmentEvent = studentLoad.payload.upcoming.find(item => item.source === 'assessment' && item.sourceId === 'aja13-agenda-assessment');
  if (!studentNotice) throw new Error('API do painel do aluno nao projetou o acontecimento publicado.');
  if (!assessmentEvent) throw new Error('A agenda do aluno nao projetou a atividade futura atribuida aja13-agenda-assessment.');
  const studentAgenda = studentPage.locator('section[aria-labelledby="student-events"]');
  const studentAfterLoad = await assertNoticeInAgenda(studentPage, 'section[aria-labelledby="student-events"]', notice);
  const studentAssessmentAfterLoad = await assertAssessmentInAgenda(studentPage, assessmentEvent);
  const assessmentLink = studentAgenda.locator(`a[href*="id=${assessmentEvent.sourceId}"]`);
  const assessmentRead = studentPage.waitForResponse(response => response.request().method() === 'GET' && response.url().includes('/api/v1/assessments') && response.status() === 200);
  await assessmentLink.click();
  await studentPage.waitForURL(url => url.pathname.replace(/\/$/, '') === '/questionarios/responder');
  await assessmentRead;
  await studentPage.getByText(assessmentEvent.title, { exact: true }).first().waitFor();
  const assessmentDestination = studentPage.url();

  await studentPage.goto('http://127.0.0.1:3000/perfil');
  await studentPage.waitForURL(url => url.pathname.replace(/\/$/, '') === '/perfil');
  const studentPanelReload = studentPage.waitForResponse(response => response.url().endsWith('/api/v1/me/dashboard') && response.status() === 200);
  await studentPage.getByRole('link', { name: 'Meu painel' }).click();
  await studentPage.waitForURL(url => url.pathname === '/' || url.pathname === '');
  await studentPage.getByRole('heading', { name: 'Meu painel' }).waitFor();
  await studentPanelReload;
  const studentDashboardReload = studentPage.waitForResponse(response => response.url().endsWith('/api/v1/me/dashboard') && response.status() === 200);
  await studentPage.reload();
  await studentPage.getByRole('heading', { name: 'Meu painel' }).waitFor();
  const studentReloadPayload = await (await studentDashboardReload).json();
  if (!studentReloadPayload.upcoming.some(item => item.source === 'announcement' && item.sourceId === notice.id) || !studentReloadPayload.upcoming.some(item => item.source === 'assessment' && item.sourceId === 'aja13-agenda-assessment')) throw new Error('Aviso ou atividade sumiu da projecao do aluno apos reload.');
  const studentAfterReload = await assertNoticeInAgenda(studentPage, 'section[aria-labelledby="student-events"]', notice);
  const studentAssessmentAfterReload = await assertAssessmentInAgenda(studentPage, assessmentEvent);
  const studentDestination = await clickNoticeAndAssertDestination(studentPage, notice);

  const result = {
    notice: { id: notice.id, title: notice.title, date: occurrenceDate, time: '18:30', publishedStatus: published.status() },
    navigation: { teacher: staffLoad.spaPreservedDocument, student: studentLoad.spaPreservedDocument, route: '/perfil -> Meu painel' },
    staffAgendaAfterLoad: staffAfterLoad,
    staffAgendaAfterReload: staffAfterReload,
    studentAgendaAfterLoad: studentAfterLoad,
    studentAgendaAfterReload: studentAfterReload,
    studentAssessmentAfterLoad: studentAssessmentAfterLoad,
    studentAssessmentAfterReload: studentAssessmentAfterReload,
    studentAssessmentDestination: assessmentDestination,
    destinations: { teacher: staffDestination, student: studentDestination },
    responses
  };
  await teacherContext.close();
  await studentContext.close();
  return result;
}

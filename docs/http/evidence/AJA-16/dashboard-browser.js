async page => {
  const browser = page.context().browser();
  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  const observed = [];
  for (const current of [page, studentPage]) {
    current.on('response', response => {
      const url = response.url();
      if (url.includes('/api/v1/me/dashboard') || url.includes('/api/v1/announcements')) observed.push({ status: response.status(), path: new URL(url).pathname, method: response.request().method() });
    });
  }

  const login = async (current, account) => {
    await current.goto('http://127.0.0.1:3000/login');
    await current.getByLabel('E-mail').fill(`${account}@aja.local.test`);
    await current.getByRole('textbox', { name: 'Senha' }).fill(`AjaLocal-${account}-2031!`);
    await current.getByRole('button', { name: 'Entrar' }).click();
    await current.waitForURL(url => url.pathname.replace(/\/$/, '') === '/perfil', { timeout: 10000 });
  };
  await login(page, 'teacher-a');
  const title = `AJA-16 painel ${Date.now()}`;
  const day = new Date();
  day.setDate(day.getDate() + 2);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(day);
  await page.goto('http://127.0.0.1:3000/avisos');
  await page.getByRole('button', { name: 'Publicar aviso' }).click();
  const composer = page.getByRole('dialog', { name: 'Publicar aviso' });
  await composer.getByLabel('Turma').selectOption('c1');
  await composer.getByLabel('Disciplina').selectOption('s1');
  await composer.getByLabel('Título').fill(title);
  await composer.getByLabel('Mensagem').fill('Aviso fictício criado para conferir o painel e o destino do link.');
  await composer.getByLabel('Adicionar ao calendário').check();
  await composer.getByLabel('Data do acontecimento').fill(date);
  await composer.getByLabel('Horário do acontecimento').fill('18:30');
  const publishResponse = page.waitForResponse(response => response.url().endsWith('/api/v1/announcements') && response.request().method() === 'POST');
  await composer.getByRole('button', { name: 'Publicar aviso', exact: true }).click();
  const published = await publishResponse;
  if (published.status() !== 201) throw new Error(`Publicação HTTP inesperada: ${published.status()}`);
  const notice = await published.json();
  await page.goto('http://127.0.0.1:3000/');
  await page.getByRole('heading', { name: 'Sala dos professores' }).waitFor();
  await page.getByText(title, { exact: true }).first().waitFor();
  const targetSelector = `a[href*="#aviso-${notice.id}"]`;
  const staffUpcomingLink = page.locator(targetSelector).first();
  await staffUpcomingLink.waitFor();
  const staffUpcomingHref = await staffUpcomingLink.getAttribute('href');

  await login(studentPage, 'student');
  const dashboardResponse = studentPage.waitForResponse(response => response.url().endsWith('/api/v1/me/dashboard') && response.status() === 200);
  await studentPage.goto('http://127.0.0.1:3000/');
  await studentPage.getByRole('heading', { name: 'Meu painel' }).waitFor();
  await studentPage.getByText(title, { exact: true }).first().waitFor();
  const studentDashboard = await dashboardResponse;
  const dashboardDto = await studentDashboard.json();
  if (!dashboardDto.assessments.length) throw new Error('O painel não projetou uma atividade pendente.');
  const activity = dashboardDto.assessments[0];
  await studentPage.locator(`a[href*="id=${activity.id}"]`).first().waitFor();
  const studentNoticeLink = studentPage.locator(targetSelector).first();
  await studentNoticeLink.waitFor();
  const noticeHref = await studentNoticeLink.getAttribute('href');
  const eventLink = studentPage.locator(targetSelector).last();
  await eventLink.waitFor();
  const eventCount = await studentPage.getByRole('heading', { name: 'Próximos encontros e prazos' }).count();
  await studentPage.locator(`a[href*="id=${activity.id}"]`).first().click();
  await studentPage.waitForURL(url => url.pathname.replace(/\/$/, '') === '/questionarios/responder');
  await studentPage.getByText(activity.title, { exact: true }).first().waitFor();
  const activityTarget = studentPage.url();
  await studentPage.goto('http://127.0.0.1:3000/');
  await studentPage.reload();
  await studentPage.getByText(title, { exact: true }).first().waitFor();
  await studentPage.locator(targetSelector).last().click();
  await studentPage.waitForURL(url => url.pathname.replace(/\/$/, '') === '/avisos' && url.hash === `#aviso-${notice.id}`);
  await studentPage.locator(`#aviso-${notice.id}`).getByRole('heading', { name: title }).waitFor();

  const emptyStudentContext = await browser.newContext();
  const emptyStudent = await emptyStudentContext.newPage();
  await login(emptyStudent, 'student-empty');
  const emptyStudentDashboard = emptyStudent.waitForResponse(response => response.url().endsWith('/api/v1/me/dashboard') && response.status() === 200);
  await emptyStudent.goto('http://127.0.0.1:3000/');
  await emptyStudent.getByRole('heading', { name: 'Nenhuma disciplina disponível' }).waitFor();
  const emptyStudentStatus = (await emptyStudentDashboard).status();

  const unassignedContext = await browser.newContext();
  const unassignedTeacher = await unassignedContext.newPage();
  await login(unassignedTeacher, 'teacher-unassigned');
  const unassignedDashboard = unassignedTeacher.waitForResponse(response => response.url().endsWith('/api/v1/me/dashboard') && response.status() === 200);
  await unassignedTeacher.goto('http://127.0.0.1:3000/');
  await unassignedTeacher.getByText('Nenhuma disciplina disponível para sua conta.', { exact: true }).waitFor();
  const unassignedStatus = (await unassignedDashboard).status();

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await login(adminPage, 'admin');
  const adminDashboard = adminPage.waitForResponse(response => response.url().endsWith('/api/v1/me/dashboard') && response.status() === 200);
  await adminPage.goto('http://127.0.0.1:3000/');
  await adminPage.getByRole('heading', { name: 'Painel da administração' }).waitFor();
  const adminStatus = (await adminDashboard).status();

  await page.goto('http://127.0.0.1:3000/avisos');
  let pauseDashboard;
  let releaseDashboard;
  const dashboardPaused = new Promise(resolve => { pauseDashboard = resolve; });
  const release = new Promise(resolve => { releaseDashboard = resolve; });
  let holdNextDashboard = true;
  await page.route('**/api/v1/me/dashboard', async route => {
    if (holdNextDashboard) {
      holdNextDashboard = false;
      pauseDashboard();
      await release;
    }
    await route.continue();
  });
  const teacherQuery = page.evaluate(async () => {
    const response = await fetch('http://127.0.0.1:3002/api/v1/me/dashboard', { credentials: 'include' });
    return { status: response.status, dashboard: await response.json() };
  });
  await dashboardPaused;
  const revoked = await adminPage.evaluate(async () => {
    const base = 'http://127.0.0.1:3002/api/v1';
    const listed = await fetch(`${base}/subjects?page=1&pageSize=100`, { credentials: 'include' });
    const page = await listed.json();
    const subject = page.items.find(item => item.id === 's1');
    const update = await fetch(`${base}/subjects/${subject.id}`, {
      method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId: subject.classId, name: subject.name, teacherIds: subject.teacherIds.filter(id => id !== 'teacher-a'), color: subject.color, icon: subject.icon, description: subject.description, expectedRevision: subject.revision })
    });
    return { listStatus: listed.status, updateStatus: update.status };
  });
  if (revoked.listStatus !== 200 || revoked.updateStatus !== 200) throw new Error(`Revogação administrativa falhou: ${JSON.stringify(revoked)}`);
  releaseDashboard();
  const revokedQuery = await teacherQuery;
  const revokedSubjectIds = revokedQuery.dashboard.subjects.map(subject => subject.id);
  if (revokedQuery.status !== 200 || revokedSubjectIds.includes('s1')) throw new Error(`A consulta liberada após a revogação ainda contém s1: ${JSON.stringify({ status: revokedQuery.status, revokedSubjectIds })}`);
  await page.unroute('**/api/v1/me/dashboard');
  const revokedDashboardResponse = page.waitForResponse(response => response.url().endsWith('/api/v1/me/dashboard') && response.status() === 200);
  await page.goto('http://127.0.0.1:3000/');
  await page.getByRole('heading', { name: 'Sala dos professores' }).waitFor();
  const revokedDashboard = await revokedDashboardResponse;
  const revokedProjection = await revokedDashboard.json();
  const removedSubjectCardCount = await page.locator('a[href*="id=s1"]').count();
  const latestTeacherDashboard = await page.evaluate(async () => {
    const response = await fetch('http://127.0.0.1:3002/api/v1/me/dashboard', { credentials: 'include' });
    return { status: response.status, subjectIds: (await response.json()).subjects.map(subject => subject.id) };
  });
  if (latestTeacherDashboard.status !== 200 || latestTeacherDashboard.subjectIds.includes('s1') || removedSubjectCardCount !== 0) throw new Error(`O painel reteve s1 depois da revogação. GET retido=${JSON.stringify(revokedSubjectIds)}; GET atual=${JSON.stringify(latestTeacherDashboard)}; cards=${removedSubjectCardCount}`);
  await studentPage.goto('http://127.0.0.1:3000/');
  await studentPage.reload();
  await studentPage.getByText(title, { exact: true }).first().waitFor();

  const result = {
    publishedStatus: published.status(),
    dashboardStatus: studentDashboard.status(),
    noticeId: notice.id,
    title,
    upcomingDate: date,
    staffUpcomingHref,
    studentNoticeHref: noticeHref,
    agendaHeadingPresent: eventCount === 1,
    pendingActivityTitle: activity.title,
    activityTarget,
    targetAfterReload: studentPage.url(),
    emptyStudentStatus,
    unassignedStatus,
    adminStatus,
    revokedDuringRequest: { ...revoked, queryStatus: revokedQuery.status },
    revokedDashboardStatus: revokedDashboard.status(),
    revokedSubjectIds,
    removedSubjectCardCount,
    responses: observed
  };
  await emptyStudentContext.close();
  await unassignedContext.close();
  await adminContext.close();
  await studentContext.close();
  return result;
}

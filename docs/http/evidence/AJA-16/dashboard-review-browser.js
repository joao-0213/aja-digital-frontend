async page => {
  const browser = page.context().browser();
  const teacherContext = await browser.newContext({ timezoneId: 'UTC' });
  const teacherPage = await teacherContext.newPage();
  const studentContext = await browser.newContext({ timezoneId: 'UTC' });
  const studentPage = await studentContext.newPage();
  const responses = [];
  for (const current of [teacherPage, studentPage]) {
    current.on('response', response => {
      if (response.url().endsWith('/api/v1/me/dashboard')) responses.push({ status: response.status(), role: current === teacherPage ? 'teacher' : 'student' });
    });
  }
  const login = async (current, account) => {
    await current.goto('http://127.0.0.1:3000/login');
    await current.getByLabel('E-mail').fill(`${account}@aja.local.test`);
    await current.getByRole('textbox', { name: 'Senha' }).fill(`AjaLocal-${account}-2031!`);
    await current.getByRole('button', { name: 'Entrar' }).click();
    await current.waitForURL(url => url.pathname.replace(/\/$/, '') === '/perfil');
  };

  await login(teacherPage, 'teacher-a');
  const teacherDashboard = teacherPage.waitForResponse(response => response.url().endsWith('/api/v1/me/dashboard') && response.status() === 200);
  await teacherPage.goto('http://127.0.0.1:3000/');
  await teacherPage.getByRole('heading', { name: 'Sala dos professores' }).waitFor();
  const teacherPayload = await (await teacherDashboard).json();
  await teacherPage.getByRole('heading', { name: 'Prazos das atividades' }).waitFor();
  await teacherPage.getByRole('heading', { name: 'AJA-16 prazo 1' }).first().waitFor();
  const teacherParagraphs = (await teacherPage.locator('p').allTextContents()).map(value => value.trim());
  const teacherDeadlineLabels = teacherParagraphs.filter(value => value.includes('15 de jun') && value.includes('21:30'));

  await login(studentPage, 'student');
  const studentDashboard = studentPage.waitForResponse(response => response.url().endsWith('/api/v1/me/dashboard') && response.status() === 200);
  await studentPage.goto('http://127.0.0.1:3000/');
  await studentPage.getByRole('heading', { name: 'Meu painel' }).waitFor();
  const studentPayload = await (await studentDashboard).json();
  const progressSummary = studentPage.locator('section[aria-label="Progresso de estudos"] strong');
  const progressValues = (await progressSummary.allTextContents()).map(value => value.trim());
  await studentPage.getByRole('heading', { name: 'AJA-16 prazo 1' }).first().waitFor();
  const studentParagraphs = (await studentPage.locator('p').allTextContents()).map(value => value.trim());
  const studentDeadlineLabels = studentParagraphs.filter(value => value.includes('15 de jun') && value.includes('21:30'));
  const studentCards = await studentPage.locator('section[aria-labelledby="student-deadlines"] a[href*="/questionarios/responder"]').count();

  if (teacherPayload.assessments.length !== 3 || studentPayload.assessments.length !== 3 || studentPayload.pendingAssessmentCount !== 5 || progressValues[2] !== '5') throw new Error('O dashboard não preservou o total e o limite de três atividades.');
  if (teacherDeadlineLabels.length !== 3 || studentDeadlineLabels.length !== 3 || studentCards !== 3) throw new Error(`Data/hora ou limite de cartões divergente entre perfis: ${JSON.stringify({ teacherDeadlineLabels, studentDeadlineLabels, studentCards, progressValues })}`);
  if (teacherPayload.pendingEnrollmentCount !== 0 || JSON.stringify(teacherPayload).includes('student-pending@aja.local.test') || JSON.stringify(teacherPayload).includes('e-pending')) throw new Error('Painel docente expôs dados de matrícula pendente.');

  const result = {
    timezoneId: 'UTC',
    apiStatuses: responses,
    teacherVisibleAssessments: teacherPayload.assessments.length,
    studentPendingAssessmentCount: studentPayload.pendingAssessmentCount,
    studentVisibleAssessments: studentPayload.assessments.length,
    expectedLocalDeadlineLabel: 'Até 15 de jun. · 21:30',
    teacherRenderedDeadlineParagraphs: teacherDeadlineLabels,
    studentRenderedDeadlineParagraphs: studentDeadlineLabels,
    teacherDeadlineLabels: teacherDeadlineLabels.length,
    studentDeadlineLabels: studentDeadlineLabels.length,
    enrollmentCountForTeacher: teacherPayload.pendingEnrollmentCount,
    pendingIdentityFieldsExposed: false,
    studentCards: studentCards
  };
  await teacherContext.close();
  await studentContext.close();
  return result;
}

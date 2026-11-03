async page => {
  const base = 'http://127.0.0.1:3001';
  const requests = [];
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    if (response.url().includes('/api/v1/attendance')) requests.push({ method: response.request().method(), path: new URL(response.url()).pathname, status: response.status() });
  });
  const login = async (target, email) => {
    await target.goto(`${base}/login`);
    await target.getByLabel('E-mail').fill(email);
    await target.getByRole('textbox', { name: /Senha/ }).fill(email.startsWith('teacher-unassigned') ? 'AjaLocal-teacher-unassigned-2031!' : 'AjaLocal-teacher-b-2031!');
    await target.getByRole('button', { name: 'Entrar' }).click();
    await target.getByRole('link', { name: /Frequ/ }).waitFor();
  };
  const openAttendance = async target => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    await target.goto(`${base}/frequencia?disciplina=s1`);
    await target.getByRole('heading', { name: /Registro de frequ/ }).waitFor();
    await target.getByLabel('Disciplina / turma').selectOption('s1');
    await target.getByLabel('Data da aula').fill(today);
    await target.getByLabel(/Hor/).fill('19:00');
    await target.getByRole('button', { name: 'Carregar chamada' }).click();
    await target.getByText('Alex Aprendiz').waitFor();
    return today;
  };
  const save = async target => {
    const action = await target.getByRole('button', { name: 'Salvar chamada' }).count() ? 'Salvar chamada' : 'Atualizar chamada';
    await target.getByRole('button', { name: action }).click();
    await target.getByRole('button', { name: 'Confirmar', exact: true }).click();
  };
  await login(page, 'teacher-b@aja.local.test');
  const date = await openAttendance(page);
  await page.getByRole('button', { name: 'Marcar todos presentes' }).click();
  await save(page);
  await page.getByRole('button', { name: 'Atualizar chamada' }).waitFor();
  await page.reload();
  await openAttendance(page);
  if (await page.locator('input[type="checkbox"]').count() !== 2) throw new Error('A chamada salva nao foi reaberta apos reload.');

  const browser = page.context().browser();
  const secondContext = await browser.newContext();
  const second = await secondContext.newPage();
  second.on('response', response => {
    if (response.url().includes('/api/v1/attendance')) requests.push({ method: response.request().method(), path: new URL(response.url()).pathname, status: response.status() });
  });
  await login(second, 'teacher-b@aja.local.test');
  await openAttendance(second);
  await page.getByRole('button', { name: 'Marcar todos ausentes' }).click();
  await save(page);
  await page.getByText(/Frequ.ncia salva/).waitFor();
  await second.locator('input[type="checkbox"]').first().uncheck();
  await save(second);
  await second.getByText(/mudou enquanto voc/).waitFor();
  await second.getByRole('button', { name: /Consultar vers/ }).click();
  await second.getByText(/Vers.o salva/).first().waitFor();
  await second.getByText(/Seu preenchimento/).first().waitFor();

  const deniedContext = await browser.newContext();
  const denied = await deniedContext.newPage();
  await login(denied, 'teacher-unassigned@aja.local.test');
  await denied.goto(`${base}/frequencia?disciplina=s1`);
  await denied.getByRole('heading', { name: /Nenhuma disciplina atribu/ }).waitFor();
  const deniedStatus = await denied.evaluate(async dateValue => {
    const response = await fetch(`http://127.0.0.1:3203/api/v1/attendance/eligible?subjectId=s1&date=${dateValue}&time=19%3A00`, { credentials: 'include' });
    return response.status;
  }, date);
  if (deniedStatus !== 404) throw new Error(`Unassigned teacher expected 404; got ${deniedStatus}.`);
  requests.push({ method: 'GET', path: '/api/v1/attendance/eligible (unassigned teacher)', status: deniedStatus });
  if (pageErrors.length) throw new Error(`Browser errors: ${pageErrors.join('; ')}`);
  await secondContext.close();
  await deniedContext.close();
  return { result: 'PASS', date, requests, pageErrors, asserted: ['PATCH through UI for existing call', 'reload persistence', 'stale conflict 409 with local values', 'unassigned teacher 404'] };
}

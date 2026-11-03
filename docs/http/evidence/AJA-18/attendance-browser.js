async page => {
  const checks = [];
  const requests = [];
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('response', response => {
    if (response.url().includes('/api/v1/attendance')) requests.push({ status: response.status(), path: new URL(response.url()).pathname });
  });
  const base = 'http://127.0.0.1:3001';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

  async function openAttendance(target, subjectId = 's1') {
    await target.goto(`${base}/frequencia/?disciplina=${subjectId}`);
    await target.getByRole('heading', { name: 'Registro de frequÃªncia' }).waitFor();
    await target.getByLabel('Disciplina / turma').selectOption(subjectId);
    await target.getByLabel('Data da aula').fill(today);
    await target.getByLabel('HorÃ¡rio').fill('19:00');
    await target.getByRole('button', { name: 'Carregar chamada' }).click();
    await target.getByText('Alex Aprendiz').waitFor();
  }

  await openAttendance(page);
  checks.push('A chamada carrega os alunos elegÃ­veis da API.');
  await page.getByRole('button', { name: 'Marcar todos presentes' }).click();
  const createButton = page.getByRole('button', { name: 'Salvar chamada' });
  await (await createButton.count() ? createButton : page.getByRole('button', { name: 'Atualizar chamada' })).click();
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await page.getByRole('button', { name: 'Atualizar chamada' }).waitFor();
  checks.push('MarcaÃ§Ã£o em lote e confirmaÃ§Ã£o criaram a aula.');
  await page.reload();
  await openAttendance(page);
  if (await page.locator('input[type="checkbox"]').count() !== 2) throw new Error('A lista salva nÃ£o reabriu apÃ³s reload.');
  checks.push('A chamada salva reabriu apÃ³s reload.');

  const browser = page.context().browser();
  const secondContext = await browser.newContext();
  const second = await secondContext.newPage();
  second.on('response', response => {
    if (response.url().includes('/api/v1/attendance')) requests.push({ status: response.status(), path: new URL(response.url()).pathname });
  });
  await second.goto(`${base}/login/`);
  await second.getByLabel('E-mail').fill('teacher-b@aja.local.test');
  await second.getByRole('textbox', { name: 'Senha' }).fill('AjaLocal-teacher-b-2031!');
  await second.getByRole('button', { name: 'Entrar' }).click();
  await second.getByRole('link', { name: 'FrequÃªncia' }).waitFor();
  await openAttendance(second);
  checks.push('Uma segunda sessÃ£o autorizada encontrou a mesma aula.');

  await page.getByRole('button', { name: 'Marcar todos ausentes' }).click();
  await page.getByRole('button', { name: 'Atualizar chamada' }).click();
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await page.getByText('FrequÃªncia salva.').waitFor();
  await second.locator('input[type="checkbox"]').first().check();
  await second.getByRole('button', { name: 'Atualizar chamada' }).click();
  await second.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await second.getByText('Este registro mudou enquanto vocÃª editava.').waitFor();
  await second.getByRole('button', { name: 'Consultar versÃ£o atual' }).click();
  if (!(await second.getByText('VersÃ£o salva').count())) throw new Error('A tela de conflito nÃ£o mostrou a versÃ£o salva.');
  if (!(await second.getByText('Seu preenchimento').count())) throw new Error('A tela de conflito nÃ£o preservou a comparaÃ§Ã£o local.');
  checks.push('Conflito entre sessÃµes preservou o preenchimento e mostrou as duas versÃµes.');

  await second.goto(`${base}/alunos/perfil/?id=student`);
  await second.getByRole('heading', { name: 'HistÃ³rico de frequÃªncia' }).waitFor();
  await second.getByText('Ausente', { exact: true }).first().waitFor();
  await second.reload();
  await second.getByRole('heading', { name: 'HistÃ³rico de frequÃªncia' }).waitFor();
  await second.getByText('Ausente', { exact: true }).first().waitFor();
  checks.push('Perfil autorizado exibiu o histÃ³rico atualizado tambÃ©m apÃ³s reload.');

  const deniedContext = await browser.newContext();
  const denied = await deniedContext.newPage();
  await denied.goto(`${base}/login/`);
  await denied.getByLabel('E-mail').fill('teacher-unassigned@aja.local.test');
  await denied.getByRole('textbox', { name: 'Senha' }).fill('AjaLocal-teacher-unassigned-2031!');
  await denied.getByRole('button', { name: 'Entrar' }).click();
  await denied.getByRole('link', { name: 'FrequÃªncia' }).waitFor();
  await denied.goto(`${base}/frequencia/?disciplina=s1`);
  await denied.getByRole('heading', { name: 'Nenhuma disciplina atribuÃ­da' }).waitFor();
  const deniedStatus = await denied.evaluate(async date => {
    const response = await fetch(`http://127.0.0.1:3203/api/v1/attendance/eligible?subjectId=s1&date=${date}&time=19%3A00`, { credentials: 'include' });
    return response.status;
  }, today);
  if (deniedStatus !== 404) throw new Error(`Esperado 404 para docente desatribuÃ­do; API respondeu ${deniedStatus}.`);
  requests.push({ status: deniedStatus, path: '/api/v1/attendance/eligible (docente desatribuÃ­do)' });
  checks.push('Docente desatribuÃ­do nÃ£o recebeu o seletor e a API negou consulta direta com 404.');

  if (failures.length) throw new Error(`Erros de pÃ¡gina: ${failures.join('; ')}`);
  return { checks, requests, pageErrors: failures, contexts: 3, date: today };
}

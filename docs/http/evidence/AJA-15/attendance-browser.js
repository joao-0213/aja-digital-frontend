async page => {
  const checks = [];
  const requests = [];
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('response', response => {
    if (response.url().includes('/api/v1/attendance')) requests.push({ status: response.status(), path: new URL(response.url()).pathname });
  });
  const base = 'http://127.0.0.1:3000';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

  async function openAttendance(target, subjectId = 's1') {
    await target.goto(`${base}/frequencia/?disciplina=${subjectId}`);
    await target.getByRole('heading', { name: 'Registro de frequência' }).waitFor();
    await target.getByLabel('Disciplina / turma').selectOption(subjectId);
    await target.getByLabel('Data da aula').fill(today);
    await target.getByLabel('Horário').fill('19:00');
    await target.getByRole('button', { name: 'Carregar chamada' }).click();
    await target.getByText('Alex Aprendiz').waitFor();
  }

  await openAttendance(page);
  checks.push('A chamada carrega os alunos elegíveis da API.');
  await page.getByRole('button', { name: 'Marcar todos presentes' }).click();
  const createButton = page.getByRole('button', { name: 'Salvar chamada' });
  await (await createButton.count() ? createButton : page.getByRole('button', { name: 'Atualizar chamada' })).click();
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await page.getByRole('button', { name: 'Atualizar chamada' }).waitFor();
  checks.push('Marcação em lote e confirmação criaram a aula.');
  await page.reload();
  await openAttendance(page);
  if (await page.locator('input[type="checkbox"]').count() !== 2) throw new Error('A lista salva não reabriu após reload.');
  checks.push('A chamada salva reabriu após reload.');

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
  await second.getByRole('link', { name: 'Frequência' }).waitFor();
  await openAttendance(second);
  checks.push('Uma segunda sessão autorizada encontrou a mesma aula.');

  await page.getByRole('button', { name: 'Marcar todos ausentes' }).click();
  await page.getByRole('button', { name: 'Atualizar chamada' }).click();
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await page.getByText('Frequência salva.').waitFor();
  await second.locator('input[type="checkbox"]').first().check();
  await second.getByRole('button', { name: 'Atualizar chamada' }).click();
  await second.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await second.getByText('Este registro mudou enquanto você editava.').waitFor();
  await second.getByRole('button', { name: 'Consultar versão atual' }).click();
  if (!(await second.getByText('Versão salva').count())) throw new Error('A tela de conflito não mostrou a versão salva.');
  if (!(await second.getByText('Seu preenchimento').count())) throw new Error('A tela de conflito não preservou a comparação local.');
  checks.push('Conflito entre sessões preservou o preenchimento e mostrou as duas versões.');

  await second.goto(`${base}/alunos/perfil/?id=student`);
  await second.getByRole('heading', { name: 'Histórico de frequência' }).waitFor();
  await second.getByText('Ausente', { exact: true }).first().waitFor();
  await second.reload();
  await second.getByRole('heading', { name: 'Histórico de frequência' }).waitFor();
  await second.getByText('Ausente', { exact: true }).first().waitFor();
  checks.push('Perfil autorizado exibiu o histórico atualizado também após reload.');

  const deniedContext = await browser.newContext();
  const denied = await deniedContext.newPage();
  await denied.goto(`${base}/login/`);
  await denied.getByLabel('E-mail').fill('teacher-unassigned@aja.local.test');
  await denied.getByRole('textbox', { name: 'Senha' }).fill('AjaLocal-teacher-unassigned-2031!');
  await denied.getByRole('button', { name: 'Entrar' }).click();
  await denied.getByRole('link', { name: 'Frequência' }).waitFor();
  await denied.goto(`${base}/frequencia/?disciplina=s1`);
  await denied.getByRole('heading', { name: 'Nenhuma disciplina atribuída' }).waitFor();
  const deniedStatus = await denied.evaluate(async date => {
    const response = await fetch(`http://127.0.0.1:3002/api/v1/attendance/eligible?subjectId=s1&date=${date}&time=19%3A00`, { credentials: 'include' });
    return response.status;
  }, today);
  if (deniedStatus !== 404) throw new Error(`Esperado 404 para docente desatribuído; API respondeu ${deniedStatus}.`);
  requests.push({ status: deniedStatus, path: '/api/v1/attendance/eligible (docente desatribuído)' });
  checks.push('Docente desatribuído não recebeu o seletor e a API negou consulta direta com 404.');

  if (failures.length) throw new Error(`Erros de página: ${failures.join('; ')}`);
  return { checks, requests, pageErrors: failures, contexts: 3, date: today };
}

async (page) => {
  await page.goto('http://127.0.0.1:3000/login/');
  await page.getByRole('textbox', { name: 'E-mail' }).fill('student@aja.local.test');
  await page.getByRole('textbox', { name: 'Senha' }).fill('AjaLocal-student-2031!');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('heading', { name: 'Dados cadastrais' }).waitFor();
  await page.evaluate(() => { sessionStorage.removeItem('aja-forum-compose:student:material-text'); sessionStorage.removeItem('aja-forum-compose:student:q1'); sessionStorage.removeItem('aja-forum-compose:student:material:material-text'); sessionStorage.removeItem('aja-forum-compose:student:question:q1'); });
  await page.goto('http://127.0.0.1:3000/forum/?material=material-text');
  const title = page.getByRole('textbox', { name: 'Título da pergunta' });
  await title.waitFor();
  await title.fill('Rascunho do material');
  await page.getByRole('textbox', { name: 'Conte sua dúvida' }).fill('Este corpo pertence ao material antigo.');
  await page.evaluate(() => window.history.pushState({}, '', '/forum/?questao=q1'));
  await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')));
  await page.waitForURL('**/forum/?questao=q1');
  await page.waitForTimeout(500);
  if (await title.inputValue() !== '') throw new Error(`Título antigo atravessou contexto: ${await title.inputValue()}`);
  const body = await page.getByRole('textbox', { name: 'Conte sua dúvida' }).inputValue();
  if (body !== '') throw new Error(`Corpo antigo atravessou contexto: ${body}`);
  if (!await page.getByText('Referência: question · q1').count()) throw new Error('Question reference was not applied after context switch.');
  console.log('PASS: old title/body cleared; question reference applied.');
}

async (page) => {
  await page.goto('http://127.0.0.1:3000/login/');
  await page.getByRole('textbox', { name: 'E-mail' }).fill('student@aja.local.test');
  await page.getByRole('textbox', { name: 'Senha' }).fill('AjaLocal-student-2031!');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('heading', { name: 'Dados cadastrais' }).waitFor();
  const subject = await page.evaluate(async () => {
    const response = await fetch('http://127.0.0.1:3002/api/v1/subjects?page=1&pageSize=100', { credentials: 'include' });
    const data = await response.json();
    return data.items.find(item => item.id === 's1').id;
  });
  let attachmentUploads = 0;
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/api/v1/files')) attachmentUploads++; });
  await page.evaluate(targetSubject => sessionStorage.setItem('aja-forum-compose:student:material-text', JSON.stringify({ title: 'Rascunho legado contextual', body: 'Corpo local antigo do material.', tags: 'legada, retomada', reference: 'material:material-text', targetSubject, attachment: { id: 'legacy-file-777', name: 'antigo.png', mime: 'image/png', size: 5 } })), subject);
  await page.goto('http://127.0.0.1:3000/forum/?material=material-text');
  const title = page.getByRole('textbox', { name: 'Título da pergunta' });
  await title.waitFor();
  if (await title.inputValue() !== 'Rascunho legado contextual') throw new Error(`Old raw context key was not recovered: ${await title.inputValue()}`);
  if (await page.getByRole('textbox', { name: 'Conte sua dúvida' }).inputValue() !== 'Corpo local antigo do material.') throw new Error('Legacy body was not recovered.');
  if (await page.getByLabel('Disciplina', { exact: true }).inputValue() !== subject) throw new Error('Legacy targetSubject was not recovered.');
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('aja-forum-compose:student:material-text')));
  if (saved.targetSubject !== subject || saved.attachment?.id !== 'legacy-file-777') throw new Error('Legacy key or local metadata was not retained in sessionStorage.');
  await page.reload();
  if (await page.getByRole('textbox', { name: 'Título da pergunta' }).inputValue() !== 'Rascunho legado contextual') throw new Error('Legacy context draft did not survive reload.');
  if (await page.getByRole('textbox', { name: 'Conte sua dúvida' }).inputValue() !== 'Corpo local antigo do material.') throw new Error('Legacy context body did not survive reload.');
  if (!await page.getByText('O anexo legado “antigo.png” foi preservado').count() || attachmentUploads !== 0) throw new Error('Legacy attachment metadata or local-only status changed after reload.');
  if (!await page.getByText('O anexo legado “antigo.png” foi preservado').count()) throw new Error('Legacy attachment metadata was not retained as local-only metadata.');
  if (attachmentUploads !== 0) throw new Error('Legacy metadata triggered an automatic file upload.');
  console.log('PASS: raw material-ID draft key and legacy fields recovered; attachment bytes were not uploaded.');
}

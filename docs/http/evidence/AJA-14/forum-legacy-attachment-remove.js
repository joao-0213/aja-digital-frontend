async (page) => {
  await page.goto('http://127.0.0.1:3000/login/');
  await page.getByRole('textbox', { name: 'E-mail' }).fill('student@aja.local.test');
  await page.getByRole('textbox', { name: 'Senha' }).fill('AjaLocal-student-2031!');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('heading', { name: 'Dados cadastrais' }).waitFor();
  await page.evaluate(() => sessionStorage.setItem('aja-forum-compose:student:new', JSON.stringify({ title: 'Rascunho com anexo legado', body: 'Corpo permanece depois de remover o anexo.', tags: '', reference: '', targetSubject: 's1', attachment: { id: 'legacy-file-remove', name: 'retirar.png', mime: 'image/png', size: 5 } })));
  await page.goto('http://127.0.0.1:3000/forum/');
  await page.getByRole('button', { name: 'Nova pergunta' }).click();
  await page.getByRole('button', { name: 'Remover da composição' }).click();
  if (await page.getByText('O anexo legado “retirar.png” foi preservado').count()) throw new Error('Legacy attachment was not removed in memory.');
  await page.reload();
  await page.getByRole('button', { name: 'Nova pergunta' }).click();
  if (await page.getByText('O anexo legado “retirar.png” foi preservado').count()) throw new Error('Removed legacy attachment reappeared after reload.');
  await page.getByRole('textbox', { name: 'Título da pergunta' }).fill('Publicação sem anexo legado');
  await page.getByRole('textbox', { name: 'Conte sua dúvida' }).fill('A referência antiga ao arquivo foi removida.');
  let publication;
  page.on('request', request => { if (request.method() === 'POST' && /\/api\/v1\/topics$/.test(request.url())) publication = request.postDataJSON(); });
  await page.getByRole('button', { name: 'Publicar pergunta' }).click();
  await page.getByRole('heading', { name: 'Fazer uma pergunta' }).waitFor({ state: 'detached' });
  if (publication?.attachmentId !== null) throw new Error(`Legacy file ID was published: ${JSON.stringify(publication)}`);
  console.log('PASS: removed legacy attachment remains absent after reload and publish sends attachmentId null.');
}

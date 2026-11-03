async (page) => {
  await page.goto('http://127.0.0.1:3000/perfil/');
  await page.getByRole('button', { name: 'Sair' }).click();
  await page.getByRole('textbox', { name: 'E-mail' }).waitFor();
  await page.getByRole('textbox', { name: 'E-mail' }).fill('teacher-a@aja.local.test');
  await page.getByRole('textbox', { name: 'Senha' }).fill('AjaLocal-teacher-a-2031!');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('heading', { name: 'Dados cadastrais' }).waitFor();

  await page.goto('http://127.0.0.1:3000/forum/');
  const archived = page.getByRole('link', { name: /Registro da turma anterior/ });
  await archived.waitFor();
  await archived.click();
  await page.getByRole('heading', { name: 'Registro da turma anterior' }).waitFor();
  await page.getByText('Esta turma está inativa. O histórico permanece disponível para consulta da equipe autorizada.').waitFor();
  if (await page.getByRole('textbox', { name: 'Sua resposta' }).count() !== 0) throw new Error('Equipe recebeu formulário de publicação em turma encerrada.');

  const outcomes = await page.evaluate(async () => {
    const detail = await fetch('http://127.0.0.1:3002/api/v1/topics/topic-closed', { credentials: 'include' });
    const row = await detail.json();
    const publish = await fetch('http://127.0.0.1:3002/api/v1/topics/topic-closed/replies', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: 'Resposta bloqueada no histórico.' }) });
    return { readStatus: detail.status, readMarker: row.read, publishStatus: publish.status };
  });
  if (outcomes.readStatus !== 200 || outcomes.readMarker !== true || outcomes.publishStatus !== 403) throw new Error(`Acesso da equipe em turma encerrada divergente: ${JSON.stringify(outcomes)}`);
  console.log(JSON.stringify({ archivedTopicVisible: true, readingAllowedAndMarked: true, replyFormHidden: true, publishStatus: outcomes.publishStatus }));
}

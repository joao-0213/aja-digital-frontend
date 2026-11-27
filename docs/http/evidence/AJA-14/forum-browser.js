async (page) => {
const assert = (condition, message) => { if (!condition) throw new Error(message); };
await page.goto('http://127.0.0.1:3000/login/');
await page.getByRole('textbox', { name: 'E-mail' }).fill('student@aja.local.test');
await page.getByRole('textbox', { name: 'Senha' }).fill('AjaLocal-student-2031!');
await page.getByRole('button', { name: 'Entrar' }).click();
await page.getByRole('heading', { name: 'Dados cadastrais' }).waitFor();

await page.goto('http://127.0.0.1:3000/forum/');
await page.getByRole('heading', { name: 'Como comparar dois grupos?' }).waitFor();
assert(await page.getByText('1 respostas').count() === 1, 'Lista mostra o tópico carregado pela API.');
await page.reload();
await page.getByRole('heading', { name: 'Como comparar dois grupos?' }).waitFor();

await page.evaluate(() => sessionStorage.removeItem('aja-forum-reply:student:topic1'));
await page.goto('http://127.0.0.1:3000/forum/topico/?id=topic1');
await page.getByRole('heading', { name: 'Como comparar dois grupos?' }).waitFor();
assert(await page.getByRole('link', { name: 'O que é proporção?' }).count() === 1, 'Referência do material é resolvida pelo servidor.');
await page.getByRole('button', { name: 'Prévia de grupos.png' }).click();
await page.getByRole('dialog', { name: 'grupos.png' }).waitFor();
await page.keyboard.press('Escape');

const reply = page.getByRole('textbox', { name: 'Sua resposta' });
await reply.fill('Rascunho de resposta preservado após a recarga.');
await page.reload();
await page.getByRole('textbox', { name: 'Sua resposta' }).waitFor();
assert(await page.getByRole('textbox', { name: 'Sua resposta' }).inputValue() === 'Rascunho de resposta preservado após a recarga.', 'Rascunho sobrevive à recarga no mesmo contexto.');

await page.context().setOffline(true);
await page.getByRole('button', { name: 'Votar positivamente' }).click();
await page.getByRole('alert').filter({ hasText: 'Serviço indisponível' }).waitFor();
await page.context().setOffline(false);
await page.reload();
await page.getByRole('button', { name: 'Votar positivamente' }).waitFor();
assert(await page.getByRole('button', { name: 'Votar positivamente' }).getAttribute('aria-pressed') === 'true', 'Falha de conexão não alterou o voto salvo.');

await page.evaluate(() => sessionStorage.removeItem('aja-forum-reply:student:topic1'));
const api = await page.evaluate(async () => {
  const response = await fetch('http://127.0.0.1:3002/api/v1/topics/topic1', { credentials: 'include' });
  const body = await response.json();
  return { status: response.status, id: body.id, replies: body.replies.length, read: body.read };
});
assert(api.status === 200 && api.id === 'topic1' && api.replies === 1 && api.read, 'HTTP detail confirms saved replies and read marker.');
console.log(JSON.stringify({ list: 'DOM assertion passed', reload: 'DOM assertion passed', reference: 'DOM assertion passed', attachmentPreview: 'HTTP-backed preview opened', draft: 'DOM assertion passed', offline: 'request failed without changing vote', api }));
}

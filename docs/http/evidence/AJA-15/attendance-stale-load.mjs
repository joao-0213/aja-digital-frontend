import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(`${process.env.APPDATA}/npm/node_modules/@playwright/cli/package.json`);
const { chromium } = require('playwright-core');
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const requests = [];
const held = [];
const browserErrors = [];
page.on('pageerror', error => browserErrors.push(error.message));
page.on('request', request => {
  if (request.url().includes('/api/v1/attendance')) requests.push({ method: request.method(), url: request.url() });
});

try {
  await page.goto('http://127.0.0.1:3000/login/');
  await page.getByLabel('E-mail').fill('teacher-a@aja.local.test');
  await page.getByRole('textbox', { name: 'Senha' }).fill('AjaLocal-teacher-a-2031!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('heading', { name: 'Dados cadastrais' }).waitFor();
  await page.goto('http://127.0.0.1:3000/frequencia/?disciplina=s1');
  await page.getByRole('heading', { name: 'Registro de frequência' }).waitFor();
  await page.getByLabel('Disciplina / turma').selectOption('s1');

  const dateA = await page.getByLabel('Data da aula').inputValue();
  const dateB = new Date(`${dateA}T12:00:00Z`);
  dateB.setUTCDate(dateB.getUTCDate() + 1);
  const nextDate = dateB.toISOString().slice(0, 10);
  const randomMinutes = Math.floor(Math.random() * 1440);
  const timeA = `${String(Math.floor(randomMinutes / 60)).padStart(2, '0')}:${String(randomMinutes % 60).padStart(2, '0')}`;
  await page.getByLabel('Data da aula').fill(dateA);
  await page.getByLabel('Horário').fill(timeA);
  await page.getByRole('button', { name: 'Carregar chamada' }).click();
  await page.getByText('Alex Aprendiz').waitFor();
  await page.getByRole('button', { name: 'Marcar todos ausentes' }).click();
  const initialButton = page.getByRole('button', { name: 'Salvar chamada', exact: true });
  await (await initialButton.count() ? initialButton : page.getByRole('button', { name: 'Atualizar chamada', exact: true })).click();
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await page.getByRole('button', { name: 'Atualizar chamada', exact: true }).waitFor();

  let release;
  const releaseHeld = new Promise(resolve => { release = resolve; });
  let notifyHeld;
  const bothHeld = new Promise(resolve => { notifyHeld = resolve; });
  await page.route('**/api/v1/attendance**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const isA = request.method() === 'GET' && (
      url.pathname === '/api/v1/attendance' && url.searchParams.get('from') === dateA
      || url.pathname === '/api/v1/attendance/eligible' && url.searchParams.get('date') === dateA
    );
    if (!isA) return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    held.push({ route, response, path: url.pathname, body });
    if (held.length === 2) notifyHeld();
    await releaseHeld;
    await route.fulfill({ response, json: body });
  });

  await page.getByRole('button', { name: 'Carregar chamada' }).click();
  await bothHeld;
  await page.getByLabel('Data da aula').fill(nextDate);
  await page.getByRole('button', { name: 'Carregar chamada' }).click();
  await page.getByText('Alex Aprendiz').waitFor();
  const checkedBeforeRelease = await page.locator('input[type="checkbox"]').evaluateAll(inputs => inputs.map(input => input.checked));
  assert.ok(checkedBeforeRelease.length > 0 && checkedBeforeRelease.every(Boolean), 'A nova data deve iniciar com a nova lista completa marcada.');
  release();
  await page.waitForTimeout(300);

  const checkedAfterRelease = await page.locator('input[type="checkbox"]').evaluateAll(inputs => inputs.map(input => input.checked));
  const updateCount = await page.getByRole('button', { name: 'Atualizar chamada', exact: true }).count();
  const saveCount = await page.getByRole('button', { name: 'Salvar chamada', exact: true }).count();
  assert.equal(await page.getByLabel('Data da aula').inputValue(), nextDate);
  assert.ok(checkedAfterRelease.length > 0 && checkedAfterRelease.every(Boolean), 'A resposta atrasada não pode substituir as marcações da seleção atual.');
  assert.equal(updateCount, 0, 'A resposta atrasada não pode carregar a identidade da aula antiga na seleção nova.');
  assert.equal(saveCount, 1, 'A seleção nova deve continuar como uma chamada ainda não salva.');
  assert.equal(requests.filter(request => request.method === 'PATCH').length, 0, 'A corrida de carregamento não deve enviar PATCH.');
  assert.equal(held.find(item => item.path === '/api/v1/attendance')?.body.items[0]?.date, dateA);
  assert.equal(held.find(item => item.path.endsWith('/eligible'))?.body.items.length > 0, true);
  assert.deepEqual(browserErrors, []);
  console.log(JSON.stringify({ result: 'PASS', dateA, nextDate, timeA, heldRealResponses: held.map(item => ({ path: item.path, status: item.response.status() })), checkedBeforeRelease, checkedAfterRelease, updateCount, saveCount, attendancePatchRequests: requests.filter(request => request.method === 'PATCH').length, browserErrors }, null, 2));
} finally {
  for (const item of held) await item.route.continue().catch(() => {});
  await context.close();
  await browser.close();
}

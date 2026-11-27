import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(`${process.env.APPDATA}/npm/node_modules/@playwright/cli/package.json`);
const { chromium } = require('playwright-core');
const scenarioSource = await readFile(new URL('./attendance-browser.js', import.meta.url), 'utf8');
const scenario = new Function(`return (${scenarioSource});`)();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

try {
  await page.goto('http://127.0.0.1:3000/login/');
  await page.getByLabel('E-mail').fill('teacher-a@aja.local.test');
  await page.getByRole('textbox', { name: 'Senha' }).fill('AjaLocal-teacher-a-2031!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('heading', { name: 'Dados cadastrais' }).waitFor();
  console.log(JSON.stringify(await scenario(page), null, 2));
} finally {
  await context.close();
  await browser.close();
}

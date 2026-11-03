async page => {
  const browser = page.context().browser();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const current = await context.newPage();
  await current.goto('http://127.0.0.1:3001/login', { waitUntil: 'domcontentloaded' });
  await current.getByLabel('E-mail').fill('admin@aja.local.test');
  await current.getByRole('textbox', { name: 'Senha' }).fill('AjaLocal-admin-2031!');
  await current.getByRole('button', { name: 'Entrar' }).click();
  await current.waitForFunction(() => document.querySelector('main h1')?.innerText !== 'Entrar no AJA Digital');
  await current.goto('http://127.0.0.1:3001/alunos?turma=c1', { waitUntil: 'domcontentloaded' });
  const trigger = current.getByRole('button', { name: 'Adicionar aluno por e-mail' });
  await trigger.click();
  const dialog = current.getByRole('dialog', { name: 'Adicionar aluno em Turma Horizonte' });
  await dialog.waitFor({ state: 'visible' });
  const initialFocus = await current.evaluate(() => ({
    insideDialog: !!document.querySelector('dialog[open]')?.contains(document.activeElement),
    tag: document.activeElement?.tagName.toLowerCase(),
    name: document.activeElement?.getAttribute('aria-label') || document.activeElement?.getAttribute('placeholder') || document.activeElement?.innerText || ''
  }));
  if (!initialFocus.insideDialog) throw new Error(`modal did not move focus inside: ${JSON.stringify(initialFocus)}`);
  await current.keyboard.press('Tab');
  const tabFocus = await current.evaluate(() => ({ insideDialog: !!document.querySelector('dialog[open]')?.contains(document.activeElement), tag: document.activeElement?.tagName.toLowerCase() }));
  if (!tabFocus.insideDialog) throw new Error(`Tab escaped the modal: ${JSON.stringify(tabFocus)}`);
  let confirmationMessage = '';
  current.once('dialog', async confirmation => { confirmationMessage = confirmation.message(); await confirmation.accept(); });
  await current.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden', timeout: 5000 });
  const restored = await current.evaluate(() => ({ name: document.activeElement?.getAttribute('aria-label') || document.activeElement?.innerText || '', matchesTrigger: document.activeElement?.getAttribute('aria-label') === 'Adicionar aluno por e-mail' || document.activeElement?.innerText === 'Adicionar aluno por e-mail' }));
  if (!restored.matchesTrigger) throw new Error(`Escape did not restore focus to its trigger: ${JSON.stringify(restored)}`);

  const privacyContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const privacyPage = await privacyContext.newPage();
  await privacyPage.goto('http://127.0.0.1:3001/login', { waitUntil: 'domcontentloaded' });
  const privacy = privacyPage.getByRole('button', { name: 'Privacidade' });
  await privacy.click();
  const privacyDialog = privacyPage.getByRole('dialog', { name: 'Privacidade' });
  await privacyDialog.waitFor({ state: 'visible' });
  const privacyFocus = await privacyPage.evaluate(() => ({ insideDialog: !!document.querySelector('dialog[open]')?.contains(document.activeElement) }));
  if (!privacyFocus.insideDialog) throw new Error('privacy dialog did not receive initial focus');
  await privacyPage.keyboard.press('Escape');
  await privacyDialog.waitFor({ state: 'hidden' });
  const privacyRestored = await privacyPage.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Privacidade' || document.activeElement?.innerText === 'Privacidade');
  if (!privacyRestored) throw new Error('privacy dialog did not restore focus');
  const overflow = await privacyPage.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  if (overflow.width !== 390 || overflow.scrollWidth > overflow.width) throw new Error(`mobile dialog layout overflow: ${JSON.stringify(overflow)}`);
  await context.close();
  await privacyContext.close();
  return { result: 'PASS', viewport: overflow, enrollmentDialog: { accessibleName: 'Adicionar aluno em Turma Horizonte', initialFocus, tabFocus, escapeConfirmation: confirmationMessage, escapeCloses: true, focusReturned: restored }, privacyDialog: { accessibleName: 'Privacidade', initialFocus: privacyFocus.insideDialog, escapeCloses: true, focusReturned: privacyRestored } };
}

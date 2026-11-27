async (page) => {
  const context = await page
    .context()
    .browser()
    .newContext({ viewport: { width: 390, height: 844 } });
  const p = await context.newPage();
  const check = (value, message) => {
    if (!value) throw new Error(message);
  };
  const open = () => p.getByRole('button', { name: 'Publicar aviso', exact: true }).click();
  try {
    await p.goto('http://127.0.0.1:3001/');
    await p.evaluate(() => {
      sessionStorage.setItem('aja-demo-role', 'admin');
      sessionStorage.setItem('aja-demo-user', 'u3');
    });
    await p.goto('http://127.0.0.1:3001/calendario');
    await p.goto('http://127.0.0.1:3001/avisos');
    await open();
    const dialog = p.getByRole('dialog');
    await dialog.getByLabel('Título', { exact: true }).fill('R1 preservado');
    await dialog.getByLabel('Mensagem', { exact: true }).fill('Composição interrompida');
    await dialog.getByLabel('Adicionar ao calendário').check();
    await dialog.getByLabel('Data do acontecimento').fill('2026-12-10');
    await dialog.getByLabel('Dia inteiro').check();
    await p.goBack();
    await p.goForward();
    await open();
    check(
      (await dialog.getByLabel('Título', { exact: true }).inputValue()) === 'R1 preservado',
      'Back/forward lost title'
    );
    check(await dialog.getByLabel('Dia inteiro').isChecked(), 'Back/forward lost occurrence');
    p.once('dialog', (d) => d.accept());
    await p.reload();
    await open();
    check(
      (await dialog.getByLabel('Mensagem', { exact: true }).inputValue()) ===
        'Composição interrompida',
      'Reload lost body'
    );
    p.once('dialog', (d) => d.accept());
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await open();
    check(
      (await dialog.getByLabel('Título', { exact: true }).inputValue()) === '',
      'Discard failed'
    );
    await p.keyboard.press('Escape');
    const card = p.locator('#aviso-n1');
    await card.getByRole('button', { name: 'Editar aviso' }).click();
    await dialog
      .getByLabel('Mensagem', { exact: true })
      .fill('Mensagem fictícia para o teste de revisão.');
    await dialog.getByRole('button', { name: 'Salvar aviso' }).click();
    await dialog.waitFor({ state: 'hidden' });
    await card.getByRole('button', { name: 'Editar aviso' }).click();
    await dialog.getByLabel('Título', { exact: true }).fill('Alteração local recuperada');
    await p.goBack();
    // Simulate another authorized editor committing a newer revision while away.
    await p.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('aja-digital-demo-v1'));
      const notice = db.announcements.find((a) => a.id === 'n1');
      notice.revision = (notice.revision ?? 0) + 1;
      notice.title = 'Versão atual de outro editor';
      notice.updatedBy = 'u3';
      notice.updatedAt = new Date().toISOString();
      localStorage.setItem('aja-digital-demo-v1', JSON.stringify(db));
    });
    await p.goForward();
    await card.getByRole('button', { name: 'Editar aviso' }).click();
    check(
      (await dialog.getByLabel('Título', { exact: true }).inputValue()) ===
        'Alteração local recuperada',
      'Edit lost text'
    );
    check(
      await dialog.getByRole('button', { name: 'Salvar aviso' }).isDisabled(),
      'Restored revision silently acknowledged'
    );
    await dialog.getByRole('button', { name: 'Consultar versão atual' }).click();
    await dialog.getByText('Versão atual de outro editor', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Conferi a versão atual' }).click();
    await dialog.getByRole('button', { name: 'Salvar aviso' }).click();
    await dialog.waitFor({ state: 'hidden' });
    await card.getByRole('button', { name: 'Editar aviso' }).click();
    check(
      (await dialog.getByLabel('Título', { exact: true }).inputValue()) ===
        'Alteração local recuperada',
      'Save failed'
    );
    check(
      (await dialog.getByText('Composição recuperada desta sessão.', { exact: false }).count()) ===
        0,
      'Success retained draft'
    );
    check(
      await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'Mobile overflow'
    );
    return {
      passed: true,
      backForward: true,
      reload: true,
      discard: true,
      staleRevision: true,
      publicationCleanup: true
    };
  } finally {
    await context.close();
  }
};

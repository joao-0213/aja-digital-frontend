async page => {
  await page.goto('http://127.0.0.1:3001/login', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Privacidade' }).click();
  const dialog = page.getByRole('dialog', { name: 'Privacidade' });
  await dialog.waitFor({ state: 'visible' });
  const result = await page.evaluate(() => {
    const dialog = document.querySelector('dialog[open]');
    return {
      heading: dialog?.querySelector('h2')?.innerText || '',
      text: dialog?.innerText || '',
      accessibleName: dialog?.querySelector('h2')?.innerText || '',
      closeButton: [...(dialog?.querySelectorAll('button') || [])].map(button => button.getAttribute('aria-label') || button.innerText).filter(Boolean)
    };
  });
  if (!result.text.trim() || /demo|demonstra|protótipo|apenas neste navegador/i.test(result.text)) throw new Error(`privacy copy audit failed: ${JSON.stringify(result)}`);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  const focusRestored = await page.evaluate(() => document.activeElement?.innerText?.includes('Privacidade') || document.activeElement?.getAttribute('aria-label') === 'Privacidade');
  return { result: 'PASS', dialog: { heading: result.heading, accessibleName: result.accessibleName, closeButton: result.closeButton, textLength: result.text.length }, escapeCloses: true, focusRestored };
}

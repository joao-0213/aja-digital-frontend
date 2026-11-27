async page => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:3001/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const initial = await page.evaluate(() => ({
    heading: document.querySelector('main h1')?.innerText || '',
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    menuVisible: [...document.querySelectorAll('button')].some(button => button.getAttribute('aria-label') === 'Abrir menu' && button.getBoundingClientRect().width > 0)
  }));
  if (!initial.heading || initial.overflow || !initial.menuVisible) throw new Error(`mobile shell failed: ${JSON.stringify(initial)}`);
  const menuButton = page.getByRole('button', { name: 'Abrir menu' });
  await menuButton.click();
  const dialog = page.getByRole('dialog', { name: 'Navegação' });
  await dialog.waitFor({ state: 'visible' });
  const nav = await dialog.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link').allInnerTexts();
  if (!nav.includes('Usuários e cargos') || !nav.includes('Meu painel')) throw new Error(`admin navigation labels missing: ${JSON.stringify(nav)}`);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  const focusRestored = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Abrir menu');
  await menuButton.click();
  await page.getByRole('dialog', { name: 'Navegação' }).getByRole('link', { name: /Ver perfil/ }).click();
  await page.waitForURL('**/perfil/');
  await page.waitForTimeout(900);
  const afterNavigation = await page.evaluate(() => ({
    heading: document.querySelector('main h1')?.innerText || '',
    footer: document.querySelector('footer')?.innerText || '',
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    visibleDialog: !!document.querySelector('dialog[open]')
  }));
  if (afterNavigation.heading !== 'Meu perfil' || afterNavigation.overflow || afterNavigation.visibleDialog || !/AJA Digital/.test(afterNavigation.footer) || !/Sair/.test(afterNavigation.footer)) throw new Error(`mobile navigation/footer failed: ${JSON.stringify(afterNavigation)}`);
  return { result: 'PASS', viewport: { width: 390, height: 844 }, accessibleNavLinks: nav.length, escapeCloses: true, focusRestored, profileHeading: afterNavigation.heading, footerPresent: true, horizontalOverflow: false };
}

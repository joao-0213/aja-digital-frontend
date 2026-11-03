async page => {
  const response = await page.goto('http://127.0.0.1:3001/unknown-route', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  const result = await page.evaluate(() => ({
    heading: document.querySelector('main h1, main h2')?.innerText || '',
    text: document.querySelector('main')?.innerText || '',
    title: document.title
  }));
  if (response?.status() !== 404) throw new Error(`expected HTTP 404, got ${response?.status()}`);
  if (!result.heading.includes('Página não encontrada')) throw new Error(`404 heading was replaced: ${JSON.stringify(result)}`);
  if (/temporariamente indisponível/i.test(result.text)) throw new Error(`404 was displayed as API outage: ${JSON.stringify(result)}`);
  return { result: 'PASS', http: response.status(), ...result };
}

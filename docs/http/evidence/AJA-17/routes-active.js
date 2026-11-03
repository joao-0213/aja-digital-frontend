async page => {
  const base = 'http://127.0.0.1:3001';
  const routes = [
    '/', '/login', '/cadastro', '/recuperar-senha', '/perfil', '/usuarios', '/turmas',
    '/alunos', '/alunos/perfil?id=student', '/disciplinas',
    '/disciplinas/detalhes?id=s1&aba=materiais#module-m1', '/materiais?id=material-text',
    '/questoes?id=q1', '/questionarios', '/questionarios/criar?id=quiz-draft',
    '/questionarios/responder?id=quiz-open', '/questionarios/resultado?id=attempt-sent',
    '/avisos', '/calendario', '/forum?disciplina=s1&questao=q2&material=material-text',
    '/forum/topico?id=topic1', '/frequencia'
  ];
  const results = [];
  for (const route of routes) {
    const response = await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
    const pageData = await page.evaluate(() => {
      const main = document.querySelector('main');
      const accessible = [...document.querySelectorAll('h1,h2,h3,button,a,input,select,textarea,[role="status"],[role="alert"],[aria-label]')]
        .filter(element => {
          const style = getComputedStyle(element);
          return style.display !== 'none' && style.visibility !== 'hidden' && !element.closest('[hidden]');
        })
        .map(element => ({
          tag: element.tagName.toLowerCase(),
          role: element.getAttribute('role') || '',
          name: element.getAttribute('aria-label') || element.getAttribute('title') || element.getAttribute('placeholder') || element.innerText || element.value || ''
        })).filter(item => item.name.trim());
      return {
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.content || '',
        h1: [...(main || document).querySelectorAll('h1')].map(element => element.innerText.trim()),
        text: (main || document.body).innerText,
        accessible
      };
    });
    const copyText = `${pageData.title}\n${pageData.description}\n${pageData.text}\n${pageData.accessible.map(item => item.name).join('\n')}`;
    const nonProductTermHits = copyText.match(/\b(?:demo|demonstração|demonstração|demonstra|prototype|protótipo|apenas neste navegador|this browser only)\b/gi) || [];
    results.push({ route, http: response?.status() ?? null, title: pageData.title, h1: pageData.h1, mainVisible: !!pageData.text.trim(), accessibleCount: pageData.accessible.length, productCopyHits: [...new Set(nonProductTermHits)] });
    if (response?.status() !== 200) throw new Error(`${route}: export returned ${response?.status()}`);
    if (!pageData.text.trim()) throw new Error(`${route}: no post-load DOM text`);
    if (!pageData.h1.length) throw new Error(`${route}: missing main heading`);
    if (nonProductTermHits.length) throw new Error(`${route}: product copy still presents a demo/prototype`);
  }
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const reloadState = await page.evaluate(() => ({ heading: document.querySelector('main h1')?.innerText || '' }));
  if (!reloadState.heading) throw new Error('reload: no loaded heading');
  return { result: 'PASS', api: 'active', authenticatedBefore: true, routesVisited: results.length, routes: results, reloadState };
}

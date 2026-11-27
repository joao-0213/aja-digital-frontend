async page => {
  const base = 'http://127.0.0.1:3001';
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const oldDb = JSON.stringify({ version: 1, users: [{ id: 'legacy-user', name: 'Legacy Identity Sentinel', role: 'admin' }], audit: [] });
    localStorage.setItem('aja-digital-demo-v1', oldDb);
    localStorage.setItem('aja-demo-email', 'legacy@example.invalid');
    sessionStorage.setItem('aja-demo-role', 'admin');
    sessionStorage.setItem('aja-demo-user', 'legacy-user');
    sessionStorage.setItem('aja-attempt-old-attempt', '{"answers":{"q1":2}}');
    sessionStorage.setItem('aja-attempt-old-attempt:questions-updated', '8');
    sessionStorage.setItem('aja-notice-draft:["legacy-user","new","s1"]', '{"title":"Legacy notice draft"}');
    sessionStorage.setItem('aja-forum-compose:legacy-user:new', '{"title":"Legacy forum draft"}');
    sessionStorage.setItem('aja-forum-reply:legacy-user:topic1', '{"body":"Legacy reply draft"}');
    sessionStorage.setItem('aja-work-v1:legacy-user:legacy-session:work1', '{"attachments":[{"name":"legacy.pdf"}]}');
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('aja-material-files', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('files');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').put(new Blob(['legacy attachment bytes'], { type: 'application/pdf' }), 'legacy-blob');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
  });
  const capture = async () => page.evaluate(async () => {
    const readBlob = () => new Promise((resolve, reject) => {
      const request = indexedDB.open('aja-material-files', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const get = db.transaction('files').objectStore('files').get('legacy-blob');
        get.onsuccess = async () => { const value = get.result; resolve(value ? await value.text() : null); db.close(); };
        get.onerror = () => reject(get.error);
      };
    });
    return {
      local: Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])),
      session: Object.fromEntries(Object.keys(sessionStorage).sort().map(key => [key, sessionStorage.getItem(key)])),
      blob: await readBlob()
    };
  });
  const before = await capture();
  const sessionStatuses = [];
  const writes = [];
  page.on('response', response => {
    if (response.url().includes('/api/v1/auth/session')) sessionStatuses.push(response.status());
  });
  page.on('request', request => {
    if (request.url().includes('/api/v1/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.push(request.method());
  });
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const firstOpen = { url: page.url(), title: await page.title(), text: await page.locator('body').innerText() };
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const after = await capture();
  const text = await page.locator('body').innerText();
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const result = {
    result: 'PASS',
    sessionStatuses,
    redirectedToLogin: page.url().includes('/login'),
    legacyIdentityVisible: text.includes('Legacy Identity Sentinel') || text.includes('legacy-user'),
    priorIdentityFieldEmpty: (await page.locator('input[type="email"]').first().inputValue().catch(() => 'unavailable')) === '',
    localStorageUnchanged: equal(before.local, after.local),
    sessionStorageUnchanged: equal(before.session, after.session),
    indexedDbBlobPreserved: before.blob === after.blob && after.blob === 'legacy attachment bytes',
    apiWrites: writes,
    domHeading: await page.locator('main h1').first().innerText().catch(() => '')
  };
  if (!result.redirectedToLogin || result.legacyIdentityVisible || !result.priorIdentityFieldEmpty || !result.localStorageUnchanged || !result.sessionStorageUnchanged || !result.indexedDbBlobPreserved || writes.length || !sessionStatuses.includes(401)) throw new Error(`legacy profile preservation failed: ${JSON.stringify(result)}`);
  return result;
}

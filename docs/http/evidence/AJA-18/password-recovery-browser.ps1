$ErrorActionPreference = 'Stop'
$evidence = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $env:AJA_TEST_RUNTIME) { throw 'Set AJA_TEST_RUNTIME to the isolated runtime directory used by the running test API.' }
$runtimeDb = Join-Path $env:AJA_TEST_RUNTIME 'db.json'
$requestScript = Join-Path $env:TEMP 'aja18-password-recovery-request.js'
$requestBody = @'
async page => {
  const browser = page.context().browser();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const current = await context.newPage();
  const responses = [];
  current.on('response', response => { const url = new URL(response.url()); if (url.pathname.startsWith('/api/v1/')) responses.push({ method: response.request().method(), path: url.pathname, status: response.status() }); });
  await current.goto('http://127.0.0.1:3001/recuperar-senha', { waitUntil: 'domcontentloaded' });
  await current.getByLabel('E-mail').fill('student-empty@aja.local.test');
  await current.getByRole('button', { name: /Solicitar/ }).click();
  await current.locator('main [role="status"]').waitFor({ state: 'visible', timeout: 10000 });
  if (!responses.some(item => item.method === 'POST' && item.path === '/api/v1/auth/password-reset-requests' && item.status === 202)) throw new Error('real recovery request 202 not observed: ' + JSON.stringify(responses));
  const confirmation = await current.locator('main [role="status"]').innerText();
  if (!/solicita|consulte|instru/i.test(confirmation)) throw new Error('PT-BR recovery confirmation missing');
  await context.close();
  return { result: 'PASS', passwordRecoveryRequest: 202, publicConfirmation: confirmation, paths: responses.map(item => ({ method: item.method, path: item.path, status: item.status })) };
}
'@
[System.IO.File]::WriteAllText($requestScript, $requestBody, [System.Text.UTF8Encoding]::new($false))
$requestOutput = & playwright-cli.cmd run-code --filename=$requestScript 2>&1 | Out-String
$requestExit = $LASTEXITCODE
Set-Content -Path (Join-Path $evidence 'password-recovery-request-browser.log') -Value $requestOutput -Encoding utf8
Remove-Item -LiteralPath $requestScript -ErrorAction SilentlyContinue
if ($requestExit -ne 0) { throw 'Password recovery request failed; see sanitized request log.' }
$state = Get-Content $runtimeDb -Raw | ConvertFrom-Json
$outboxMessage = $state.outbox | Where-Object { $_.purpose -eq 'password-reset' } | Select-Object -Last 1
if (-not $outboxMessage) { throw 'No temporary password-recovery message exists in the isolated AJA-18 runtime.' }
$token = [uri]::UnescapeDataString(([uri]$outboxMessage.url).Query.Substring(7))
$tokenJson = ConvertTo-Json -InputObject $token -Compress
$temporaryScript = Join-Path $env:TEMP 'aja18-password-recovery-browser.js'
$scriptBody = @"
async page => {
  const token = $tokenJson;
  const browser = page.context().browser();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const current = await context.newPage();
  const responses = [];
  current.on('response', response => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/v1/')) responses.push({ method: response.request().method(), path: url.pathname, status: response.status() });
  });
  await current.goto('http://127.0.0.1:3001/recuperar-senha?token=' + encodeURIComponent(token), { waitUntil: 'domcontentloaded' });
  if (await current.locator('main h1').innerText() !== 'Definir nova senha') throw new Error('recovery link did not render the new-password form');
  await current.getByRole('textbox', { name: 'Nova senha' }).fill('AjaLocal-reset-2031!');
  await current.getByRole('button', { name: 'Salvar nova senha' }).click();
  await current.getByRole('status').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  if (!responses.some(item => item.method === 'POST' && item.path === '/api/v1/auth/password-resets' && item.status === 200)) {
    const diagnostic = await current.evaluate(() => ({ status: document.querySelector('[role=status]')?.innerText || '', alert: document.querySelector('[role=alert]')?.innerText || '', form: document.querySelector('form')?.innerText || '' }));
    throw new Error('password reset response not observed: ' + JSON.stringify({ responses, diagnostic }));
  }
  await current.goto('http://127.0.0.1:3001/login', { waitUntil: 'domcontentloaded' });
  await current.getByLabel('E-mail').fill('student-empty@aja.local.test');
  await current.getByRole('textbox', { name: 'Senha' }).fill('AjaLocal-reset-2031!');
  await current.getByRole('button', { name: 'Entrar' }).click();
  await current.waitForFunction(() => document.querySelector('main h1')?.innerText !== 'Entrar no AJA Digital', null, { timeout: 15000 });
  if (!responses.some(item => item.method === 'POST' && item.path === '/api/v1/auth/login' && item.status === 200)) throw new Error('login with reset password did not use real API success: ' + JSON.stringify(responses));
  const final = await current.evaluate(() => ({ urlPath: location.pathname, heading: document.querySelector('main h1')?.innerText || '' }));
  await context.close();
  return { result: 'PASS', tokenSentToRealAPIWithoutLogging: true, resetStatus: 200, loginWithNewPassword: 200, final, responses };
}
"@
[System.IO.File]::WriteAllText($temporaryScript, $scriptBody, [System.Text.UTF8Encoding]::new($false))
try {
  $rawOutput = & playwright-cli.cmd run-code --filename=$temporaryScript 2>&1 | Out-String
  $exitCode = $LASTEXITCODE
  $safeOutput = $rawOutput -replace [regex]::Escape($token), '[REDACTED]' -replace 'token=[^&\s"''`]+', 'token=[REDACTED]'
  Set-Content -Path (Join-Path $evidence 'password-recovery-browser.log') -Value $safeOutput -Encoding utf8
  if ($exitCode -ne 0) { throw "Playwright exited $exitCode; see password-recovery-browser.log (token redacted)." }
  Get-Content (Join-Path $evidence 'password-recovery-browser.log') -First 8
} finally {
  Remove-Item -LiteralPath $temporaryScript -ErrorAction SilentlyContinue
  $token = $null
  $tokenJson = $null
  $scriptBody = $null
  $rawOutput = $null
}

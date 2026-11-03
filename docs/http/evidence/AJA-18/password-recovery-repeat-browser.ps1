param()
$ErrorActionPreference = 'Stop'
if (-not $env:AJA_TEST_RUNTIME) { throw 'Set AJA_TEST_RUNTIME to the isolated runtime directory used by the running test API.' }
$runtimeDb = Join-Path $env:AJA_TEST_RUNTIME 'db.json'
$state = Get-Content $runtimeDb -Raw | ConvertFrom-Json
$outboxMessage = $state.outbox | Where-Object { $_.purpose -eq 'password-reset' } | Select-Object -Last 1
if (-not $outboxMessage) { throw 'No temporary password-recovery message exists in the isolated AJA-18 runtime.' }
$token = [uri]::UnescapeDataString(([uri]$outboxMessage.url).Query.Substring(7))
$sha = [Security.Cryptography.SHA256]::Create()
$digest = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($token)))).Replace('-', '').ToLowerInvariant()
$tokenRecord = $state.tokens | Where-Object { $_.hash -eq $digest -and $_.purpose -eq 'password-reset' } | Select-Object -First 1
if (-not $tokenRecord.usedAt) { throw 'The latest recovery token is not recorded as consumed; run password-recovery-browser.ps1 first.' }
$tokenJson = ConvertTo-Json -InputObject $token -Compress
$temporaryScript = Join-Path $env:TEMP 'aja18-password-recovery-repeat-browser.js'
$scriptBody = @"
async page => {
  const token = $tokenJson;
  const browser = page.context().browser();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const current = await context.newPage();
  const responses = [];
  current.on('response', response => { const url = new URL(response.url()); if (url.pathname.startsWith('/api/v1/')) responses.push({ method: response.request().method(), path: url.pathname, status: response.status() }); });
  await current.goto('http://127.0.0.1:3001/recuperar-senha?token=' + encodeURIComponent(token), { waitUntil: 'domcontentloaded' });
  await current.getByLabel('Nova senha').fill('AjaLocal-reset-2032!');
  await current.getByRole('button', { name: 'Salvar nova senha' }).click();
  await current.locator('main [role="alert"]').last().waitFor({ state: 'visible', timeout: 10000 });
  const alert = await current.locator('main [role="alert"]').last().innerText();
  if (!responses.some(item => item.method === 'POST' && item.path === '/api/v1/auth/password-resets' && item.status === 422)) throw new Error('consumed token did not receive an actual HTTP 422: ' + JSON.stringify(responses));
  if (!/Token inv.*lido ou j.*utilizado/i.test(alert)) throw new Error('consumed-token PT-BR message was not rendered: ' + alert);
  await context.close();
  return { result: 'PASS', priorTokenRepeated: true, actualResetStatus: 422, visiblePTBR: alert, responses };
}
"@
[System.IO.File]::WriteAllText($temporaryScript, $scriptBody, [System.Text.UTF8Encoding]::new($false))
try {
  $rawOutput = & playwright-cli.cmd run-code --filename=$temporaryScript 2>&1 | Out-String
  $exitCode = $LASTEXITCODE
  $match = [regex]::Match($rawOutput, '(?s)### (?:Result|Error)\r?\n.*?(?=\r?\n### Ran Playwright code|$)')
  $safeOutput = if ($match.Success) { $match.Value } else { $rawOutput }
  $safeOutput = $safeOutput -replace [regex]::Escape($token), '[REDACTED_TOKEN]' -replace 'AjaLocal-[A-Za-z0-9-]+-2031!', '[LOCAL_TEST_PASSWORD]'
  Set-Content -Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'password-recovery-repeat-browser.log') -Value $safeOutput -Encoding utf8
  if ($exitCode -ne 0) { throw 'Consumed-token browser check failed; see password-recovery-repeat-browser.log (token redacted).' }
  Get-Content (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'password-recovery-repeat-browser.log') -First 4
} finally {
  Remove-Item -LiteralPath $temporaryScript -ErrorAction SilentlyContinue
  $token = $null; $tokenJson = $null; $scriptBody = $null; $rawOutput = $null
}

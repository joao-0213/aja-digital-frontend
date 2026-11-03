$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'forum-browser.js'
$staffScriptPath = Join-Path $PSScriptRoot 'forum-staff-browser.js'
$logPath = Join-Path $PSScriptRoot 'forum-browser.log'
$studentOutput = & playwright-cli.cmd run-code --filename $scriptPath 2>&1
$studentExit = $LASTEXITCODE
$staffOutput = & playwright-cli.cmd run-code --filename $staffScriptPath 2>&1
$staffExit = $LASTEXITCODE
$requests = & playwright-cli.cmd requests 2>&1 | Where-Object { $_.ToString() -match 'api/v1/(topics|files)' }
$console = & playwright-cli.cmd console error 2>&1
$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add("Browser scenario exit codes: student=$studentExit; staff=$staffExit.")
$lines.Add('Student scenario:')
foreach ($line in $studentOutput) { $lines.Add([string]$line) }
$lines.Add('Staff archived-class scenario:')
foreach ($line in $staffOutput) { $lines.Add([string]$line) }
$lines.Add('Observed API requests:')
foreach ($line in $requests) { $lines.Add([string]$line) }
$lines.Add('Console errors (the 403 is expected from the blocked publication request):')
foreach ($line in $console) { $lines.Add([string]$line) }
$lines | ForEach-Object { $_.Replace('AjaLocal-student-2031!', '[demo password redacted]').Replace('AjaLocal-teacher-a-2031!', '[demo password redacted]') } | Set-Content -Path $logPath
if ($studentExit -ne 0 -or $staffExit -ne 0) { throw "Playwright browser validation failed. See $logPath" }
Write-Output "Browser scenarios completed. See $logPath"

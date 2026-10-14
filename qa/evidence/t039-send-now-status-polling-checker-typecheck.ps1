$ErrorActionPreference = 'Stop'
$root = 'C:\Users\product\Desktop\KnowledgeBase'
$prefix = Join-Path $root 'qa\evidence\t039-send-now-status-polling-checker-typecheck'
$files = @('apps/web/src/api/send-now.ts','apps/web/src/pages/meeting-bot/SendNowForm.tsx','apps/web/src/pages/meeting-bot/SendNowForm.test.tsx','apps/web/src/pages/meeting-bot/useSendNowStatus.ts','apps/web/src/pages/meeting-bot/useSendNowStatus.test.tsx','apps/web/src/pages/MeetingBotPage.test.tsx')
$before = @(Get-FileHash -Algorithm SHA256 $files | Select-Object Path,Hash)
$start = [DateTime]::UtcNow
$process = Start-Process -FilePath (Get-Command node).Source -ArgumentList @('node_modules/typescript/lib/tsc.js','--noEmit','-p','apps/web/tsconfig.json') -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput "$prefix.stdout.txt" -RedirectStandardError "$prefix.stderr.txt"
if (-not $process.WaitForExit(120000)) { $process.Kill($true); $process.WaitForExit(); throw 'Web typecheck exceeded outer 120 second deadline' }
$process.Refresh()
$finish = [DateTime]::UtcNow
$after = @(Get-FileHash -Algorithm SHA256 $files | Select-Object Path,Hash)
@{ command = 'node node_modules/typescript/lib/tsc.js --noEmit -p apps/web/tsconfig.json'; startedUTC = $start.ToString('o'); completedUTC = $finish.ToString('o'); seconds = ($finish - $start).TotalSeconds; exitCode = $process.ExitCode; outerTimeoutSeconds = 120; beforeSHA256 = $before; afterSHA256 = $after } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath "$prefix.receipt.json" -Encoding utf8
Get-Content -LiteralPath "$prefix.stdout.txt"
Get-Content -LiteralPath "$prefix.stderr.txt"
exit $process.ExitCode

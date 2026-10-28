$ErrorActionPreference = 'Stop'
$root = 'C:\Users\product\Desktop\KnowledgeBase'
$prefix = Join-Path $root 'qa\evidence\t039-send-now-status-polling-checker'
$start = [DateTime]::UtcNow
$args = @('--test','--test-isolation=none','--test-concurrency=1','--test-timeout=30000','--import','./.cache/coordination/safe-test-runtime/register-react.mjs','qa/evidence/t039-send-now-status-polling-checker.test.tsx')
$process = Start-Process -FilePath (Get-Command node).Source -ArgumentList $args -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput "$prefix.stdout.txt" -RedirectStandardError "$prefix.stderr.txt"
if (-not $process.WaitForExit(120000)) {
    $process.Kill($true)
    $process.WaitForExit()
    throw 'Independent checker test exceeded outer 120 second deadline'
}
$process.Refresh()
$finish = [DateTime]::UtcNow
@{ command = 'node ' + ($args -join ' '); startedUTC = $start.ToString('o'); completedUTC = $finish.ToString('o'); seconds = ($finish - $start).TotalSeconds; exitCode = $process.ExitCode; outerTimeoutSeconds = 120; candidateSHA256 = @(Get-FileHash -Algorithm SHA256 apps/web/src/api/send-now.ts,apps/web/src/pages/meeting-bot/SendNowForm.tsx,apps/web/src/pages/meeting-bot/SendNowForm.test.tsx,apps/web/src/pages/meeting-bot/useSendNowStatus.ts,apps/web/src/pages/meeting-bot/useSendNowStatus.test.tsx,apps/web/src/pages/MeetingBotPage.test.tsx | Select-Object Path,Hash) } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath "$prefix.receipt.json" -Encoding utf8
Get-Content -LiteralPath "$prefix.stdout.txt"
Get-Content -LiteralPath "$prefix.stderr.txt"
exit $process.ExitCode

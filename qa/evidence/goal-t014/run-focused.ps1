param([Parameter(Mandatory=$true)][ValidateSet('api','web')][string]$Target)
$ErrorActionPreference = 'Stop'
$repoPath = 'C:\Users\product\Desktop\KnowledgeBase'
$nodeProgram = 'C:\Users\product\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$evidencePath = Join-Path $repoPath 'qa\evidence\goal-t014'
if ($Target -eq 'api') {
  $workingPath = Join-Path $repoPath 'apps\api'
  $arguments = @('--import','tsx','--test','--test-concurrency=1','src/championship/runtime.test.ts','src/championship/mongo-store.test.ts','src/routes/championship/championship.test.ts')
} else {
  $workingPath = Join-Path $repoPath 'apps\web'
  $arguments = @('node_modules/vitest/vitest.mjs','run','src/pages/championship/client.test.ts','src/pages/championship/ChampionshipPage.test.tsx','--maxWorkers=1','--minWorkers=1')
}
$stdoutPath = Join-Path $evidencePath "cycle0-$Target.stdout.txt"
$stderrPath = Join-Path $evidencePath "cycle0-$Target.stderr.txt"
$timer = [System.Diagnostics.Stopwatch]::StartNew()
$process = Start-Process -FilePath $nodeProgram -ArgumentList $arguments -WorkingDirectory $workingPath -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
$null = $process.Handle
$timedOut = -not $process.WaitForExit(120000)
if ($timedOut) { & taskkill /PID $process.Id /T /F | Out-Null; $exitCode = 124 } else { $process.WaitForExit(); $process.Refresh(); $exitCode = $process.ExitCode; if ($null -eq $exitCode) { throw 'No process exit code available; no success receipt' } }
$timer.Stop()
$receipt = [ordered]@{ target=$Target; program=$nodeProgram; command=('"' + $nodeProgram + '" ' + ($arguments -join ' ')); cwd=$workingPath; timeoutSeconds=120; timedOut=$timedOut; exitCode=$exitCode; elapsedSeconds=$timer.Elapsed.TotalSeconds; stdout=$stdoutPath; stderr=$stderrPath; evidenceKind='source/fake-adapter/loopback/DOM only; no live provider/database/public event' }
$receipt | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $evidencePath "cycle0-$Target.receipt.json")
$receipt | ConvertTo-Json -Depth 4
exit $exitCode

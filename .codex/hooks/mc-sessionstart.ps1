# maker-checker Layer 2 -- session-start directive (pending-state aware, AUTO-CONTINUE)
# Installed under D-006 (docs/DECISIONS.md). SessionStart stdout is injected into the agent's
# context -- a directive here is read as an instruction, not just a status line.
if ($env:CLAUDE_PROJECT_DIR) { Set-Location $env:CLAUDE_PROJECT_DIR }
$LEDGER = 'qa/issues.jsonl'
$ROOT = (Get-Location).Path
$n = -1
if (Test-Path $LEDGER) { $n = @(Get-Content $LEDGER | Where-Object { $_ -match '"status":\s*"(open|Open)"' }).Count }
# Pending handshake (cycle-aware): ready-for-check with no verdict, or a verdict for an older
# cycle, or a PASS verdict whose manifest was never flipped to checked-PASS.
$pending = @(); $unclosed = @()
if (Test-Path 'qa/manifests') {
  foreach ($m in Get-ChildItem 'qa/manifests' -Filter *.md -ErrorAction SilentlyContinue) {
    $v = "qa/verdicts/" + $m.Name
    if (-not (Select-String -Path $m.FullName -Pattern 'Status: ready-for-check' -Quiet)) { continue }
    if (-not (Test-Path $v)) { $pending += $m.BaseName; continue }
    $mc = 0; $a = Select-String -Path $m.FullName -Pattern 'Fix cycle[:*\s]+(\d+)' | Select-Object -First 1
    if ($a) { $mc = [int]$a.Matches[0].Groups[1].Value }
    $vc = -1; $b = Select-String -Path $v -Pattern '(Cycle checked|Fix cycle judged)[:*\s]+(\d+)' | Select-Object -First 1
    if ($b) { $vc = [int]$b.Matches[0].Groups[2].Value }
    if ($vc -lt $mc) { $pending += $m.BaseName; continue }
    if (Select-String -Path $v -Pattern 'VERDICT:\s*PASS' -Quiet) { $unclosed += $m.BaseName }
  }
}
$queue = 0
if (Test-Path 'qa/QUEUE.md') { $queue = @(Select-String -Path 'qa/QUEUE.md' -Pattern '\|\s*TODO\s*\|').Count }
function AgeMin($f) { if (Test-Path $f) { [int]((Get-Date) - (Get-Item $f).LastWriteTime).TotalMinutes } else { -1 } }
$tickAge = AgeMin 'qa/.last-tick'; $sweepAge = AgeMin 'qa/.last-sweep'
$tickTxt = 'NEVER'; if ($tickAge -ge 0) { $tickTxt = "$tickAge min ago" }
$sweepTxt = 'NEVER'; if ($sweepAge -ge 0) { $sweepTxt = "$sweepAge min ago" }
$backlog = ($n -gt 0) -or ($queue -gt 0) -or ($pending.Count -gt 0) -or ($unclosed.Count -gt 0)
$asleep = $backlog -and (($tickAge -lt 0) -or ($tickAge -gt 120))
$openTxt = 'UNKNOWN (no ledger)'; if ($n -ge 0) { $openTxt = "$n" }
$pendTxt = ''; if ($pending.Count) { $pendTxt = ' [' + ($pending -join ', ') + ']' }
Write-Output ("MAKER-CHECKER ACTIVE: substantive dev work routes through /maker (say 'normal' to opt out). Open issues: $openTxt | Checks pending: $($pending.Count)$pendTxt | PASS not closed out: $($unclosed.Count) | Queue TODO: $queue | Last tick: $tickTxt | Last sweep: $sweepTxt | Ledger: $LEDGER")
# Discovery/repair directives (enforcement-wiring.md, Layer 2 extension)
if (Test-Path 'qa/.regrill-due') {
  $first = Get-Content 'qa/.regrill-due' -TotalCount 1
  if ($first -match '^(\d{4}-\d{2}-\d{2})') { if ([datetime]$Matches[1] -le (Get-Date)) { Write-Output ("RE-GRILL DUE: " + $first + " -- HUMAN_GATE: run /grill on that topic before continuing.") } }
}
if (Test-Path 'qa/.last-tick') {
  $lt = Get-Content 'qa/.last-tick' -TotalCount 1
  if ($lt -match 'STALLED|EXHAUSTED') {
    $unit = ($lt -split '\s+')[2]
    if (-not (Test-Path "qa/debug") -or -not (Get-ChildItem "qa/debug" -Filter "$unit-cycle*.md" -ErrorAction SilentlyContinue)) { Write-Output ("STALL UNDIAGNOSED: " + $unit + " -- run /agent-debugger on it before any new unit.") }
  }
}
if ((Test-Path 'qa/adapter.json') -and -not (Test-Path 'qa/loop.md')) { Write-Output "LOOP SPEC MISSING: qa/adapter.json exists but qa/loop.md does not -- run /loopify for this project." }
# T-017b feature-level anti-cyclic guard (mirrors the decision-level DECISION INDEX above):
# surface any removed/updated docs/FEATURES.jsonl row from the last 30 days.
if (Test-Path 'docs/FEATURES.jsonl') {
  $cutoff = (Get-Date).AddDays(-30)
  foreach ($line in Get-Content 'docs/FEATURES.jsonl') {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    try { $evt = $line | ConvertFrom-Json } catch { continue }
    if ($evt.event -ne 'removed' -and $evt.event -ne 'updated') { continue }
    try { $d = [datetime]$evt.date } catch { continue }
    if ($d -lt $cutoff) { continue }
    Write-Output ("FEATURE CHANGED: " + $evt.feature + " " + $evt.event + " on " + $evt.date + " -- " + $evt.reason)
  }
}
if (Test-Path 'qa/.paused') {
  Write-Output ("PAUSED by user: " + (Get-Content 'qa/.paused' -TotalCount 1) + " - auto-continue SUSPENDED. Do not run /maker continue; the user lifts it with /maker resume (or by deleting qa/.paused).")
} elseif ($pending.Count -or $unclosed.Count -or $asleep -or ($sweepAge -lt 0) -or ($sweepAge -gt 120)) {
  Write-Output ("AUTO-CONTINUE REQUIRED: pending maker-checker state found. Run /maker continue " + [char]34 + $ROOT + [char]34 + " BEFORE anything else this session (it reconciles close-outs, dispatches pending checks and the due sweep, then pulls the next unit and self-continues via ScheduleWakeup). Do not wait to be asked.")
}
exit 0

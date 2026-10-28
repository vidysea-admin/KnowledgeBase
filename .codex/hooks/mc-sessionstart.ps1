# maker-checker Layer 2 -- session-start directive (pending-state aware, AUTO-CONTINUE)
# Installed under D-006 (docs/DECISIONS.md). SessionStart stdout is injected into the agent's
# context -- a directive here is read as an instruction, not just a status line.
if ($env:CLAUDE_PROJECT_DIR) { Set-Location $env:CLAUDE_PROJECT_DIR }
# D-019: qa/issues.<lane>.jsonl shards are SHARDS of one ledger, not private copies -- every reader
# must count the UNION. Authorized by D-041 (Approved-by: Umesh); before this the hardcoded single
# path under-reported by 21 open rows (132 vs 153 measured 2026-09-28). Fixes the reader half of
# ISS-129 / ISS-350.
$LEDGERS = @(Get-ChildItem -Path 'qa' -Filter 'issues*.jsonl' -File -ErrorAction SilentlyContinue | Sort-Object Name)
$LEDGER = 'qa/issues*.jsonl (' + $LEDGERS.Count + ' file union)'
$ROOT = (Get-Location).Path
$n = -1
if ($LEDGERS.Count -gt 0) { $n = @($LEDGERS | ForEach-Object { Get-Content $_.FullName } | Where-Object { $_ -match '"status":\s*"(open|Open)"' }).Count }
# Pending handshake (cycle-aware): ready-for-check with no verdict, or a verdict for an older
# cycle, or a PASS verdict whose manifest was never flipped to checked-PASS.
# D-042/D-043 (Approved-by: Umesh): the canonical `**Handshake status:**` field -- vocabulary
# checked-PASS | ready-for-check | STALLED | BLOCKED | superseded | paused -- is the DERIVED,
# authoritative signal for a manifest's state, and wins when present. The legacy `Status:` forms
# (bold-field / heading / bare) are read only when no canonical field exists, so a manifest that
# predates the ISS-350 backfill is still classified correctly. A disagreement between the two is
# never silently resolved in either direction -- collected below and surfaced in the banner,
# because a mismatch usually means one field was updated by an edit that missed the other, which is
# exactly the drift D-042's own fix_direction (d) warned could happen once the field exists. Fixes
# ISS-350 reproduction 2 (this hook was structurally blind to the canonical field).
$HANDSHAKE_VOCAB = 'checked-PASS|ready-for-check|STALLED|BLOCKED|superseded|paused'
$pending = @(); $unclosed = @(); $disagreements = @()
if (Test-Path 'qa/manifests') {
  foreach ($m in Get-ChildItem 'qa/manifests' -Filter *.md -ErrorAction SilentlyContinue) {
    $v = "qa/verdicts/" + $m.Name
    # Two separate legacy questions: whether a legacy Status statement exists AT ALL (any value --
    # needed so "no legacy field yet" is never mistaken for "legacy field disagrees"), and whether
    # it specifically says ready-for-check.
    $legacyPresent = [bool](Select-String -Path $m.FullName -Pattern '^\s*(?:[-*]\s+)?(?:#{1,6}\s+)?[*_]{0,3}Status:[*_]{0,3}\s+\S' -Quiet)
    $legacyReady = [bool](Select-String -Path $m.FullName -Pattern '^\s*(?:[-*]\s+)?(?:#{1,6}\s+)?[*_]{0,3}Status:[*_]{0,3}\s+ready-for-check' -Quiet)
    $canon = Select-String -Path $m.FullName -Pattern ('^\*\*Handshake status:\*\*\s*(' + $HANDSHAKE_VOCAB + ')\b') | Select-Object -First 1
    if ($canon) {
      $canonValue = $canon.Matches[0].Groups[1].Value
      $isReady = ($canonValue -ieq 'ready-for-check')
      if ($legacyPresent -and ($isReady -ne $legacyReady)) {
        $disagreements += ($m.BaseName + ' (canonical=' + $canonValue + ', legacy Status ready-for-check=' + $legacyReady + ')')
      }
    } else {
      $isReady = $legacyReady
    }
    if (-not $isReady) { continue }
    if (-not (Test-Path $v)) { $pending += $m.BaseName; continue }
    $mc = 0; $a = Select-String -Path $m.FullName -Pattern 'Fix cycle[:*\s]+(\d+)' | Select-Object -First 1
    if ($a) { $mc = [int]$a.Matches[0].Groups[1].Value }
    $vc = -1
    foreach ($bm in (Select-String -Path $v -Pattern '(Cycle checked|Fix cycle judged)[:*\s]+(\d+)')) {
      foreach ($mm in $bm.Matches) {
        $cv = [int]$mm.Groups[2].Value
        if ($cv -gt $vc) { $vc = $cv }
      }
    }
    if ($vc -lt $mc) { $pending += $m.BaseName; continue }
    # Widened per the 2026-09-28 checker consolidation sweep: the existing 'VERDICT:\s*PASS' anchor
    # is already case-insensitive by PowerShell default (catches 'Verdict: PASS' too -- confirmed,
    # not re-litigated), but it cannot see the ~12 files using `**Result: PASS**` or the files that
    # write a bare `**PASS**` with no field label at all. Both are added as alternates, not as a
    # replacement, so the existing match keeps matching exactly what it always matched.
    if (Select-String -Path $v -Pattern 'VERDICT:\s*PASS|Result:\s*PASS|\*\*PASS\*\*' -Quiet) { $unclosed += $m.BaseName }
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
if ($disagreements.Count) {
  Write-Output ("HANDSHAKE DISAGREEMENT: " + ($disagreements -join '; ') + " -- canonical **Handshake status:** field wins per D-042; the legacy Status line was not updated to match. Investigate before trusting Checks pending / PASS not closed out for these slugs.")
}
# Discovery/repair directives (enforcement-wiring.md, Layer 2 extension)
if (Test-Path 'qa/.regrill-due') {
  $first = Get-Content 'qa/.regrill-due' -TotalCount 1
  if ($first -match '^(\d{4}-\d{2}-\d{2})') { if ([datetime]$Matches[1] -le (Get-Date)) { Write-Output ("RE-GRILL DUE: " + $first + " -- HUMAN_GATE: run /grill on that topic before continuing.") } }
}
# ISS-307 fix, authorized by D-050-SPEAKER ruling 2 (Approved-by: Umesh; see D-051 - two entries share the number D-050). Two defects, both measured
# 2026-09-28 against this repo's own qa/.last-tick (470 lines):
#   (1) -TotalCount 1 read the OLDEST line of an append-only oldest-first file, so the banner
#       reported a tick from 2026-09-24 while the newest was 2026-09-28. Now reads the LAST line.
#   (2) -match 'STALLED|EXHAUSTED' substring-matched that word anywhere in the tick's PROSE. The
#       oldest line carries 'STALLED' at character offset 316 of 361 while its actual status is
#       ADVANCED -- which is why 'STALL UNDIAGNOSED: ADVANCED' printed at every session start.
#       The status is positionally the 3rd whitespace token (<iso> <sep> <STATUS>), so test THAT
#       token exactly rather than scanning the whole line.
# Deliberately NOT splitting on the middot separator: PowerShell 5.1 mis-decodes this UTF-8
# file's middot, so a separator-based split is encoding-fragile. The positional token is not.
if (Test-Path 'qa/.last-tick') {
  $ltAll = @(Get-Content 'qa/.last-tick')
  $lt = ''
  if ($ltAll.Count -gt 0) { $lt = $ltAll[$ltAll.Count - 1] }
  $status = ($lt -split '\s+')[2]
  if ($status -match '^(STALLED|EXHAUSTED)$') {
    $unit = $status
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

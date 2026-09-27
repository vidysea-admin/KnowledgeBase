# Re-runnable fixture test for D-034 (mc-hooks bolded-status fix).
# Verifies mc-sessionstart.ps1 / mc-precommit.ps1 see bolded/heading/list-marker manifest Status
# lines, ignore mid-line prose mentions, and take the MAXIMUM verdict cycle, not the first.
#
# Lives OUTSIDE the enforcement paths (qa/tests/, not .claude/hooks/) per the unit brief.
#
# D-020 (mutation-run safety): this script temporarily overwrites the two enforcement hooks with
# their pre-fix (22b6eb6) content to prove the fixtures fail BEFORE the fix, then restores the
# working tree's actual content from an in-memory byte backup inside a try/finally that fires on
# timeout, error AND the success path, and verifies the restore with Get-FileHash (the ps
# equivalent of cmp). Each hook invocation runs inside Start-Job with Wait-Job -Timeout.
#
# Usage: pwsh -File qa/tests/mc-hooks-bolded-status.ps1   (or: powershell -File ...)

$ErrorActionPreference = 'Stop'
$repoRoot = (& git rev-parse --show-toplevel).Trim()
$sessionHook   = Join-Path $repoRoot '.claude/hooks/mc-sessionstart.ps1'
$precommitHook = Join-Path $repoRoot '.claude/hooks/mc-precommit.ps1'
$baselineRef = '22b6eb6'

# ---------------------------------------------------------------------------
# Fixture corpus
# ---------------------------------------------------------------------------
function New-Fixtures {
  param([string]$Dir)
  Remove-Item $Dir -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Path (Join-Path $Dir 'qa/manifests') -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $Dir 'qa/verdicts')  -Force | Out-Null

  Set-Content -NoNewline -Path (Join-Path $Dir 'qa/manifests/fixture-bolded.md') -Value @'
# Unit fixture-bolded

**Status:** ready-for-check
**Fix cycle:** 1
'@

  Set-Content -NoNewline -Path (Join-Path $Dir 'qa/manifests/fixture-unbolded.md') -Value @'
# Unit fixture-unbolded

Status: ready-for-check
Fix cycle: 1
'@

  Set-Content -NoNewline -Path (Join-Path $Dir 'qa/manifests/fixture-heading.md') -Value @'
# Unit fixture-heading

## Status: ready-for-check
Fix cycle: 1
'@

  Set-Content -NoNewline -Path (Join-Path $Dir 'qa/manifests/fixture-listmarker.md') -Value @'
# Unit fixture-listmarker

- **Status:** ready-for-check
- **Fix cycle:** 1
'@

  Set-Content -NoNewline -Path (Join-Path $Dir 'qa/manifests/fixture-prose-negative.md') -Value @'
# Unit fixture-prose-negative

**Status:** checked-PASS

Notes: this unit is not ready-for-check anymore; see history.
Previous status: ready-for-check (cycle 1), superseded.
'@

  Set-Content -NoNewline -Path (Join-Path $Dir 'qa/manifests/fixture-maxcycle.md') -Value @'
# Unit fixture-maxcycle

**Status:** ready-for-check
**Fix cycle:** 2
'@

  Set-Content -NoNewline -Path (Join-Path $Dir 'qa/verdicts/fixture-maxcycle.md') -Value @'
# Verdict - fixture-maxcycle

**Cycle checked:** 1
VERDICT: FAIL

... later re-check ...

**Cycle checked:** 2
VERDICT: PASS
'@
}

# ---------------------------------------------------------------------------
# Hook runners (timeout-wrapped, D-020)
# ---------------------------------------------------------------------------
function Invoke-SessionStart {
  param([string]$WorkDir, [int]$TimeoutSec = 20)
  $job = Start-Job -ScriptBlock {
    param($HookPath, $WorkDir)
    Set-Location $WorkDir
    $env:CLAUDE_PROJECT_DIR = $WorkDir
    & $HookPath
  } -ArgumentList $sessionHook, $WorkDir
  if (-not (Wait-Job $job -Timeout $TimeoutSec)) {
    Stop-Job $job; Remove-Job $job -Force
    throw "TIMEOUT: mc-sessionstart.ps1 exceeded ${TimeoutSec}s"
  }
  $out = Receive-Job $job
  Remove-Job $job
  return ($out -join "`n")
}

function Invoke-Precommit {
  param([string]$WorkDir, [string]$InputJson, [int]$TimeoutSec = 20)
  $job = Start-Job -ScriptBlock {
    param($HookPath, $WorkDir, $InputJson)
    Set-Location $WorkDir
    $env:CLAUDE_PROJECT_DIR = $WorkDir
    & $HookPath -InputJson $InputJson
  } -ArgumentList $precommitHook, $WorkDir, $InputJson
  if (-not (Wait-Job $job -Timeout $TimeoutSec)) {
    Stop-Job $job; Remove-Job $job -Force
    throw "TIMEOUT: mc-precommit.ps1 exceeded ${TimeoutSec}s"
  }
  $out = Receive-Job $job
  Remove-Job $job
  return ($out -join "`n")
}

# ---------------------------------------------------------------------------
# Assertions
# ---------------------------------------------------------------------------
function Get-BracketNames {
  param([string]$Text, [string]$Label)
  # e.g. "Checks pending: 4 [fixture-bolded, fixture-unbolded, ...]"
  $m = [regex]::Match($Text, [regex]::Escape($Label) + ':\s*(\d+)\s*(\[[^\]]*\])?')
  if (-not $m.Success) { return @{ Count = -1; Names = @() } }
  $names = @()
  if ($m.Groups[2].Success) {
    $names = $m.Groups[2].Value.Trim('[',']') -split ',\s*' | Where-Object { $_ -ne '' }
  }
  return @{ Count = [int]$m.Groups[1].Value; Names = $names }
}

function Get-WarnCount {
  param([string]$Text)
  $m = [regex]::Match($Text, 'WARN maker-checker:\s*(\d+)\s*unit')
  if ($m.Success) { return [int]$m.Groups[1].Value }
  return 0
}

function Assert-SetEqual {
  param([string]$Case, [object[]]$Expected, [object[]]$Actual)
  $exp = @($Expected | Sort-Object)
  $act = @($Actual | Sort-Object)
  $ok = ($exp -join ',') -eq ($act -join ',')
  [pscustomobject]@{ Case = $Case; Pass = $ok; Expected = ($exp -join ', '); Actual = ($act -join ', ') }
}

function Run-Suite {
  param([string]$Label)
  $fixtureDir = Join-Path ([System.IO.Path]::GetTempPath()) ("mc-hooks-fixture-" + [guid]::NewGuid())
  New-Fixtures -Dir $fixtureDir
  try {
    $ssOut = Invoke-SessionStart -WorkDir $fixtureDir
    $pending  = Get-BracketNames -Text $ssOut -Label 'Checks pending'
    $unclosed = Get-BracketNames -Text $ssOut -Label 'PASS not closed out'

    $pcOut = Invoke-Precommit -WorkDir $fixtureDir -InputJson 'git commit -m "test"'
    $warnCount = Get-WarnCount -Text $pcOut

    return [pscustomobject]@{
      Label            = $Label
      SessionStartOut  = $ssOut
      PrecommitOut     = $pcOut
      PendingCount     = $pending.Count
      PendingNames     = $pending.Names
      UnclosedCount    = $unclosed.Count
      UnclosedNames    = $unclosed.Names
      PrecommitWarn    = $warnCount
    }
  } finally {
    Remove-Item $fixtureDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}

# ---------------------------------------------------------------------------
# Main: run BASELINE (pre-fix, 22b6eb6) then FIXED (working tree), byte-safe
# ---------------------------------------------------------------------------
$backupDir = Join-Path ([System.IO.Path]::GetTempPath()) ("mc-hooks-backup-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
$sessionBackup   = Join-Path $backupDir 'mc-sessionstart.ps1.orig'
$precommitBackup = Join-Path $backupDir 'mc-precommit.ps1.orig'
Copy-Item $sessionHook   $sessionBackup   -Force
Copy-Item $precommitHook $precommitBackup -Force
$sessionHashBefore   = (Get-FileHash $sessionBackup).Hash
$precommitHashBefore = (Get-FileHash $precommitBackup).Hash

$baselineResult = $null
$fixedResult    = $null
$restoreOk      = $false

try {
  # ---- arm: write pre-fix (22b6eb6) content over the working hooks ----
  $baselineSessionBlob   = Join-Path $backupDir 'mc-sessionstart.ps1.baseline'
  $baselinePrecommitBlob = Join-Path $backupDir 'mc-precommit.ps1.baseline'
  & git -C $repoRoot show "${baselineRef}:.claude/hooks/mc-sessionstart.ps1" | Out-File -Encoding utf8 -FilePath $baselineSessionBlob
  & git -C $repoRoot show "${baselineRef}:.claude/hooks/mc-precommit.ps1"   | Out-File -Encoding utf8 -FilePath $baselinePrecommitBlob
  Copy-Item $baselineSessionBlob   $sessionHook   -Force
  Copy-Item $baselinePrecommitBlob $precommitHook -Force
  Start-Sleep -Milliseconds 300  # let the filesystem settle before a child process reads the swapped file

  $baselineResult = Run-Suite -Label 'BASELINE (pre-fix, 22b6eb6)'
}
finally {
  # ---- disarm: restore the working tree's real (fixed) hook content ----
  Copy-Item $sessionBackup   $sessionHook   -Force
  Copy-Item $precommitBackup $precommitHook -Force
  Start-Sleep -Milliseconds 300  # same settle margin as the arm step
  $sessionHashAfter   = (Get-FileHash $sessionHook).Hash
  $precommitHashAfter = (Get-FileHash $precommitHook).Hash
  $restoreOk = ($sessionHashAfter -eq $sessionHashBefore) -and ($precommitHashAfter -eq $precommitHashBefore)
  if (-not $restoreOk) {
    Write-Output "RESTORE FAILED -- hashes: session before=$sessionHashBefore after=$sessionHashAfter | precommit before=$precommitHashBefore after=$precommitHashAfter"
  }
}

if (-not $restoreOk) { throw "ABORT: hook restore verification failed; refusing to continue." }
Write-Output ("RESTORE VERIFIED byte-identical (Get-FileHash): mc-sessionstart.ps1=$sessionHashAfter mc-precommit.ps1=$precommitHashAfter")

$fixedResult = Run-Suite -Label 'FIXED (this unit, working tree)'

# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
Write-Output ''
Write-Output '=== RAW OUTPUT: BASELINE (pre-fix, 22b6eb6) ==='
Write-Output $baselineResult.SessionStartOut
Write-Output $baselineResult.PrecommitOut
Write-Output ''
Write-Output '=== RAW OUTPUT: FIXED (working tree) ==='
Write-Output $fixedResult.SessionStartOut
Write-Output $fixedResult.PrecommitOut
Write-Output ''

$cases = @()
# ISS-176 class: bolded / heading / list-marker Status lines must be SEEN.
$cases += Assert-SetEqual -Case 'ISS-176 baseline MISSES bolded+listmarker (pending)' -Expected @('fixture-heading','fixture-prose-negative','fixture-unbolded') -Actual $baselineResult.PendingNames
$cases += Assert-SetEqual -Case 'ISS-176/183 fixed SEES bolded+heading+listmarker+unbolded (pending)' -Expected @('fixture-bolded','fixture-heading','fixture-listmarker','fixture-unbolded') -Actual $fixedResult.PendingNames
# Anchoring: prose ("not ready-for-check", "Previous status: ready-for-check") must NOT false-match.
$cases += [pscustomobject]@{ Case = 'Anchoring: fixed excludes prose-negative from pending'; Pass = ($fixedResult.PendingNames -notcontains 'fixture-prose-negative'); Expected='excluded'; Actual = ($fixedResult.PendingNames -join ', ') }
$cases += [pscustomobject]@{ Case = 'Anchoring regression check: baseline WRONGLY includes prose-negative (false positive fixed)'; Pass = ($baselineResult.PendingNames -contains 'fixture-prose-negative'); Expected='included (bug)'; Actual = ($baselineResult.PendingNames -join ', ') }
# ISS-183 max-cycle class: fixture-maxcycle (Fix cycle 2, verdict has Cycle checked 1 then 2, PASS).
# NOTE: the hook's own Write-Output line never brackets unclosed *names* (only pending gets a
# [list]), so this is asserted on the numeric UnclosedCount / PendingCount, not a name list.
$cases += [pscustomobject]@{ Case = 'ISS-183 baseline: maxcycle invisible (bolded Status unseen -> not in pending, not in unclosed)'; Pass = (($baselineResult.PendingNames -notcontains 'fixture-maxcycle') -and ($baselineResult.UnclosedCount -eq 0)); Expected='pending excludes it, unclosed count=0'; Actual = "pending=[$($baselineResult.PendingNames -join ', ')] unclosedCount=$($baselineResult.UnclosedCount)" }
$cases += [pscustomobject]@{ Case = 'ISS-183 fixed: maxcycle resolved via MAX cycle (2) not first (1) -- correctly unclosed-PASS, not pending'; Pass = (($fixedResult.PendingNames -notcontains 'fixture-maxcycle') -and ($fixedResult.UnclosedCount -eq 1)); Expected='pending excludes it, unclosed count=1'; Actual = "pending=[$($fixedResult.PendingNames -join ', ')] unclosedCount=$($fixedResult.UnclosedCount)" }
# mc-precommit.ps1 WARN count (status pattern only)
$cases += [pscustomobject]@{ Case = 'mc-precommit baseline WARN count (expected 3: unbolded, heading, prose-negative false-positive)'; Pass = ($baselineResult.PrecommitWarn -eq 3); Expected = 3; Actual = $baselineResult.PrecommitWarn }
$cases += [pscustomobject]@{ Case = 'mc-precommit fixed WARN count (expected 5: bolded, unbolded, heading, listmarker, maxcycle)'; Pass = ($fixedResult.PrecommitWarn -eq 5); Expected = 5; Actual = $fixedResult.PrecommitWarn }

Write-Output '=== ASSERTIONS ==='
$cases | ForEach-Object {
  $tag = if ($_.Pass) { 'PASS' } else { 'FAIL' }
  Write-Output ("[$tag] $($_.Case) -- expected=[$($_.Expected)] actual=[$($_.Actual)]")
}
$failCount = @($cases | Where-Object { -not $_.Pass }).Count
Write-Output ''
Write-Output ("TOTAL: $($cases.Count) checks, $failCount failed.")
if ($failCount -gt 0) { exit 1 }
exit 0

# Regression test -- ISS-307: mc-sessionstart.ps1's stall check must read the NEWEST tick line of an
# append-only oldest-first file, and must test the STATUS FIELD rather than substring-matching
# 'STALLED' anywhere in that tick's prose.
# Authorized by D-050 ruling 2 (Approved-by: Umesh).
#
# Runs the REAL hook against throwaway project trees -- never reads or writes this repo's qa/.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File qa/tests/mc-hooks-stall-detect.ps1
# Exit 0 = all assertions pass; exit 1 = a failure (message says which).

$ErrorActionPreference = 'Stop'
$hook = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) '.claude/hooks/mc-sessionstart.ps1'
if (-not (Test-Path $hook)) { Write-Output "FAIL: hook not found at $hook"; exit 1 }

$fails = 0
function Check($name, $cond, $detail) {
  if ($cond) { Write-Output "  PASS  $name" }
  else { Write-Output "  FAIL  $name -- $detail"; $script:fails++ }
}

$SEP = [char]0x00B7   # the middot this repo uses as its tick field separator

# Runs the real hook over a temp tree whose qa/.last-tick holds $lines, returns stdout.
function RunHook($lines) {
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("lkb-stall-" + [guid]::NewGuid().ToString('N').Substring(0,8))
  New-Item -ItemType Directory -Path (Join-Path $tmp 'qa') -Force | Out-Null
  try {
    Set-Content -Path (Join-Path $tmp 'qa/.last-tick') -Value $lines -Encoding utf8
    $env:CLAUDE_PROJECT_DIR = $tmp
    return (& powershell -NoProfile -ExecutionPolicy Bypass -File $hook 2>&1 | Out-String)
  } finally {
    Remove-Item 'Env:\CLAUDE_PROJECT_DIR' -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  }
}

$advanced = "2026-09-24T21:56:12+05:30 $SEP ADVANCED $SEP ordinary tick"
# The ISS-307 shape: status is ADVANCED, but the PROSE mentions STALLED (as this repo's real ticks do).
$proseStall = "2026-09-26T10:00:00+05:30 $SEP ADVANCED $SEP reset the 2 STALLED units per D-041 ruling 5"
$realStall  = "2026-09-27T11:00:00+05:30 $SEP STALLED $SEP max fix cycles hit on the only available unit"
$realExh    = "2026-09-27T12:00:00+05:30 $SEP EXHAUSTED $SEP token bound hit"

# 1. THE BUG: prose containing 'STALLED' on an ADVANCED tick must NOT raise the banner.
$out = RunHook @($proseStall)
Check "prose mentioning STALLED on an ADVANCED tick raises NO stall banner (ISS-307)" `
      (-not ($out -match 'STALL UNDIAGNOSED')) `
      ("banner fired on prose; got: " + (($out -split "`n") | Where-Object { $_ -match 'STALL' }))

# 2. THE OTHER HALF: oldest line STALLED, newest ADVANCED -> reads the NEWEST, so no banner.
$out = RunHook @($realStall, $advanced)
Check "reads the NEWEST tick line, not the oldest (no banner when newest is ADVANCED)" `
      (-not ($out -match 'STALL UNDIAGNOSED')) `
      ("banner fired from an older line; got: " + (($out -split "`n") | Where-Object { $_ -match 'STALL' }))

# 3. NOT BROKEN THE OTHER WAY: a genuine STALLED as the newest line MUST still raise it.
$out = RunHook @($advanced, $realStall)
Check "a genuine STALLED newest tick DOES raise the banner, naming STALLED" `
      (($out -match 'STALL UNDIAGNOSED') -and ($out -match 'STALL UNDIAGNOSED:\s*STALLED')) `
      ("expected 'STALL UNDIAGNOSED: STALLED'; got: " + (($out -split "`n") | Where-Object { $_ -match 'STALL' }))

# 4. EXHAUSTED is the other real stall state and must behave the same.
$out = RunHook @($advanced, $realExh)
Check "a genuine EXHAUSTED newest tick DOES raise the banner, naming EXHAUSTED" `
      ($out -match 'STALL UNDIAGNOSED:\s*EXHAUSTED') `
      ("expected 'STALL UNDIAGNOSED: EXHAUSTED'; got: " + (($out -split "`n") | Where-Object { $_ -match 'STALL' }))

if ($fails -gt 0) { Write-Output "RESULT: FAIL ($fails assertion(s))"; exit 1 }
Write-Output 'RESULT: PASS (4/4 assertions)'
exit 0

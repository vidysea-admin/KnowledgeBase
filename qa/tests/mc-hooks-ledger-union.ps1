# Regression test -- ISS-129 / ISS-350 reader half: mc-sessionstart.ps1 must count the UNION of
# qa/issues.jsonl + qa/issues.<lane>.jsonl shards (D-019), not the single canonical file.
# Authorized by D-041 (Approved-by: Umesh).
#
# Runs the REAL hook against a throwaway project tree -- never touches this repo's ledger.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File qa/tests/mc-hooks-ledger-union.ps1
#    or: ... -File qa/tests/mc-hooks-ledger-union.ps1 -HookPath .codex/hooks/mc-sessionstart.ps1
#        (codex-hooks-links, 2026-09-28: proves the .codex mirror behaves identically, not just
#        textually -- pass a path relative to the repo root, or absolute)
# Exit 0 = all assertions pass; exit 1 = a failure (message says which).

param(
  [string]$HookPath = '.claude/hooks/mc-sessionstart.ps1'
)

$ErrorActionPreference = 'Stop'
$REPO_ROOT = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$hook = $HookPath
if (-not [System.IO.Path]::IsPathRooted($hook)) { $hook = Join-Path $REPO_ROOT $HookPath }
if (-not (Test-Path $hook)) { Write-Output "FAIL: hook not found at $hook"; exit 1 }

$fails = 0
function Check($name, $cond, $detail) {
  if ($cond) { Write-Output "  PASS  $name" }
  else { Write-Output "  FAIL  $name -- $detail"; $script:fails++ }
}

# Build a throwaway project tree with a canonical ledger + two lane shards.
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("lkb-union-" + [guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path (Join-Path $tmp 'qa') -Force | Out-Null
try {
  $open   = '{"id":"ISS-X","status":"open","severity":"high","title":"t"}'
  $closed = '{"id":"ISS-Y","status":"fixed","severity":"low","title":"t"}'

  # canonical: 2 open, 1 fixed
  Set-Content -Path (Join-Path $tmp 'qa/issues.jsonl') -Value @($open, $open, $closed) -Encoding utf8
  # lane shard A: 3 open
  Set-Content -Path (Join-Path $tmp 'qa/issues.lanea.jsonl') -Value @($open, $open, $open) -Encoding utf8
  # lane shard B: 1 open, 1 fixed
  Set-Content -Path (Join-Path $tmp 'qa/issues.laneb.jsonl') -Value @($open, $closed) -Encoding utf8
  # a decoy that must NOT be counted (wrong name shape)
  Set-Content -Path (Join-Path $tmp 'qa/archive-issues-old.jsonl') -Value @($open, $open) -Encoding utf8

  $env:CLAUDE_PROJECT_DIR = $tmp
  $out = & powershell -NoProfile -ExecutionPolicy Bypass -File $hook 2>&1 | Out-String

  # 2 + 3 + 1 = 6 open across the three issues*.jsonl files; the decoy's 2 are excluded.
  Check 'counts the union (6), not the canonical file alone (2)' `
        ($out -match 'Open issues:\s*6\b') `
        ("expected 'Open issues: 6'; got: " + ($out -split "`n")[0])

  Check 'reports how many files the union covered (3)' `
        ($out -match '3 file union') `
        ("expected '3 file union' in the Ledger field; got: " + ($out -split "`n")[0])

  Check 'excludes files not matching issues*.jsonl' `
        (-not ($out -match 'Open issues:\s*8\b')) `
        'archive-issues-old.jsonl was counted -- glob is too wide'

  # No ledger at all must stay UNKNOWN, not 0 -- preserves pre-fix semantics.
  $tmp2 = Join-Path ([System.IO.Path]::GetTempPath()) ("lkb-union-empty-" + [guid]::NewGuid().ToString('N').Substring(0,8))
  New-Item -ItemType Directory -Path (Join-Path $tmp2 'qa') -Force | Out-Null
  try {
    $env:CLAUDE_PROJECT_DIR = $tmp2
    $out2 = & powershell -NoProfile -ExecutionPolicy Bypass -File $hook 2>&1 | Out-String
    Check 'no ledger present still reports UNKNOWN, not 0' `
          ($out2 -match 'UNKNOWN \(no ledger\)') `
          ("expected 'UNKNOWN (no ledger)'; got: " + ($out2 -split "`n")[0])
  } finally { Remove-Item -Recurse -Force $tmp2 -ErrorAction SilentlyContinue }
}
finally {
  Remove-Item 'Env:\CLAUDE_PROJECT_DIR' -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

if ($fails -gt 0) { Write-Output "RESULT: FAIL ($fails assertion(s))"; exit 1 }
Write-Output 'RESULT: PASS (4/4 assertions)'
exit 0

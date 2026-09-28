# Regression test -- ISS-350 reproduction 2: mc-sessionstart.ps1's manifest-pending scan and its
# PASS-not-closed-out check must key on the canonical `**Handshake status:**` field (D-042 vocabulary:
# checked-PASS | ready-for-check | STALLED | BLOCKED | superseded | paused), not only the legacy
# `Status:` forms. Authorized by D-043 (Approved-by: Umesh) -- unit handshake-field-reader.
#
# Runs the REAL hook against throwaway project trees -- never touches this repo's manifests/verdicts.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File qa/tests/mc-hooks-handshake-field.ps1
# Exit 0 = all assertions pass; exit 1 = a failure (message says which).

$ErrorActionPreference = 'Stop'
$hook = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) '.claude/hooks/mc-sessionstart.ps1'
if (-not (Test-Path $hook)) { Write-Output "FAIL: hook not found at $hook"; exit 1 }

$fails = 0
$total = 0
function Check($name, $cond, $detail) {
  $script:total++
  if ($cond) { Write-Output "  PASS  $name" }
  else { Write-Output "  FAIL  $name -- $detail"; $script:fails++ }
}

function NewTree() {
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("lkb-handshake-" + [guid]::NewGuid().ToString('N').Substring(0,8))
  New-Item -ItemType Directory -Path (Join-Path $tmp 'qa/manifests') -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $tmp 'qa/verdicts') -Force | Out-Null
  return $tmp
}
function RunHook($tmp) {
  $env:CLAUDE_PROJECT_DIR = $tmp
  return (& powershell -NoProfile -ExecutionPolicy Bypass -File $hook 2>&1 | Out-String)
}
# The banner names PENDING slugs in a bracketed list ("Checks pending: N [a, b]") but never names
# UNCLOSED ones -- it only prints their count. This helper scopes a membership check to the
# pending bracket alone, so a slug that legitimately appears elsewhere in the output (e.g. inside
# the separate HANDSHAKE DISAGREEMENT line) cannot make a pending-membership assertion pass or fail
# for the wrong reason.
function PendingBracket($out) {
  $m = [regex]::Match($out, 'Checks pending:\s*\d+\s*(\[[^\]]*\])?')
  if ($m.Success -and $m.Groups[1].Success) { return $m.Groups[1].Value }
  return ''
}
function UnclosedCount($out) {
  $m = [regex]::Match($out, 'PASS not closed out:\s*(\d+)')
  if ($m.Success) { return [int]$m.Groups[1].Value }
  return -1
}

# ---------------------------------------------------------------------------
# Group 1: pending detection must key on the canonical field, including the
# case ISS-350 disclosed does not exist LIVE today (D-042: every current
# manifest that has the canonical field also has a legacy statement it was
# derived from) -- so this is a CONSTRUCTED fixture, not a live reproduction,
# and is reported here as exactly that.
# ---------------------------------------------------------------------------
$tmp1 = NewTree
try {
  # (a) canonical field ONLY, no legacy Status statement anywhere -- the blind
  #     spot ISS-350 fix_direction (d) names and D-042 disclosed as latent.
  Set-Content -Path (Join-Path $tmp1 'qa/manifests/canon-only-ready.md') -Value @(
    '# Manifest — canon-only-ready', '', '**Handshake status:** ready-for-check'
  ) -Encoding utf8

  # (b) canonical field ONLY, checked-PASS -- must NOT be pending.
  Set-Content -Path (Join-Path $tmp1 'qa/manifests/canon-only-pass.md') -Value @(
    '# Manifest — canon-only-pass', '', '**Handshake status:** checked-PASS'
  ) -Encoding utf8

  # (c) canonical AND legacy present and AGREE (ready) -- normal post-D-042 shape.
  Set-Content -Path (Join-Path $tmp1 'qa/manifests/agree-ready.md') -Value @(
    '# Manifest — agree-ready', '', '## Status: ready-for-check', '',
    '**Handshake status:** ready-for-check'
  ) -Encoding utf8

  $out1 = RunHook $tmp1
  Check 'canonical-only ready-for-check is pending (constructed blind-spot case)' `
        ((PendingBracket $out1) -match 'canon-only-ready') `
        ("expected 'canon-only-ready' in the pending bracket; got: " + (PendingBracket $out1))
  Check 'canonical-only checked-PASS is NOT pending' `
        ((PendingBracket $out1) -notmatch 'canon-only-pass') `
        ("did not expect 'canon-only-pass' in the pending bracket; got: " + (PendingBracket $out1))
  Check 'canonical + legacy agreeing on ready-for-check is pending' `
        ((PendingBracket $out1) -match 'agree-ready') `
        ("expected 'agree-ready' in the pending bracket; got: " + (PendingBracket $out1))
  Check 'no disagreement is reported when canonical and legacy agree' `
        ($out1 -notmatch 'HANDSHAKE DISAGREEMENT') `
        ("did not expect a disagreement line; got: " + ($out1 -split "`n" | Select-String 'HANDSHAKE DISAGREEMENT'))
} finally { Remove-Item -Recurse -Force $tmp1 -ErrorAction SilentlyContinue }

# ---------------------------------------------------------------------------
# Group 2: precedence + disagreement surfacing. Canonical wins the pending/
# not-pending call in BOTH directions; the mismatch is never silently
# dropped -- it prints as a named HANDSHAKE DISAGREEMENT line.
# ---------------------------------------------------------------------------
$tmp2 = NewTree
try {
  # legacy says ready-for-check, canonical says checked-PASS -> canonical wins -> NOT pending.
  Set-Content -Path (Join-Path $tmp2 'qa/manifests/disagree-canon-pass.md') -Value @(
    '# Manifest — disagree-canon-pass', '', '## Status: ready-for-check', '',
    '**Handshake status:** checked-PASS — closed out after the heading above went stale'
  ) -Encoding utf8

  # legacy says checked-PASS, canonical says ready-for-check -> canonical wins -> IS pending.
  Set-Content -Path (Join-Path $tmp2 'qa/manifests/disagree-canon-ready.md') -Value @(
    '# Manifest — disagree-canon-ready', '', '## Status: checked-PASS', '',
    '**Handshake status:** ready-for-check — reopened after the heading above was left stale'
  ) -Encoding utf8

  $out2 = RunHook $tmp2
  Check 'disagreement (legacy ready, canonical PASS): canonical wins -> NOT pending' `
        ((PendingBracket $out2) -notmatch 'disagree-canon-pass') `
        ("did not expect 'disagree-canon-pass' in the pending bracket; got: " + (PendingBracket $out2))
  Check 'disagreement (legacy PASS, canonical ready): canonical wins -> IS pending' `
        ((PendingBracket $out2) -match 'disagree-canon-ready') `
        ("expected 'disagree-canon-ready' in the pending bracket; got: " + (PendingBracket $out2))
  Check 'both disagreements are named in a HANDSHAKE DISAGREEMENT line' `
        (($out2 -match 'HANDSHAKE DISAGREEMENT') -and ($out2 -match 'disagree-canon-pass') -and ($out2 -match 'disagree-canon-ready')) `
        ("expected both slugs in a disagreement line; got: " + ($out2 -split "`n" | Select-String 'HANDSHAKE DISAGREEMENT'))
} finally { Remove-Item -Recurse -Force $tmp2 -ErrorAction SilentlyContinue }

# ---------------------------------------------------------------------------
# Group 3: every D-042 vocabulary value parses without error and none except
# ready-for-check register as pending.
# ---------------------------------------------------------------------------
$tmp3 = NewTree
try {
  $vocab = @('checked-PASS', 'ready-for-check', 'STALLED', 'BLOCKED', 'superseded', 'paused')
  foreach ($v in $vocab) {
    $slug = 'vocab-' + ($v.ToLower() -replace '[^a-z]', '')
    $mFile = Join-Path $tmp3 ('qa/manifests/' + $slug + '.md')
    # NOTE: each element is built via double-quoted interpolation, not `'lit' + $var,` inside the
    # array literal -- this PowerShell mis-parses a `+`-concatenated element sitting in a comma list
    # (confirmed empirically: `@('a' + 'x', '', 'b' + 'y')` collapses to ONE element, "ax  by",
    # instead of three). Interpolation sidesteps it entirely.
    Set-Content -Path $mFile -Value @("# Manifest $slug", '', "**Handshake status:** $v") -Encoding utf8
  }
  $out3 = RunHook $tmp3
  Check 'all six vocabulary values parse without hook error (no exception text, exit handled)' `
        ($out3 -match 'MAKER-CHECKER ACTIVE') `
        ("hook did not print its banner -- likely threw; got: " + $out3)
  foreach ($v in $vocab) {
    $slug = 'vocab-' + ($v.ToLower() -replace '[^a-z]', '')
    $expectPending = ($v -eq 'ready-for-check')
    Check ("vocabulary value '$v' pending=$expectPending") `
          (((PendingBracket $out3) -match $slug) -eq $expectPending) `
          ("slug '$slug' pending-membership did not match expected $expectPending; pending bracket: " + (PendingBracket $out3))
  }
} finally { Remove-Item -Recurse -Force $tmp3 -ErrorAction SilentlyContinue }

# ---------------------------------------------------------------------------
# Group 4: PASS-not-closed-out widened forms (checker consolidation sweep,
# 2026-09-28: `**Result: PASS**` in ~12 files, bare `**PASS**` in ~9 more) --
# and the pre-existing case-insensitive `Verdict: PASS` match must SURVIVE.
# ---------------------------------------------------------------------------
# The banner prints only the UNCLOSED *count*, never the slugs (unlike the pending bracket), so
# each case below gets its OWN throwaway tree and is judged by the exact count -- 1 for a real
# unclosed-PASS, 0 for a control that must not false-positive.
function UnclosedCaseCount($verdictBody) {
  $t = NewTree
  try {
    Set-Content -Path (Join-Path $t 'qa/manifests/u.md') -Value @('# Manifest u', '', '**Fix cycle:** 1 of max 3', '', '## Status: ready-for-check') -Encoding utf8
    Set-Content -Path (Join-Path $t 'qa/verdicts/u.md') -Value @('**Cycle checked:** 1', $verdictBody) -Encoding utf8
    return (UnclosedCount (RunHook $t))
  } finally { Remove-Item -Recurse -Force $t -ErrorAction SilentlyContinue }
}
Check 'pre-existing form VERDICT: PASS still counted (no regression)' ((UnclosedCaseCount 'VERDICT: PASS') -eq 1) `
      'expected PASS not closed out: 1 for a bare VERDICT: PASS verdict'
Check 'pre-existing case-insensitive Verdict: PASS still counted (no regression)' ((UnclosedCaseCount 'Verdict: PASS') -eq 1) `
      'expected PASS not closed out: 1 for mixed-case Verdict: PASS (PowerShell -Pattern is case-insensitive by default)'
Check 'NEW form **Result: PASS** now counted' ((UnclosedCaseCount '**Result: PASS**') -eq 1) `
      'expected PASS not closed out: 1 for **Result: PASS** (12 files in the live corpus use this form)'
Check 'NEW bare **PASS** (no field label) now counted' ((UnclosedCaseCount 'the run is **PASS** overall') -eq 1) `
      'expected PASS not closed out: 1 for a bare **PASS** with no field label'
Check 'a FAIL verdict is never counted as unclosed-PASS (control)' ((UnclosedCaseCount 'VERDICT: FAIL') -eq 0) `
      'expected PASS not closed out: 0 for a FAIL verdict'
Check 'bold **PASSWORD** text does not false-positive on the bare-PASS widening (control)' `
      ((UnclosedCaseCount 'the config **PASSWORD** field was rotated') -eq 0) `
      'expected PASS not closed out: 0 -- **PASSWORD** must not match the bare **PASS** widening'

# ---------------------------------------------------------------------------
# Group 5: the D-019 ledger union (landed 2a0d5f7, ISS-129) must survive this
# unit unmodified -- confirmed by re-running its own shape alongside a
# canonical-field manifest, so the two features are proven independent.
# ---------------------------------------------------------------------------
$tmp5 = NewTree
try {
  $open = '{"id":"ISS-X","status":"open","severity":"high","title":"t"}'
  Set-Content -Path (Join-Path $tmp5 'qa/issues.jsonl') -Value @($open, $open) -Encoding utf8
  Set-Content -Path (Join-Path $tmp5 'qa/issues.lanea.jsonl') -Value @($open) -Encoding utf8
  Set-Content -Path (Join-Path $tmp5 'qa/manifests/canon-only-pass2.md') -Value @(
    '# Manifest — canon-only-pass2', '', '**Handshake status:** checked-PASS'
  ) -Encoding utf8
  $out5 = RunHook $tmp5
  Check 'ledger union count (3 across 2 shards) is unaffected by the handshake-field change' `
        ($out5 -match 'Open issues:\s*3\b') `
        ("expected 'Open issues: 3'; got: " + ($out5 -split "`n")[0])
  Check 'ledger union file-count string (2 file union) is unaffected' `
        ($out5 -match '2 file union') `
        ("expected '2 file union'; got: " + ($out5 -split "`n")[0])
} finally { Remove-Item -Recurse -Force $tmp5 -ErrorAction SilentlyContinue }

Remove-Item 'Env:\CLAUDE_PROJECT_DIR' -ErrorAction SilentlyContinue

if ($fails -gt 0) { Write-Output "RESULT: FAIL ($fails of $total assertion(s))"; exit 1 }
Write-Output "RESULT: PASS ($total/$total assertions)"
exit 0

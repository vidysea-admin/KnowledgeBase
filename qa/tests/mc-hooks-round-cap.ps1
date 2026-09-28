# Regression test -- ISS-346: D-014's class-based round cap had no mechanical check, so a seam already
# at >= 2 PASSed units could be (and was) pulled as a new non-security unit on any tick.
# Covers the ROUNDCAP predicate in delivery-gate-stop.ps1 (landed 2026-09-28 by a concurrent lane,
# authorized by D-043 item 2 / D-049, Approved-by: Umesh). That predicate shipped with NO standing
# test; this is it.
#
# Runs the REAL hook against throwaway project trees -- never reads or writes this repo's qa/.
# Hook resolution, in order: -HookPath <path> -> $env:DELIVERY_GATE_HOOK
# -> <repo>/.claude/hooks/delivery-gate-stop.ps1 -> D:/ai_os/.claude/hooks/delivery-gate-stop.ps1
# (where it is actually wired, user-level, per its own header). -HookPath exists so a CANDIDATE COPY
# can be measured before it lands, which is also how this unit's falsification runs mutate a copy
# rather than the live hook.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File qa/tests/mc-hooks-round-cap.ps1 [-HookPath <path>]
# Exit 0 = all assertions pass; exit 1 = a failure (message says which).
#
# NOTE the parameter is -HookPath, not -Hook: PowerShell variable names are case-INSENSITIVE, so a
# param named $Hook is the same variable as the resolved $hook below and was silently clobbered by it
# (measured: the first run reported the live hook while a candidate copy had been passed).
param([string]$HookPath = "")

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$hook = $null
foreach ($cand in @($HookPath,
                    $env:DELIVERY_GATE_HOOK,
                    (Join-Path $repoRoot '.claude/hooks/delivery-gate-stop.ps1'),
                    'D:/ai_os/.claude/hooks/delivery-gate-stop.ps1')) {
  if (-not [string]::IsNullOrWhiteSpace($cand) -and (Test-Path $cand)) { $hook = $cand; break }
}
if (-not $hook) { Write-Output "FAIL: delivery-gate-stop.ps1 not found (pass -HookPath)"; exit 1 }
Write-Output "hook: $hook"

$fails = 0
function Check($name, $cond, $detail) {
  if ($cond) { Write-Output "  PASS  $name" }
  else { Write-Output "  FAIL  $name -- $detail"; $script:fails++ }
}

# ---------------------------------------------------------------------------
# Tree builder. A "unit" is a manifest, plus a verdict of the same slug when $verdict is given.
#   @{ slug='x'; changed=@('packages/index/widget.ts'); verdict=@('VERDICT: PASS'); extra='' }
# A CANDIDATE, in the predicate's own terms, is a manifest at ready-for-check with NO verdict file and
# no written class decision -- so any unit here given no $verdict is a candidate.
# Seam paths MUST be backticked and MUST contain a '/': the predicate's Get-ManifestSeam matches
# '`<dir>/<file>.<ext>`' and a bare basename is deliberately not a seam claim.
# ---------------------------------------------------------------------------
function NewTree($units) {
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("lkb-roundcap-" + [guid]::NewGuid().ToString('N').Substring(0,8))
  New-Item -ItemType Directory -Path (Join-Path $tmp 'qa/manifests') -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $tmp 'qa/verdicts')  -Force | Out-Null
  foreach ($u in $units) {
    $lines = @("# $($u.slug)", "", "**Fix cycle:** 0 of max 3", "")
    if ($u.extra) { $lines += @($u.extra, "") }
    $lines += @("## What changed", "")
    foreach ($f in $u.changed) { $lines += ('- `' + $f + '` -- edited in place.') }
    $lines += @("", "## How to verify", "", "Run the suite.")
    if ($u.tail) { $lines += @("", $u.tail) }   # prose AFTER the What-changed section
    $lines += @("", "## Status: ready-for-check")
    Set-Content -Path (Join-Path $tmp ("qa/manifests/{0}.md" -f $u.slug)) -Value $lines -Encoding utf8
    if ($u.verdict) {
      $v = @("# Verdict $($u.slug)", "") + @($u.verdict) + @("", "Cycle checked: 0")
      Set-Content -Path (Join-Path $tmp ("qa/verdicts/{0}.md" -f $u.slug)) -Value $v -Encoding utf8
    }
  }
  # Minimal transcript. The ROUNDCAP predicate's antecedent is on DISK, so the transcript only has to
  # exist -- but it carries a ScheduleWakeup so the MAKER predicate, which sits just AFTER this one and
  # would otherwise block first on these pending manifests, stays silent and cannot mask an assertion.
  $t = @(
    '{"type":"user","message":{"content":[{"type":"text","text":"tick"}]}}',
    '{"message":{"content":[{"type":"tool_use","id":"toolu_wake","name":"ScheduleWakeup","input":{}}]},"type":"assistant"}'
  )
  $tp = Join-Path $tmp 'transcript.jsonl'
  Set-Content -Path $tp -Value $t -Encoding utf8
  return @{ dir = $tmp; transcript = $tp }
}

# Same tree, no ScheduleWakeup -- used only by the CONTROL assertion.
function StripWakeup($tree) {
  Set-Content -Path $tree.transcript -Value @('{"type":"user","message":{"content":[{"type":"text","text":"tick"}]}}') -Encoding utf8
}

# Runs the real hook once. Fresh session id every call, so the once-per-session marker never leaks
# between assertions. The event goes in on STDIN, the way the harness delivers it: passing it as a
# -InputJson argument through `powershell -File` loses the quoting and the hook fails JSON parsing
# (measured: "EXIT exception: Invalid JSON primitive").
function RunHook($tree) {
  $ev = [ordered]@{
    session_id       = ("rc-" + [guid]::NewGuid().ToString('N'))
    hook_event_name  = 'Stop'
    stop_hook_active = $false
    cwd              = $tree.dir
    transcript_path  = $tree.transcript
  } | ConvertTo-Json -Compress
  $evFile = Join-Path $tree.dir 'event.json'
  Set-Content -Path $evFile -Value $ev -Encoding ascii
  return (Get-Content $evFile -Raw | & powershell -NoProfile -ExecutionPolicy Bypass -File $hook 2>&1 | Out-String)
}

function Drop($tree) { Remove-Item -Recurse -Force $tree.dir -ErrorAction SilentlyContinue }

$SEAM  = 'packages/index/widget.ts'
$OTHER = 'packages/index/other.ts'
$PASSV = @('VERDICT: PASS')
$FAILV = @('VERDICT: FAIL')
$CAP   = 'round cap'   # the block's own wording, matched case-insensitively

# ---------------------------------------------------------------------------
# 1. A 0-PASS seam is freely pullable. This is the case a grep-over-the-verdict count gets WRONG:
#    three prior PASSed verdicts NAME the seam -- in backticks, the way verdicts really cite paths --
#    and none of their units touched it.
#    Measured on this repo at 48cc8a3, that distinction is worth 5-vs-0 for delivery-gate-stop.ps1:
#    5 verdicts name that file, 0 PASSed units changed it. mc-sessionstart.ps1 goes 8-vs-3.
# ---------------------------------------------------------------------------
#    Each prior ALSO carries a "Scope discipline" paragraph naming the seam as a file it explicitly did
#    NOT change -- the exact shape qa/manifests/vector-gap-durability.md uses. A manifest that says in
#    terms that it did not touch a file must never be counted as a round on it.
# ---------------------------------------------------------------------------
$SCOPE = '**Scope discipline:** no change to `' + $SEAM + '` or its callers.'
$t = NewTree @(
  @{ slug='prior-a'; changed=@($OTHER); tail=$SCOPE; verdict=@('VERDICT: PASS','',('Read `' + $SEAM + '` for context; not edited.')) },
  @{ slug='prior-b'; changed=@($OTHER); tail=$SCOPE; verdict=@('VERDICT: PASS','',('`' + $SEAM + '` is cited here too, never edited.')) },
  @{ slug='prior-c'; changed=@($OTHER); tail=$SCOPE; verdict=@('VERDICT: PASS','',('`' + $SEAM + '` again, in prose only.')) },
  @{ slug='cand-1';  changed=@($SEAM) }
)
$o = RunHook $t
Check "a 0-PASS seam is ALLOWED (a verdict that only MENTIONS the file does not count toward the seam)" `
      (-not ($o -match $CAP)) ("blocked a freely-pullable seam; got: " + $o)
Drop $t

# ---------------------------------------------------------------------------
# 2. A >= 2-PASS seam is refused, and the block names the candidate and the count.
# ---------------------------------------------------------------------------
$t = NewTree @(
  @{ slug='prior-a'; changed=@($SEAM); verdict=$PASSV },
  @{ slug='prior-b'; changed=@($SEAM); verdict=$PASSV },
  @{ slug='cand-2';  changed=@($SEAM) }
)
$o = RunHook $t
Check "a >= 2-PASS seam is REFUSED, naming the unit and the count" `
      (($o -match $CAP) -and ($o -match 'cand-2') -and ($o -match '2 prior PASS')) `
      ("expected a round-cap block naming cand-2 and 2; got: " + $o)
Drop $t

# ---------------------------------------------------------------------------
# 3. SECURITY CLASS IS NEVER CAPPED (D-014). Same 2-PASS seam as (2); the only difference is the
#    written class decision the predicate requires. ISS-078 -- a cross-tenant read disclosure -- was
#    first found at ROUND 5 after four consecutive PASSes, so a cap that suppresses that ships a leak.
# ---------------------------------------------------------------------------
$t = NewTree @(
  @{ slug='prior-a'; changed=@($SEAM); verdict=$PASSV },
  @{ slug='prior-b'; changed=@($SEAM); verdict=$PASSV },
  @{ slug='cand-3';  changed=@($SEAM); extra='Round cap: SECURITY CLASS -- cross-tenant read on this seam; D-014 never caps this class.' }
)
$o = RunHook $t
Check "a SECURITY-class candidate on the same 2-PASS seam is still ALLOWED (D-014, ISS-078)" `
      (-not ($o -match $CAP)) ("capped a security-class unit; got: " + $o)
Drop $t

# ---------------------------------------------------------------------------
# 4. THE OPERATIVE VERDICT IS THE LAST 'VERDICT:' LINE IN THE FILE.
# 4a. FAIL first, operative PASS last -- the real shape of
#     qa/verdicts/iss-104-closed-class-function-words.md (FAIL at line 12, PASS at line 174).
#     Both priors count, so the seam is capped.
# ---------------------------------------------------------------------------
$t = NewTree @(
  @{ slug='prior-a'; changed=@($SEAM); verdict=@('VERDICT: FAIL','','... fix cycle 1 ...','','VERDICT: PASS') },
  @{ slug='prior-b'; changed=@($SEAM); verdict=@('VERDICT: FAIL','','... fix cycle 1 ...','','VERDICT: PASS') },
  @{ slug='cand-4a'; changed=@($SEAM) }
)
$o = RunHook $t
Check "4a: FAIL-then-PASS COUNTS (the iss-104 shape -- operative verdict is the last line)" `
      (($o -match $CAP) -and ($o -match '2 prior PASS')) `
      ("missed an operative PASS below a FAIL; got: " + $o)
Drop $t

# 4b. The inverse, and the half a first-match reader gets wrong in the REFUSING direction: both priors
#     open with PASS and END with FAIL -- a re-checked unit whose PASS was superseded. The operative
#     verdict of each is FAIL, so the seam is at 0 PASSes and the unit is pullable.
$t = NewTree @(
  @{ slug='prior-a'; changed=@($SEAM); verdict=@('VERDICT: PASS','','... re-opened, cycle 1 ...','','VERDICT: FAIL') },
  @{ slug='prior-b'; changed=@($SEAM); verdict=@('VERDICT: PASS','','... re-opened, cycle 1 ...','','VERDICT: FAIL') },
  @{ slug='cand-4b'; changed=@($SEAM) }
)
$o = RunHook $t
Check "4b: PASS-then-FAIL does NOT count (a superseded PASS is not a prior round)" `
      (-not ($o -match $CAP)) ("counted a superseded PASS as a prior round; got: " + $o)
Drop $t

# ---------------------------------------------------------------------------
# 5. The threshold is >= 2, not >= 1. One PASS plus one FAIL on the seam is below it.
# ---------------------------------------------------------------------------
$t = NewTree @(
  @{ slug='prior-a'; changed=@($SEAM); verdict=$PASSV },
  @{ slug='prior-b'; changed=@($SEAM); verdict=$FAILV },
  @{ slug='cand-5';  changed=@($SEAM) }
)
$o = RunHook $t
Check "1 prior PASS is ALLOWED (threshold is >= 2; a FAILed prior round does not count)" `
      (-not ($o -match $CAP)) ("blocked below the threshold; got: " + $o)
Drop $t

# ---------------------------------------------------------------------------
# 6. A cited waiver stands the block down, so the predicate can never wedge a session (D-044 is
#    exactly this case: one seam, one issue, once, authorized by a DECISIONS entry).
# ---------------------------------------------------------------------------
$t = NewTree @(
  @{ slug='prior-a'; changed=@($SEAM); verdict=$PASSV },
  @{ slug='prior-b'; changed=@($SEAM); verdict=$PASSV },
  @{ slug='cand-6';  changed=@($SEAM); extra='Round cap: waived by D-044 (Approved-by: Umesh) -- this branch, this issue, this seam, once.' }
)
$o = RunHook $t
Check "a written 'Round cap:' waiver stands the block down (cannot wedge a session)" `
      (-not ($o -match $CAP)) ("ignored a written waiver; got: " + $o)
Drop $t

# ---------------------------------------------------------------------------
# 7. A unit that has ALREADY been checked is not a candidate. Only a unit awaiting its first check can
#    be "opened"; re-reading a closed unit every session would block forever on settled history.
# ---------------------------------------------------------------------------
$t = NewTree @(
  @{ slug='prior-a'; changed=@($SEAM); verdict=$PASSV },
  @{ slug='prior-b'; changed=@($SEAM); verdict=$PASSV },
  @{ slug='cand-7';  changed=@($SEAM); verdict=$PASSV }
)
$o = RunHook $t
Check "an already-checked unit on a capped seam is NOT a candidate (no block on settled history)" `
      (-not ($o -match $CAP)) ("blocked on a unit that already has a verdict; got: " + $o)
Drop $t

# ---------------------------------------------------------------------------
# 8. A SEAM CITED WITH A LINE RANGE STILL COUNTS. This repo's manifests overwhelmingly write
#    `path/to/file.ts:56-103`, not the bare path: 5 of the 6 files cited by
#    qa/manifests/vector-gap-durability.md carry one. A seam regex that requires the backtick to close
#    right after the extension sees NONE of them, under-counts, and lets a capped seam through -- the
#    silent direction, and exactly ISS-346. Measured: that manifest's extracted seam was
#    {vector-gap.test.ts} alone, its count came back 1 instead of 2, and the predicate did not fire on
#    the one unit the issue was filed about.
# ---------------------------------------------------------------------------
$t = NewTree @(
  @{ slug='prior-a'; changed=@(($SEAM + ':56-103')); verdict=$PASSV },
  @{ slug='prior-b'; changed=@(($SEAM + ':12,40-44')); verdict=$PASSV },
  @{ slug='cand-9';  changed=@($SEAM) }
)
$o = RunHook $t
Check "a prior seam cited WITH a line range (path.ts:56-103) still counts (ISS-346's own case)" `
      (($o -match $CAP) -and ($o -match '2 prior PASS')) `
      ("line-range citations were skipped, so the count under-reported; got: " + $o)
Drop $t

# ---------------------------------------------------------------------------
# 9. A PASSED PRIOR UNIT WITH NO EXTRACTABLE SEAM MUST NOT TAKE THE HOOK DOWN. Get-ManifestSeam
#    returns its HashSet, and PowerShell UNROLLS a collection on output: an empty seam comes back as
#    $null and the caller's $ps.Seam.Contains($f) throws. The hook's outer catch fails OPEN, so ONE
#    doc-only PASSed unit silently disables ROUNDCAP *and every predicate after it* for the session.
#    Measured on this repo's real corpus (167 manifests + 167 verdicts + the vector-gap candidate):
#    "EXIT exception: You cannot call a method on a null-valued expression", and no block at all.
# ---------------------------------------------------------------------------
$t = NewTree @(
  @{ slug='prior-none'; changed=@('no-path-here'); verdict=$PASSV },   # no '/' -> no extractable seam
  @{ slug='prior-a';    changed=@($SEAM); verdict=$PASSV },
  @{ slug='prior-b';    changed=@($SEAM); verdict=$PASSV },
  @{ slug='cand-10';    changed=@($SEAM) }
)
$o = RunHook $t
Check "a PASSed prior unit with no extractable seam does not fail the hook open (null-unroll guard)" `
      (($o -match $CAP) -and ($o -match '2 prior PASS')) `
      ("the hook threw and failed open, or miscounted; got: " + $o)
Drop $t

# ---------------------------------------------------------------------------
# 10. CONTROL -- isolation. ROUNDCAP sits BEFORE the MAKER predicate; when ROUNDCAP is silent the rest
#    of the hook must behave exactly as before. Same 0-PASS tree as (1), with the ScheduleWakeup
#    removed: the MAKER block must still fire. A mutation that reddens 1-7 while leaving this green has
#    isolated the change; one that reddens this too has broken loading, not falsified a capability.
# ---------------------------------------------------------------------------
$t = NewTree @(
  @{ slug='prior-a'; changed=@($OTHER); verdict=$PASSV },
  @{ slug='cand-8';  changed=@($SEAM) }
)
StripWakeup $t
$o = RunHook $t
Check "CONTROL: the MAKER predicate still fires downstream when ROUNDCAP is silent" `
      (($o -match 'maker-checker project with pending backlog') -and (-not ($o -match $CAP))) `
      ("the rest of the hook regressed; got: " + $o)
Drop $t

if ($fails -gt 0) { Write-Output "RESULT: FAIL ($fails assertion(s))"; exit 1 }
Write-Output 'RESULT: PASS (11/11 assertions)'
exit 0

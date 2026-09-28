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

# The resolution chain ends at D:/ai_os because that is where the hook is WIRED (user-level), but a
# stray or stale repo-local copy would silently win and the suite would certify the wrong file while
# still printing a green RESULT. Pin the identity of what is being tested, not its path -- that also
# holds for a -HookPath candidate.
Check "the resolved hook actually contains the ROUNDCAP predicate (not a shadow/stale file)" `
      [bool](Select-String -Path $hook -Pattern 'predicate ROUNDCAP' -Quiet) `
      "no ROUNDCAP predicate in $hook -- every assertion below would be meaningless"
if ($fails -gt 0) { Write-Output "RESULT: FAIL (wrong hook resolved)"; exit 1 }

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
  # utf8, NOT ascii: the paths in this payload come from %TEMP%, and a non-ASCII character anywhere in
  # it would be silently replaced by '?' under -Encoding ascii, corrupting cwd/transcript_path and
  # breaking every assertion for a reason that looks like a hook bug.
  Set-Content -Path $evFile -Value $ev -Encoding utf8
  return (Get-Content $evFile -Raw | & powershell -NoProfile -ExecutionPolicy Bypass -File $hook 2>&1 | Out-String)
}

function Drop($tree) { Remove-Item -Recurse -Force $tree.dir -ErrorAction SilentlyContinue }

# An ALLOW assertion that only checks for the ABSENCE of a round-cap block is VACUOUS when the hook
# throws: the outer catch fails OPEN with no stdout at all, so "no block" is indistinguishable from
# "crashed". That is not hypothetical here -- the null-unrolled HashSet does exactly this, on real data.
# So every ALLOW is corroborated POSITIVELY on its own tree: strip the ScheduleWakeup and re-run, and
# the MAKER predicate (which sits immediately AFTER ROUNDCAP) must then block. If ROUNDCAP crashed on
# THIS tree's shape, MAKER never runs and there is no output, so the assertion fails as it should.
# Per-tree, because the shapes differ: the 'Round cap:' extra field, a multi-line FAIL->PASS verdict
# body and a FAIL verdict body are each a distinct parse path, and one shared CONTROL tree covers none
# of them.
function CheckAllowed($name, $tree) {
  $o = RunHook $tree
  if ($o -match $CAP) { Check $name $false ("blocked when it should have been allowed; got: " + $o); return }
  StripWakeup $tree
  $o2 = RunHook $tree
  Check $name ($o2 -match 'maker-checker project with pending backlog') `
        ("no round-cap block, but the hook did not run to completion on this tree either (failed open?); second run gave: " + $o2)
}

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
CheckAllowed "a 0-PASS seam is ALLOWED (a verdict that only MENTIONS the file does not count toward the seam)" $t
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
CheckAllowed "a SECURITY-class candidate on the same 2-PASS seam is still ALLOWED (D-014, ISS-078)" $t
Drop $t

# ---------------------------------------------------------------------------
# 4. CUMULATIVE COUNTING, NOT "LAST LINE WINS". Corrected in fix cycle 1 (ISS-ISS346-001) -- this
#    block used to be titled "the operative verdict is the LAST VERDICT: line", which is NOT what the
#    live hook does and was never what it should do. Read live delivery-gate-stop.ps1's own comment
#    directly above $script:VERDICT_VOCAB (as of sha fc328d0688d0..., 816 lines): "For a ROUND cap the
#    question is not 'what is this verdict's final word' but 'has this seam been PASSed before', which
#    is cumulative: a seam that PASSED at cycle 0 had a PASS round on it whatever a later cycle said.
#    So ANY operative-form PASS counts as one prior PASS." Get-VerdictTokens collects EVERY vocabulary
#    match in the file and Test-VerdictPass returns true if ANY of them is PASS -- order-independent,
#    a pure OR across the whole file, not a position rule at all.
#    ISS-346's own dispatched fix (H3, rejected in fix cycle 1 -- see ISS-ISS346-001) proposed the
#    opposite model ("read the LAST VERDICT:-shaped line") and this assertion 4b originally encoded
#    that same rejected model ("a superseded PASS is not a prior round"). It was WRONG: it asserted
#    behaviour that contradicts the live hook's own extensively-reasoned, already-landed design, and a
#    direct re-run against the current live hook confirms the live hook does NOT implement it (see
#    cycle-1 manifest, "Assertion 4b was testing the wrong model"). Fixed here to assert what the hook
#    actually and deliberately does, which is also the safer ("loud") direction per D-014/ISS-078.
# 4a. FAIL first, operative PASS later in the file -- the real shape of
#     qa/verdicts/iss-104-closed-class-function-words.md (FAIL at line 12, PASS at line 174).
#     Both priors count, so the seam is capped.
# ---------------------------------------------------------------------------
$t = NewTree @(
  @{ slug='prior-a'; changed=@($SEAM); verdict=@('VERDICT: FAIL','','... fix cycle 1 ...','','VERDICT: PASS') },
  @{ slug='prior-b'; changed=@($SEAM); verdict=@('VERDICT: FAIL','','... fix cycle 1 ...','','VERDICT: PASS') },
  @{ slug='cand-4a'; changed=@($SEAM) }
)
$o = RunHook $t
Check "4a: FAIL-then-PASS COUNTS (a later operative PASS in the same file)" `
      (($o -match $CAP) -and ($o -match '2 prior PASS')) `
      ("missed an operative PASS below a FAIL; got: " + $o)
Drop $t

# 4b. CORRECTED (fix cycle 1): both priors open with PASS and later carry an appended FAIL -- a
#     re-opened unit whose earlier PASS round was superseded by a later cycle. Per the live hook's own
#     cumulative rule, the seam STILL had a PASS round at cycle 0, so this counts toward the cap exactly
#     like 4a. (The old version of this assertion asserted the opposite -- "does NOT count" -- via
#     CheckAllowed, which is the rejected H3 model; that assertion FAILED against the live hook both
#     before and after fix cycle 1's other changes, because the live hook was correct and the assertion
#     was not. See the cycle-1 manifest for the re-run evidence.)
$t = NewTree @(
  @{ slug='prior-a'; changed=@($SEAM); verdict=@('VERDICT: PASS','','... re-opened, cycle 1 ...','','VERDICT: FAIL') },
  @{ slug='prior-b'; changed=@($SEAM); verdict=@('VERDICT: PASS','','... re-opened, cycle 1 ...','','VERDICT: FAIL') },
  @{ slug='cand-4b'; changed=@($SEAM) }
)
$o = RunHook $t
Check "4b: PASS-then-FAIL STILL counts (cumulative -- a seam that passed once had a round on it, whatever a later cycle said)" `
      (($o -match $CAP) -and ($o -match '2 prior PASS')) `
      ("a superseded PASS was not counted, contradicting the live hook's documented cumulative rule; got: " + $o)
Drop $t

# ---------------------------------------------------------------------------
# 5. The threshold is >= 2, not >= 1. One PASS plus one FAIL on the seam is below it.
# ---------------------------------------------------------------------------
$t = NewTree @(
  @{ slug='prior-a'; changed=@($SEAM); verdict=$PASSV },
  @{ slug='prior-b'; changed=@($SEAM); verdict=$FAILV },
  @{ slug='cand-5';  changed=@($SEAM) }
)
CheckAllowed "1 prior PASS is ALLOWED (threshold is >= 2; a FAILed prior round does not count)" $t
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
CheckAllowed "a written 'Round cap:' waiver stands the block down (cannot wedge a session)" $t
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
CheckAllowed "an already-checked unit on a capped seam is NOT a candidate (no block on settled history)" $t
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
# 11. NEWEST-FIRST-ARCHIVE VERDICTS WITH VOCABULARY-POLLUTING PROSE STILL COUNT THEIR REAL PASS.
#    Added in fix cycle 1 (ISS-ISS346-001, checker cycle 0) -- the class of defect the rejected H3 hunk
#    would have shipped and that assertion 4b alone did not catch. Modeled on the REAL shape of
#    qa/verdicts/vector-cosine-retriever.md: a PASS near the TOP (its line 13), an earlier cycle's FAIL
#    preserved further down under a literal '# ARCHIVE' marker (its line 326), a 'VERDICT: INFORMATIVE'
#    line that is not a VERDICT_VOCAB member and must be ignored (its lines 195/377), and -- separately,
#    the actual defect the checker found by running H3's own proposed regex against this exact real
#    file -- an ordinary prose line elsewhere that happens to start with the word 'verdict' but is not a
#    result field at all (its real line 552: "  verdict rule rather than in the backlog."). H3's proposed
#    rule ("read the LAST 'VERDICT:'-shaped line, no vocabulary restriction") reads that prose line last
#    and returns the token RULE -- not a member of VERDICT_VOCAB and not PASS -- so a hook built on H3
#    would silently drop this seam's real PASS and let a capped seam through. The live hook's
#    Get-VerdictTokens ignores RULE (not in $VERDICT_VOCAB) and Test-VerdictPass finds the real PASS
#    regardless of where it sits in the file, because the question is cumulative ("was this seam EVER
#    PASSed"), not positional.
# ---------------------------------------------------------------------------
$ARCHIVE_POLLUTED_VERDICT = @(
  '## VERDICT: PASS',
  '',
  '**SCOREBOARD:** newest-first-archive fixture, modeled on qa/verdicts/vector-cosine-retriever.md',
  '',
  'VERDICT: INFORMATIVE -- 0.935 vs a 0.217 question-blind control, not a VERDICT_VOCAB member.',
  '',
  '# ARCHIVE -- cycle 1 verdict (FAIL), preserved verbatim',
  '',
  '## VERDICT: FAIL',
  '',
  'VERDICT: INFORMATIVE -- 0.935 vs a 0.217 question-blind control, repeated in the archived cycle.',
  '',
  '  verdict rule rather than a re-opened cycle -- ordinary prose citing the round-cap policy, not a result field.'
)
$t = NewTree @(
  @{ slug='prior-a'; changed=@($SEAM); verdict=$ARCHIVE_POLLUTED_VERDICT },
  @{ slug='prior-b'; changed=@($SEAM); verdict=$ARCHIVE_POLLUTED_VERDICT },
  @{ slug='cand-11'; changed=@($SEAM) }
)
$o = RunHook $t
Check "a newest-first-archive verdict with vocabulary-polluting prose still counts its real PASS (models vector-cosine-retriever.md; the rejected H3 rule misreads this -- see assertion 12)" `
      (($o -match $CAP) -and ($o -match '2 prior PASS')) `
      ("the archived FAIL / prose noise defeated the real PASS count; got: " + $o)
Drop $t

# 12. STATIC FALSIFICATION, run directly rather than asserted from prose: the REJECTED H3 rule ("read
#    the last VERDICT:-shaped line, no vocabulary restriction") really does misread assertion 11's own
#    fixture text. This is H3's exact proposed regex from the diff the checker rejected
#    (delivery-gate-stop.roundcap-fixes.diff, hunk 2), applied with "take the last match" semantics.
#    If this assertion ever finds H3's regex returning PASS here, the falsification above is void and
#    fixture 11 would be proving nothing -- see the cycle-1 manifest.
# ---------------------------------------------------------------------------
$h3Text = ($ARCHIVE_POLLUTED_VERDICT -join "`n")
$h3Last = ''
foreach ($m in [regex]::Matches($h3Text, '(?im)^[\s\-*#>|]*VERDICT:?[ \t]*([A-Za-z-]+)')) { $h3Last = $m.Groups[1].Value.ToUpperInvariant() }
Check "the rejected H3 rule misreads assertion 11's fixture as '$h3Last', not PASS (regex-unsound on this real-corpus shape)" `
      ($h3Last -ne 'PASS') `
      ("expected H3's naive last-match regex to return a non-PASS token on this fixture; it returned '$h3Last', which would make H3 accidentally correct here and void the falsification")

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
Write-Output 'RESULT: PASS (14/14 assertions)'
exit 0

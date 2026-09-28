# Standing regression test -- delivery-gate-stop.ps1 ROUNDCAP predicate, unit
# `iss-346-round-cap-mechanical-check`. Authorized by D-049 (Approved-by: Umesh), sequenced by
# D-052 ruling 1.
#
# WHAT IT PINS. The ROUNDCAP predicate shipped in `delivery-gate-machine-wide-fix` decided whether a
# prior unit PASSed with:
#     (Strip-Code ($vt -replace '**','')) -match '(?m)^[\s\-*#>|]*VERDICT:?\s*PASS'
# The checker skill writes its result block INSIDE a fenced code block, so `Strip-Code` removes the
# verdict along with the code. Measured over D:/KnowledgeBase's 170 real verdicts on 2026-09-28: that
# reading saw 77 PASSes where 162 exist, and counted the `.claude/hooks/mc-sessionstart.ps1` seam at
# **1** where **4** PASSed units had touched it -- so ISS-365's candidate (`handshake-field-reader`)
# was NOT refused, which is the second recorded breach of the cap. Under-counting is the dangerous
# direction for a cap: it is exactly how a capped seam gets pulled.
#
# The six properties asserted below are the ones a naive implementation gets wrong. Each was measured
# by hand against the real corpus before being written as a fixture:
#   1. a 0-PASS seam is freely pullable                                    -> T1
#   2. a seam with >= 2 PASSed units is refused, INCLUDING the fenced form -> T2   (the shipped bug)
#   3. a SECURITY-CLASS candidate is never capped, at any round count      -> T3   (ISS-078: a
#      cross-tenant read disclosure first found at ROUND 5 after four consecutive PASSes)
#   4. the count reads the LAST VERDICT line, not the first                -> T4   (real shape:
#      qa/verdicts/iss-104-closed-class-function-words.md, FAIL at 12 / PASS at 174)
#   5. a verdict that merely MENTIONS the file does not count -- the seam comes from the matching
#      manifest's `## What changed`                                        -> T5   (real measurement:
#      delivery-gate-stop.ps1 is mentioned by 7 verdicts and touched by 0 PASSed units)
#   6. bold-prefixed fields still parse: `**Status:**`, `**Round cap:**`, `**VERDICT:**` -> T6
#      (ISS-350: ~160 manifests use several incompatible markdown forms)
#
# SAFETY. The hook is MACHINE-WIDE (D:/ai_os/.claude/hooks/, registered in the USER-level
# settings.json), so this test is built so it can never touch it -- same construction as
# qa/tests/mc-hooks-fixgap-and-stripper.ps1:
#   * every run is against a throwaway temp project tree via the hook's `cwd`, never this repo's qa/;
#   * $env:TEMP is redirected per run, so the hook's per-session markers and log.txt land inside the
#     throwaway tree and no real session's block budget is consumed;
#   * D-020 as amended by D-050-SPEAKER ruling 3: falsifying edits are applied to a COPY of the hook
#     in the temp tree, never to the live file, so there is no window in which a mutant is live (the
#     ISS-083 hazard class). The live file's sha256 is captured before and re-checked after.
#   * every hook invocation runs under Start-Job / Wait-Job -Timeout, so a hang cannot wedge the run.
#
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File qa/tests/mc-hooks-roundcap-verdict-reading.ps1
#        $env:DG_HOOK overrides the hook path (default D:/ai_os/.claude/hooks/delivery-gate-stop.ps1).
# Exit 0 = all assertions pass; exit 1 = a failure (the message says which).

$ErrorActionPreference = 'Stop'
$hook = if ($env:DG_HOOK) { $env:DG_HOOK } else { 'D:/ai_os/.claude/hooks/delivery-gate-stop.ps1' }
if (-not (Test-Path $hook)) { Write-Output "FAIL: hook not found at $hook"; exit 1 }
$hookHashBefore = (Get-FileHash $hook -Algorithm SHA256).Hash

$fails = 0
function Check($name, $cond, $detail) {
  if ($cond) { Write-Output "  PASS  $name" }
  else { Write-Output "  FAIL  $name -- $detail"; $script:fails++ }
}

# --------------------------------------------------------------------------------------------------
# Driver -- build a throwaway maker-checker tree from a path->content map, run the REAL hook over it.
# --------------------------------------------------------------------------------------------------
function Invoke-GateTree {
  param([hashtable]$Files, [string]$HookPath = $hook)

  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("dgrc-" + [guid]::NewGuid().ToString('N').Substring(0,10))
  try {
    New-Item -ItemType Directory -Force -Path (Join-Path $tmp 'qa/manifests') | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $tmp 'qa/verdicts')  | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $tmp 'privtemp')     | Out-Null
    foreach ($k in $Files.Keys) {
      Set-Content -NoNewline -Encoding utf8 -Path (Join-Path $tmp $k) -Value $Files[$k]
    }
    # A minimal transcript: one real human turn, no Agent launches (so the ORPHAN predicate cannot
    # fire first) and no ScheduleWakeup. ROUNDCAP sits before MAKER, so a cap block wins either way.
    $tr = Join-Path $tmp 'transcript.jsonl'
    Set-Content -Encoding utf8 -Path $tr -Value '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"go"}]}}'
    $payload = [ordered]@{
      session_id = [guid]::NewGuid().ToString(); hook_event_name = 'Stop'
      stop_hook_active = $false; cwd = $tmp; transcript_path = $tr
    } | ConvertTo-Json -Compress

    $job = Start-Job -ScriptBlock {
      param($h, $p, $t)
      $env:TEMP = $t; $env:TMP = $t
      # STDIN, not -InputJson: native-argument parsing strips the JSON's quotes and the hook dies
      # with 'Invalid JSON primitive', which looks exactly like a silent pass.
      ($p | & powershell -NoProfile -ExecutionPolicy Bypass -File $h) | Out-String
    } -ArgumentList $HookPath, $payload, (Join-Path $tmp 'privtemp')
    $done = Wait-Job $job -Timeout 90
    if (-not $done) { Stop-Job $job -ErrorAction SilentlyContinue; Remove-Job $job -Force; throw "hook run timed out (90s)" }
    $stdout = (Receive-Job $job) -join "`n"
    Remove-Job $job -Force

    $log = Join-Path $tmp 'privtemp/claude-delivery-gate/log.txt'
    $logText = if (Test-Path $log) { (Get-Content $log -Raw) } else { '' }
    $cap = [regex]::Match($logText, '(?m)^.*BLOCK-ROUNDCAP .*$').Value
    $trace = [regex]::Match($logText, '(?m)^.*ROUNDCAP candidates=.*$').Value
    return [pscustomobject]@{
      capBlocked = [bool]($stdout -match 'D-014 round cap')
      blocked    = [bool]($stdout -match '"decision":"block"')
      stdout     = $stdout
      capLine    = $cap
      trace      = $trace
      log        = $logText
    }
  } finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
}

# --------------------------------------------------------------------------------------------------
# Fixtures. The seam is one backticked repo-relative path in `## What changed`, which is the form
# Get-ManifestSeam extracts (a '/' is required, so a bare basename never joins two seams).
# --------------------------------------------------------------------------------------------------
$SEAM  = 'packages/demo/src/widget.ts'
$OTHER = 'packages/other/src/unrelated.ts'

function Mf([string]$seam, [string]$extra = '') {
@"
# Manifest -- fixture

**Status:** ready-for-check
**Fix cycle:** 0 of max 3
$extra

## What changed

- ``$seam`` -- the change under test.

## Status: ready-for-check
"@
}

# The CANONICAL checker output form: the result line lives INSIDE a fenced code block. This is the
# form 76 of this repo's 170 verdicts use, and the one the shipped reading could not see.
function VdFenced([string]$result = 'PASS') {
@"
# Verdict -- fixture

## Scoreboard

All rows evidenced.

``````
VERDICT: $result
SCOREBOARD: 4/4 criteria
ISSUES-WRITTEN: none
``````
"@
}

# Bare, unfenced, bold-prefixed -- the other common form.
function VdBold([string]$result = 'PASS') {
@"
# Verdict -- fixture

**Cycle checked:** 0

**VERDICT:** $result
"@
}

# The iss-104 shape: an early FAIL, then the operative PASS appended below for the next cycle.
function VdFailThenPass() {
@"
# Verdict -- fixture

## VERDICT: FAIL

Cycle 0 did not meet criterion 3.

---

# Cycle 1 re-check

``````
VERDICT: PASS
ISSUES-WRITTEN: none
``````
"@
}

# A PASSed verdict whose MANIFEST touched something else, but whose BODY mentions the candidate's
# seam file in prose. This must NOT count -- "a verdict mentions the file" is not "a unit touched it".
function VdMentionOnly([string]$mentioned) {
@"
# Verdict -- fixture

I also read ``$mentioned`` while checking this unit, and it looked fine.

``````
VERDICT: PASS
``````
"@
}

$T1 = @{ 'qa/manifests/cand.md' = (Mf $SEAM) }

$T2 = @{
  'qa/manifests/cand.md'    = (Mf $SEAM)
  'qa/manifests/prior1.md'  = (Mf $SEAM); 'qa/verdicts/prior1.md' = (VdFenced 'PASS')
  'qa/manifests/prior2.md'  = (Mf $SEAM); 'qa/verdicts/prior2.md' = (VdFenced 'PASS')
}

$T3 = @{
  'qa/manifests/cand.md'    = (Mf $SEAM '**Round cap:** SECURITY CLASS -- cross-tenant read, never capped (D-014).')
  'qa/manifests/prior1.md'  = (Mf $SEAM); 'qa/verdicts/prior1.md' = (VdFenced 'PASS')
  'qa/manifests/prior2.md'  = (Mf $SEAM); 'qa/verdicts/prior2.md' = (VdFenced 'PASS')
}

$T4 = @{
  'qa/manifests/cand.md'    = (Mf $SEAM)
  'qa/manifests/prior1.md'  = (Mf $SEAM); 'qa/verdicts/prior1.md' = (VdFailThenPass)
  'qa/manifests/prior2.md'  = (Mf $SEAM); 'qa/verdicts/prior2.md' = (VdFenced 'PASS')
}

$T5 = @{
  'qa/manifests/cand.md'    = (Mf $SEAM)
  'qa/manifests/prior1.md'  = (Mf $OTHER); 'qa/verdicts/prior1.md' = (VdMentionOnly $SEAM)
  'qa/manifests/prior2.md'  = (Mf $OTHER); 'qa/verdicts/prior2.md' = (VdMentionOnly $SEAM)
}

$T6 = @{
  'qa/manifests/cand.md'    = (Mf $SEAM)
  'qa/manifests/prior1.md'  = (Mf $SEAM); 'qa/verdicts/prior1.md' = (VdBold 'PASS')
  'qa/manifests/prior2.md'  = (Mf $SEAM); 'qa/verdicts/prior2.md' = (VdBold 'PASS')
}

# T8 -- the priors cite the seam the way this repo's edit-in-place rule REQUIRES: with a line number.
# Real shape: qa/manifests/mc-hooks-bolded-status.md cites `.claude/hooks/mc-sessionstart.ps1:15`.
function MfLine([string]$seam) {
@"
# Manifest -- fixture

**Status:** ready-for-check
**Fix cycle:** 0 of max 3

## What changed

- ``$($seam):15`` and ``$($seam):19-25`` -- the change under test.
"@
}
$T8 = @{
  'qa/manifests/cand.md'    = (Mf $SEAM)
  'qa/manifests/prior1.md'  = (MfLine $SEAM); 'qa/verdicts/prior1.md' = (VdFenced 'PASS')
  'qa/manifests/prior2.md'  = (MfLine $SEAM); 'qa/verdicts/prior2.md' = (VdFenced 'PASS')
}

# T9 -- the candidate carries ONLY D-042's canonical field, no legacy `Status:` line. Real shape:
# qa/manifests/handshake-field-reader.md, ISS-365's own candidate.
$T9 = @{
  'qa/manifests/cand.md'    = "# Manifest -- fixture`n`n**Handshake status:** ready-for-check`n**Fix cycle:** 0 of max 3`n`n## What changed`n`n- ``$SEAM`` -- the change under test.`n"
  'qa/manifests/prior1.md'  = (Mf $SEAM); 'qa/verdicts/prior1.md' = (VdFenced 'PASS')
  'qa/manifests/prior2.md'  = (Mf $SEAM); 'qa/verdicts/prior2.md' = (VdFenced 'PASS')
}

# T7 -- a PASSed prior manifest with NO extractable seam must not take the predicate down with it.
# `aaa-` so Get-ChildItem reaches it FIRST: with `return $set`, its empty HashSet came back as $null and
# `$ps.Seam.Contains($f)` threw before the cap was ever found, so brake 3 caught it and the predicate
# failed OPEN -- silently. 20 of this repo's 170 manifests are in that state.
$T7 = @{
  'qa/manifests/cand.md'        = (Mf $SEAM)
  'qa/manifests/aaa-noseam.md'  = "# Manifest -- fixture`n`n**Status:** checked-PASS`n`n## What changed`n`nProse only; no backticked path anywhere.`n"
  'qa/verdicts/aaa-noseam.md'   = (VdFenced 'PASS')
  'qa/manifests/prior1.md'      = (Mf $SEAM); 'qa/verdicts/prior1.md' = (VdFenced 'PASS')
  'qa/manifests/prior2.md'      = (Mf $SEAM); 'qa/verdicts/prior2.md' = (VdFenced 'PASS')
}

# --------------------------------------------------------------------------------------------------
# Assertions
# --------------------------------------------------------------------------------------------------
Write-Output 'ROUNDCAP verdict-reading assertions'

$r1 = Invoke-GateTree $T1
Check 'T1 a 0-PASS seam is freely pullable (no cap block)' (-not $r1.capBlocked) "blocked; trace: $($r1.trace)"

$r2 = Invoke-GateTree $T2
Check 'T2 a seam with 2 PASSed units is REFUSED, with the result line inside a code fence' `
      ($r2.capBlocked) "no cap block; trace: $($r2.trace) capLine: $($r2.capLine)"
Check 'T2 the block names both prior slugs and the count' `
      ($r2.stdout -match 'prior1' -and $r2.stdout -match 'prior2' -and $r2.stdout -match '2 prior PASS') `
      "reason did not name both priors: $($r2.stdout)"

$r3 = Invoke-GateTree $T3
Check 'T3 a declared SECURITY-CLASS candidate is never capped at 2 PASSes (ISS-078)' `
      (-not $r3.capBlocked) "cap blocked a security-class unit; stdout: $($r3.stdout)"

$r4 = Invoke-GateTree $T4
Check 'T4 the count reads the LAST VERDICT line, not the first (FAIL then PASS counts as a PASS)' `
      ($r4.capBlocked) "no cap block, so the early FAIL was treated as the result; trace: $($r4.trace)"

$r5 = Invoke-GateTree $T5
Check 'T5 a verdict that only MENTIONS the seam file does not count toward it' `
      (-not $r5.capBlocked) "mention-only verdicts were counted; capLine: $($r5.capLine)"

$r6 = Invoke-GateTree $T6
Check 'T6 bold-prefixed fields parse: **Status:**, **VERDICT:** (ISS-350)' `
      ($r6.capBlocked) "no cap block, so a bold-prefixed field was missed; trace: $($r6.trace)"

$r7 = Invoke-GateTree $T7
Check 'T7 a PASSed prior manifest with NO extractable seam does not make the predicate fail open' `
      ($r7.capBlocked) "no cap block: a zero-seam manifest took the predicate down; trace: $($r7.trace)"

$r8 = Invoke-GateTree $T8
Check 'T8 a seam cited WITH a line number (`file.ts:15`, the edit-in-place form) still counts' `
      ($r8.capBlocked) "no cap block: file:line citations were dropped from the seam; trace: $($r8.trace)"

$r9 = Invoke-GateTree $T9
Check 'T9 a candidate carrying only the canonical **Handshake status:** field is seen (D-042)' `
      ($r9.capBlocked) "no cap block: the canonical field was not read; trace: $($r9.trace)"

# --------------------------------------------------------------------------------------------------
# Falsifying edits (capability coverage). Each is a SINGLE-HUNK edit to a COPY of the hook.
# `redWhen` is the condition that must become TRUE once the mutation is applied, i.e. the assertion
# above has gone red. A control tree must stay green under the same mutation, so the red is isolated.
# --------------------------------------------------------------------------------------------------
$mutDir = Join-Path ([System.IO.Path]::GetTempPath()) ("dgrc-mut-" + [guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Force -Path $mutDir | Out-Null
$src = Get-Content $hook -Raw
try {
  $mutations = @(
    @{ name  = 'M1 raise the cap threshold from 2 to 3'
       find  = 'if ($hits.Count -ge 2) {'
       repl  = 'if ($hits.Count -ge 3) {'
       probe = { Invoke-GateTree $T2 -HookPath $args[0] }
       redWhen = { param($r) -not $r.capBlocked }
       control = { Invoke-GateTree $T1 -HookPath $args[0] }
       ctlGreen = { param($r) -not $r.capBlocked } },

    @{ name  = 'M2 restore the OLD Strip-Code verdict reading (the shipped bug)'
       find  = 'if (-not (Test-VerdictPass $vt)) { continue }'
       repl  = "if ((Strip-Code (`$vt -replace '\*\*', '')) -notmatch '(?m)^[\s\-*#>|]*VERDICT:?\s*PASS') { continue }"
       probe = { Invoke-GateTree $T2 -HookPath $args[0] }
       redWhen = { param($r) -not $r.capBlocked }
       control = { Invoke-GateTree $T6 -HookPath $args[0] }
       ctlGreen = { param($r) $r.capBlocked } },

    @{ name  = 'M3 return on the FIRST verdict token instead of any operative PASS'
       find  = "foreach (`$x in (Get-VerdictTokens `$text)) { if (`$x.Token -eq 'PASS') { return `$true } }"
       repl  = "foreach (`$x in (Get-VerdictTokens `$text)) { return (`$x.Token -eq 'PASS') }"
       probe = { Invoke-GateTree $T4 -HookPath $args[0] }
       redWhen = { param($r) -not $r.capBlocked }
       control = { Invoke-GateTree $T2 -HookPath $args[0] }
       ctlGreen = { param($r) $r.capBlocked } },

    @{ name  = 'M4 let Get-ManifestSeam unroll its HashSet again (return ,$set -> return $set)'
       find  = '  return ,$set'
       repl  = '  return $set'
       probe = { Invoke-GateTree $T7 -HookPath $args[0] }
       redWhen = { param($r) -not $r.capBlocked }
       control = { Invoke-GateTree $T2 -HookPath $args[0] }
       ctlGreen = { param($r) $r.capBlocked } },

    @{ name  = 'M5 drop the optional :line suffix from the seam-path pattern'
       find  = '(?::\d+(?:-\d+)?)?'
       repl  = ''
       probe = { Invoke-GateTree $T8 -HookPath $args[0] }
       redWhen = { param($r) -not $r.capBlocked }
       control = { Invoke-GateTree $T2 -HookPath $args[0] }
       ctlGreen = { param($r) $r.capBlocked } },

    @{ name  = 'M6 read only the legacy Status: field, not the canonical Handshake status:'
       find  = "'(?im)^[\s\-*#>|]*(?:Handshake[^\S\r\n]+)?Status:\s*ready-for-check'"
       repl  = "'(?m)^[\s\-*#>|]*Status:\s*ready-for-check'"
       probe = { Invoke-GateTree $T9 -HookPath $args[0] }
       redWhen = { param($r) -not $r.capBlocked }
       control = { Invoke-GateTree $T2 -HookPath $args[0] }
       ctlGreen = { param($r) $r.capBlocked } }
  )
# NOT MUTATED, and disclosed rather than faked: T6 (the bold form) has NO admissible single-hunk
# falsification, because the property is implemented REDUNDANTLY. Measured in this very test run on
# 2026-09-28: dropping the emphasis strip (`$t = $text -replace '\*\*', ''` -> `$t = $text`) left T6
# GREEN -- "mutation falsified nothing" -- because clause 1's separator class `[^\w\r\n]{0,4}` absorbs
# the remaining `:** ` on its own. Either mechanism alone suffices, so no one-hunk edit isolates the
# capability. T6 therefore stands as an assertion and as a CONTROL, not as a mutation-covered row.

  $i = 0
  foreach ($mu in $mutations) {
    $i++
    if (-not $src.Contains($mu.find)) {
      Write-Output "  FAIL  $($mu.name) -- anchor text not found in the hook; the mutation is VACUOUS"
      $fails++; continue
    }
    $mutPath = Join-Path $mutDir ("hook-m$i.ps1")
    Set-Content -NoNewline -Encoding utf8 -Path $mutPath -Value ($src.Replace($mu.find, $mu.repl))
    # A mutation that breaks parsing reddens everything and isolates nothing -- that is not a
    # falsification, so the mutant is parse-checked before it is believed.
    $perr = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($mutPath, [ref]$null, [ref]$perr)
    if ($perr.Count -gt 0) {
      Write-Output "  FAIL  $($mu.name) -- the mutant does not parse ($($perr.Count) error(s)); red would be vacuous"
      $fails++; continue
    }
    try {
      $r = & $mu.probe $mutPath
      Check "$($mu.name) -> RED after" (& $mu.redWhen $r) "mutation falsified nothing; trace: $($r.trace)"
      $c = & $mu.control $mutPath
      Check "  CONTROL stays green under $($mu.name)" (& $mu.ctlGreen $c) "control moved too; trace: $($c.trace)"
    } catch {
      Write-Output "  FAIL  $($mu.name) -- probe threw: $($_.Exception.Message)"; $fails++
    }
  }
} finally {
  Remove-Item -Recurse -Force $mutDir -ErrorAction SilentlyContinue
}

# --------------------------------------------------------------------------------------------------
# Post-run check (D-020 as amended by D-050-SPEAKER ruling 3): the live hook is byte-identical to its
# pre-run state. Checked against its own recorded hash, not against a possibly-stale backup copy.
# --------------------------------------------------------------------------------------------------
$hookHashAfter = (Get-FileHash $hook -Algorithm SHA256).Hash
Check 'POST-RUN the live machine-wide hook is byte-identical to its pre-run state' `
      ($hookHashAfter -eq $hookHashBefore) "before=$hookHashBefore after=$hookHashAfter"
Write-Output "  hook sha256: $hookHashAfter"

if ($fails -gt 0) { Write-Output "RESULT: FAIL ($fails assertion(s))"; exit 1 }
Write-Output 'RESULT: PASS (22/22 assertions)'
exit 0

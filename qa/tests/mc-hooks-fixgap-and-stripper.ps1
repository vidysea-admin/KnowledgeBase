# Standing regression test -- delivery-gate-stop.ps1, unit `delivery-gate-machine-wide-fix`.
# Authorized by D-049 (Approved-by: Umesh). Covers two fixes:
#   FIX 1  ISS-266/ISS-267 class: a NON-PASS verdict at the manifest's current Fix cycle (a fix gap)
#          counted as neither `pend` nor `unclosed`, so the gate went SILENT on a fix-gapped
#          handshake. It is now counted as `fixgap` and feeds the backlog.
#   FIX 2  ISS-205 clause 3: Strip-Code stripped only closed ``` fences and paired inline spans, so
#          an INDENTED code block, a ~~~ fence and an UNCLOSED ``` fence could each MANUFACTURE a
#          cycle stamp that appears nowhere in the file -- ISS-205's stated property.
#
# The hook is MACHINE-WIDE (D:/ai_os/.claude/hooks/, registered in the USER-level settings.json), so
# this test is deliberately built so it can never touch it:
#   * every run is against a throwaway temp project tree via the hook's `cwd`, never this repo;
#   * $env:TEMP is redirected per run, so the hook's own per-session markers and log.txt are written
#     inside the throwaway tree and no real session's block budget is consumed;
#   * D-020 (as amended by D-050 ruling 3): the falsifying edits are applied to a COPY of the hook in
#     the temp tree, never to the live file. That is stronger than arm/restore -- there is no window
#     in which a mutant is live, which is the ISS-083 hazard class (a `score: 0.5` mutation found
#     applied to production source). The live file's hash is captured before and re-checked after, so
#     a violation would still be caught. Each hook invocation runs under Start-Job/Wait-Job -Timeout.
#
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File qa/tests/mc-hooks-fixgap-and-stripper.ps1
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
# Driver: build a throwaway maker-checker project tree, run the real hook against it, return counts.
# --------------------------------------------------------------------------------------------------
function Invoke-Gate {
  param([string]$Manifest, [string]$Verdict, [string]$Slug = 'fx-unit', [string]$HookPath = $hook)

  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("dg-" + [guid]::NewGuid().ToString('N').Substring(0,10))
  try {
    New-Item -ItemType Directory -Force -Path (Join-Path $tmp 'qa/manifests') | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $tmp 'qa/verdicts')  | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $tmp 'privtemp')     | Out-Null
    Set-Content -NoNewline -Encoding utf8 -Path (Join-Path $tmp "qa/manifests/$Slug.md") -Value $Manifest
    if ($null -ne $Verdict) {
      Set-Content -NoNewline -Encoding utf8 -Path (Join-Path $tmp "qa/verdicts/$Slug.md") -Value $Verdict
    }
    # A minimal transcript: one real human turn, no Agent launches (so the ORPHAN predicate cannot
    # fire first) and no ScheduleWakeup (so a non-empty backlog reaches the block).
    $tr = Join-Path $tmp 'transcript.jsonl'
    Set-Content -Encoding utf8 -Path $tr -Value '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"go"}]}}'

    $payload = [ordered]@{
      session_id       = [guid]::NewGuid().ToString()
      hook_event_name  = 'Stop'
      stop_hook_active = $false
      cwd              = $tmp
      transcript_path  = $tr
    } | ConvertTo-Json -Compress

    $job = Start-Job -ScriptBlock {
      param($h, $p, $t)
      $env:TEMP = $t; $env:TMP = $t          # isolate the hook's markers + log.txt into the temp tree
      # STDIN, not -InputJson: PowerShell's native-argument parsing strips the JSON's quotes and the
      # hook dies with 'Invalid JSON primitive' -- which looks exactly like a silent pass.
      ($p | & powershell -NoProfile -ExecutionPolicy Bypass -File $h) | Out-String
    } -ArgumentList $HookPath, $payload, (Join-Path $tmp 'privtemp')

    $done = Wait-Job $job -Timeout 90
    if (-not $done) { Stop-Job $job -ErrorAction SilentlyContinue; Remove-Job $job -Force; throw "hook run timed out (90s)" }
    $stdout = (Receive-Job $job) -join "`n"
    Remove-Job $job -Force

    $log = Join-Path $tmp 'privtemp/claude-delivery-gate/log.txt'
    $logText = if (Test-Path $log) { (Get-Content $log -Raw) } else { '' }
    $line = ([regex]::Match($logText, '(?m)^.*(?:BLOCK-)?MAKER .*$')).Value

    $get = {
      param($field)
      $m = [regex]::Match($line, ($field + '=(\d+)'))
      if ($m.Success) { [int]$m.Groups[1].Value } else { -1 }
    }
    return [pscustomobject]@{
      pend     = & $get 'pend'
      unclosed = & $get 'unclosed'
      queue    = & $get 'queue'
      fixgap   = & $get 'fixgap'
      blocked  = [bool]($stdout -match '"decision":"block"')
      reason   = $stdout
      logline  = $line
    }
  } finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
}

# Multi-unit variant: $Files is a map of repo-relative path -> content, so a tree can hold several
# manifests and verdicts at once (the ROUNDCAP predicate needs prior PASSed units to count).
function Invoke-GateTree {
  param([hashtable]$Files, [string]$HookPath = $hook)

  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("dgt-" + [guid]::NewGuid().ToString('N').Substring(0,10))
  try {
    New-Item -ItemType Directory -Force -Path (Join-Path $tmp 'qa/manifests') | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $tmp 'qa/verdicts')  | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $tmp 'privtemp')     | Out-Null
    foreach ($k in $Files.Keys) {
      Set-Content -NoNewline -Encoding utf8 -Path (Join-Path $tmp $k) -Value $Files[$k]
    }
    $tr = Join-Path $tmp 'transcript.jsonl'
    Set-Content -Encoding utf8 -Path $tr -Value '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"go"}]}}'
    $payload = [ordered]@{
      session_id = [guid]::NewGuid().ToString(); hook_event_name = 'Stop'
      stop_hook_active = $false; cwd = $tmp; transcript_path = $tr
    } | ConvertTo-Json -Compress

    $job = Start-Job -ScriptBlock {
      param($h, $p, $t)
      $env:TEMP = $t; $env:TMP = $t
      ($p | & powershell -NoProfile -ExecutionPolicy Bypass -File $h) | Out-String
    } -ArgumentList $HookPath, $payload, (Join-Path $tmp 'privtemp')
    $done = Wait-Job $job -Timeout 90
    if (-not $done) { Stop-Job $job -ErrorAction SilentlyContinue; Remove-Job $job -Force; throw "hook run timed out (90s)" }
    $stdout = (Receive-Job $job) -join "`n"
    Remove-Job $job -Force

    $log = Join-Path $tmp 'privtemp/claude-delivery-gate/log.txt'
    $logText = if (Test-Path $log) { (Get-Content $log -Raw) } else { '' }
    return [pscustomobject]@{
      capBlocked = [bool]($stdout -match 'BLOCK|D-014 round cap') -and [bool]($stdout -match 'D-014 round cap')
      blocked    = [bool]($stdout -match '"decision":"block"')
      stdout     = $stdout
      log        = $logText
    }
  } finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
}

# --------------------------------------------------------------------------------------------------
# Fixtures
# --------------------------------------------------------------------------------------------------
$mfReady1 = "# Manifest - fx-unit`n`n**Status:** ready-for-check`n**Fix cycle:** 1 of max 3`n"
$mfReady3 = "# Manifest - fx-unit`n`n**Status:** ready-for-check`n**Fix cycle:** 3 of max 3`n"
$mfClosed = "# Manifest - fx-unit`n`n**Status:** checked-PASS`n**Fix cycle:** 1 of max 3`n"

$vdFail1  = "# Verdict - fx-unit`n`n**VERDICT: FAIL**`nCycle checked: 1`n"
$vdPass1  = "# Verdict - fx-unit`n`n**VERDICT: PASS**`nCycle checked: 1`n"

# ISS-205's three RECORDED reproductions, verbatim from its ledger row's evidence field. Each is
# embedded in a verdict whose only real stamp is 1, against a manifest at Fix cycle 3: if the reader
# manufactures the higher number, vc >= mc and the gate goes SILENT (pend=0).
$vd205a = "# Verdict - fx-unit`n`n**VERDICT: FAIL**`nCycle checked: 1`nCycle checked: ``x``9 lines below.`n"
$vd205b = "# Verdict - fx-unit`n`n**VERDICT: FAIL**`nCycle checked: 1`nCycle checked:`n`n9 issues were written.`n"
$vd205c = "# Verdict - fx-unit`n`n**VERDICT: FAIL**`nCycle checked: 1`nCycle checked: ``N```n3 criteria met.`n"
# ISS-205 clause 3: the three markdown-code forms Strip-Code never stripped.
$vd205d = "# Verdict - fx-unit`n`n**VERDICT: FAIL**`nCycle checked: 1`n`n    Cycle checked: 9`n"
$vd205e = "# Verdict - fx-unit`n`n**VERDICT: FAIL**`nCycle checked: 1`n`n~~~`nCycle checked: 9`n~~~`n"
$vd205f = "# Verdict - fx-unit`n`n**VERDICT: FAIL**`nCycle checked: 1`n`n``````text`nCycle checked: 9`n"

# --------------------------------------------------------------------------------------------------
# FIX 1 -- the fix-gapped handshake
# --------------------------------------------------------------------------------------------------
Write-Output 'FIX 1 -- non-PASS verdict at the current Fix cycle (ISS-266/ISS-267 class)'
$r = Invoke-Gate $mfReady1 $vdFail1
Check 'FAIL at the current cycle is counted as a fix gap'       ($r.fixgap -eq 1) "expected fixgap=1; log: $($r.logline)"
Check 'and it reaches the block (gate no longer silent)'        ($r.blocked)      "expected a block; log: $($r.logline)"
Check 'it is not miscounted as pending or unclosed'             ($r.pend -eq 0 -and $r.unclosed -eq 0) "log: $($r.logline)"

# CONTROL rows -- these must stay green, so the reds above are provably isolated.
Write-Output 'FIX 1 controls'
$c = Invoke-Gate $mfReady1 $vdPass1
Check 'CONTROL a PASS at the current cycle is still `unclosed`, not a fix gap' `
      ($c.unclosed -eq 1 -and $c.fixgap -eq 0) "log: $($c.logline)"
$c = Invoke-Gate $mfClosed $vdPass1
Check 'CONTROL a closed-out manifest counts nothing and does not block' `
      ($c.pend -eq 0 -and $c.unclosed -eq 0 -and $c.fixgap -eq 0 -and -not $c.blocked) "log: $($c.logline)"
$c = Invoke-Gate $mfReady3 $null
Check 'CONTROL ready-for-check with no verdict is still `pend`' `
      ($c.pend -eq 1 -and $c.fixgap -eq 0) "log: $($c.logline)"

# --------------------------------------------------------------------------------------------------
# FIX 2 -- Strip-Code must never read a cycle HIGHER than a stamp present in the file
# --------------------------------------------------------------------------------------------------
Write-Output 'FIX 2 -- ISS-205 recorded reproductions (a) (b) (c), verbatim from the ledger'
foreach ($p in @(@('a', $vd205a), @('b', $vd205b), @('c', $vd205c))) {
  $r = Invoke-Gate $mfReady3 $p[1]
  Check "ISS-205($($p[0])) does not manufacture a stamp (gate stays loud)" ($r.pend -eq 1) "expected pend=1; log: $($r.logline)"
}
Write-Output 'FIX 2 -- ISS-205 clause 3: markdown-code forms Strip-Code never stripped'
foreach ($p in @(@('indented block', $vd205d), @('~~~ fence', $vd205e), @('unclosed ``` fence', $vd205f))) {
  $r = Invoke-Gate $mfReady3 $p[1]
  Check "a stamp inside an $($p[0]) is not a stamp" ($r.pend -eq 1) "expected pend=1; log: $($r.logline)"
}
Write-Output 'FIX 2 control'
$c = Invoke-Gate $mfReady1 $vdPass1
Check 'CONTROL a plain unfenced stamp is still read (cycle 1 covers cycle 1)' `
      ($c.pend -eq 0 -and $c.unclosed -eq 1) "log: $($c.logline)"

# --------------------------------------------------------------------------------------------------
# FIX 3 -- ISS-346, the mechanical D-014 round-cap check
# Reconstructs ISS-346's own recorded state in a throwaway tree: two PASSed verdicts on one seam
# (vector-gap.ts) plus a third unit pulled on that same seam, at ready-for-check, awaiting its first
# check. ISS-346's reproduction 3 cannot be re-run in this repo -- see the manifest.
# --------------------------------------------------------------------------------------------------
Write-Output 'FIX 3 -- ISS-346 mechanical round cap'
function New-SeamUnit { param($slug, $file, $verdict, $status = 'ready-for-check', $extra = '')
  $mf = "# Manifest - $slug`n`n**Status:** $status`n**Fix cycle:** 1 of max 3`n$extra`n## What changed`n`n- ``$file`` - the change.`n"
  $h = @{ "qa/manifests/$slug.md" = $mf }
  if ($verdict) { $h["qa/verdicts/$slug.md"] = "# Verdict - $slug`n`n**VERDICT: $verdict**`nCycle checked: 1`n" }
  return $h
}
$gap = 'apps/api/src/indexing/vector-gap.ts'
$base = @{}
(New-SeamUnit 'vector-gap-record'    $gap 'PASS' 'checked-PASS').GetEnumerator()    | ForEach-Object { $base[$_.Key] = $_.Value }
(New-SeamUnit 'vector-gap-tenant-id' $gap 'PASS' 'checked-PASS').GetEnumerator()    | ForEach-Object { $base[$_.Key] = $_.Value }

$t3 = @{} + $base
(New-SeamUnit 'vector-gap-durability' $gap $null).GetEnumerator() | ForEach-Object { $t3[$_.Key] = $_.Value }
$r = Invoke-GateTree $t3
Check 'a 3rd unit on a seam with 2 prior PASSes and no class decision is blocked' `
      ($r.capBlocked) "expected a D-014 round cap block; stdout: $($r.stdout)"
Check 'the block names the count and the two prior verdicts' `
      ($r.stdout -match '2 prior PASS' -and $r.stdout -match 'vector-gap-record' -and $r.stdout -match 'vector-gap-tenant-id') `
      "stdout: $($r.stdout)"

Write-Output 'FIX 3 controls -- the cap is CLASS-based, never count-based'
$t3s = @{} + $base
(New-SeamUnit 'vector-gap-tenancy' $gap $null 'ready-for-check' "**Round cap:** SECURITY CLASS - cross-tenant read, D-014 never caps this.").GetEnumerator() |
  ForEach-Object { $t3s[$_.Key] = $_.Value }
$c = Invoke-GateTree $t3s
Check 'CONTROL a declared SECURITY-CLASS unit is never capped, at any round count' `
      (-not $c.capBlocked) "a security-class unit was capped -- this is the ISS-078 failure mode; stdout: $($c.stdout)"

$t3w = @{} + $base
(New-SeamUnit 'vector-gap-waived' $gap $null 'ready-for-check' "**Round cap:** waived once by D-044 (Approved-by: Umesh).").GetEnumerator() |
  ForEach-Object { $t3w[$_.Key] = $_.Value }
$c = Invoke-GateTree $t3w
Check 'CONTROL a cited waiver on the record passes the cap' (-not $c.capBlocked) "stdout: $($c.stdout)"

$t3o = @{} + $base
(New-SeamUnit 'other-seam-unit' 'packages/index/src/vector/cosine.ts' $null).GetEnumerator() | ForEach-Object { $t3o[$_.Key] = $_.Value }
$c = Invoke-GateTree $t3o
Check 'CONTROL a unit on a DIFFERENT seam is not capped (no false seam overlap)' (-not $c.capBlocked) "stdout: $($c.stdout)"

$t3one = @{}
(New-SeamUnit 'vector-gap-record' $gap 'PASS' 'checked-PASS').GetEnumerator() | ForEach-Object { $t3one[$_.Key] = $_.Value }
(New-SeamUnit 'vector-gap-second' $gap $null).GetEnumerator()                 | ForEach-Object { $t3one[$_.Key] = $_.Value }
$c = Invoke-GateTree $t3one
Check 'CONTROL one prior PASS is under the cap and is not blocked' (-not $c.capBlocked) "stdout: $($c.stdout)"

$t3f = @{} + $base
(New-SeamUnit 'vector-gap-fail-prior' $gap 'FAIL' 'checked-FAIL').GetEnumerator() | ForEach-Object { $t3f[$_.Key] = $_.Value }
(New-SeamUnit 'vector-gap-cand2' $gap $null).GetEnumerator() | ForEach-Object { $t3f[$_.Key] = $_.Value }
$c = Invoke-GateTree $t3f
Check 'CONTROL a prior FAIL on the seam does not inflate the PASS count' `
      ($c.stdout -match '2 prior PASS' -or -not $c.capBlocked) "a FAIL was counted as a PASS; stdout: $($c.stdout)"

# --------------------------------------------------------------------------------------------------
# FALSIFYING EDITS -- applied to a COPY of the hook, never to the live machine-wide file.
# Each mutation must turn a specific assertion RED while the control rows stay GREEN.
# --------------------------------------------------------------------------------------------------
Write-Output 'FALSIFYING EDITS (against a temp copy of the hook -- the live file is never armed)'
$mutDir = Join-Path ([System.IO.Path]::GetTempPath()) ("dg-mut-" + [guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Force -Path $mutDir | Out-Null
try {
  $src = Get-Content $hook -Raw

  $mutations = @(
    @{ name = 'M1 revert the fix-gap branch (else { $fixgap++ } -> else { })'
       find = 'else { $fixgap++ }'; repl = 'else { }'
       probe = { Invoke-Gate $mfReady1 $vdFail1 -HookPath $args[0] }
       redWhen = { param($r) $r.fixgap -eq 0 -and -not $r.blocked } }
    @{ name = 'M2 revert the indented-code-block strip'
       find = @'
return [regex]::Replace($t, '(?m)^(?:[ ]{4,}|\t).*$', '~')
'@.Trim()
       repl = 'return $t'
       probe = { Invoke-Gate $mfReady3 $vd205d -HookPath $args[0] }
       redWhen = { param($r) $r.pend -eq 0 } }
    @{ name = 'M3 revert the ~~~ fence strip'
       find = @'
$t = [regex]::Replace($t, '(?ms)^[ \t]*~~~.*?(?:^[ \t]*~~~[ \t]*$|\z)', '~')
'@.Trim()
       repl = ''
       probe = { Invoke-Gate $mfReady3 $vd205e -HookPath $args[0] }
       redWhen = { param($r) $r.pend -eq 0 } }
    @{ name = 'M4 revert the unclosed-fence strip'
       find = @'
$t = [regex]::Replace($t, '(?ms)^[ \t]*```.*\z', '~')
'@.Trim()
       repl = ''
       probe = { Invoke-Gate $mfReady3 $vd205f -HookPath $args[0] }
       redWhen = { param($r) $r.pend -eq 0 } }
    @{ name = 'M5 raise the cap threshold from 2 to 3 (the ISS-346 count)'
       find = 'if ($hits.Count -ge 2) {'; repl = 'if ($hits.Count -ge 3) {'
       probe = { Invoke-GateTree $t3 -HookPath $args[0] }
       redWhen = { param($r) -not $r.capBlocked } }
    @{ name = 'M6 make the cap COUNT-based by ignoring the written class decision (the ISS-078 inversion)'
       find = "if (`$p -match '(?im)^[\s\-*#>|]*Round cap:\s*\S') { continue }"
       repl = ''
       probe = { Invoke-GateTree $t3s -HookPath $args[0] }
       redWhen = { param($r) $r.capBlocked } }
  )

  $i = 0
  foreach ($mu in $mutations) {
    $i++
    if (-not $src.Contains($mu.find)) {
      Write-Output "  FAIL  $($mu.name) -- anchor text not found in the hook; the mutation is vacuous"
      $fails++; continue
    }
    $mutPath = Join-Path $mutDir ("hook-m$i.ps1")
    Set-Content -NoNewline -Encoding utf8 -Path $mutPath -Value ($src.Replace($mu.find, $mu.repl))
    try {
      $r = & $mu.probe $mutPath
      $red = & $mu.redWhen $r
      Check "$($mu.name) -> RED after" $red "mutation did not falsify anything; log: $($r.logline)"
      # the mutation must NOT also break the controls -- that would make the red unisolated
      $ctl = Invoke-Gate $mfClosed $vdPass1 -HookPath $mutPath
      Check "  control stays green under $($mu.name)" `
            ($ctl.pend -eq 0 -and $ctl.unclosed -eq 0 -and $ctl.fixgap -eq 0) "log: $($ctl.logline)"
    } catch {
      Write-Output "  FAIL  $($mu.name) -- probe threw: $($_.Exception.Message)"; $fails++
    }
  }
} finally {
  Remove-Item -Recurse -Force $mutDir -ErrorAction SilentlyContinue
}

# --------------------------------------------------------------------------------------------------
# Post-run check (D-020 as amended by D-050 ruling 3): the live hook is byte-identical to pre-run.
# --------------------------------------------------------------------------------------------------
$hookHashAfter = (Get-FileHash $hook -Algorithm SHA256).Hash
Check 'POST-RUN the live machine-wide hook is byte-identical to its pre-run state' `
      ($hookHashAfter -eq $hookHashBefore) "before=$hookHashBefore after=$hookHashAfter"
Write-Output "  hook sha256: $hookHashAfter"

if ($fails -gt 0) { Write-Output "RESULT: FAIL ($fails assertion(s))"; exit 1 }
Write-Output 'RESULT: PASS'
exit 0

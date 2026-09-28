# READ-ONLY census for the unit `iss-346-round-cap-mechanical-check`. Replays the ROUNDCAP predicate's
# own parsers, extracted verbatim from the live machine-wide hook, over every maker-checker project on
# this machine WITHOUT invoking the hook -- so no real session's per-predicate marker or block budget is
# touched. Answers: after the corrected verdict reading, how many units would the gate refuse today?
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File qa/probes/roundcap-wouldblock-census.ps1
$ErrorActionPreference = 'Stop'
$hook = if ($env:DG_HOOK) { $env:DG_HOOK } else { 'D:/ai_os/.claude/hooks/delivery-gate-stop.ps1' }
$src  = Get-Content $hook -Raw
foreach ($fn in @('Strip-Code','Get-ManifestSeam','Get-VerdictTokens','Test-VerdictPass')) {
  $m = [regex]::Match($src, ('(?ms)^function ' + [regex]::Escape($fn) + '\(.*?^\}'))
  if (-not $m.Success) { Write-Output "FAIL: could not extract $fn from $hook"; exit 1 }
  . ([scriptblock]::Create($m.Value))
}
$script:VERDICT_VOCAB = [regex]::Match($src, "(?m)^\`$script:VERDICT_VOCAB\s*=\s*'([^']+)'").Groups[1].Value
if (-not $script:VERDICT_VOCAB) { Write-Output "FAIL: could not extract VERDICT_VOCAB"; exit 1 }
Write-Output ("hook: {0}" -f $hook)
Write-Output ("sha256: " + (Get-FileHash $hook -Algorithm SHA256).Hash.ToLower())
Write-Output ("vocab: {0}" -f $script:VERDICT_VOCAB)

$projects = @('D:/KnowledgeBase','D:/erp','D:/vc','D:/autoTesting','D:/KnowledgeBase/.claude/worktrees/agent-a035913864247fa58')
foreach ($p in $projects) {
  $qa = Join-Path $p 'qa'
  if (-not ((Test-Path (Join-Path $qa 'manifests')) -and (Test-Path (Join-Path $qa 'verdicts')))) {
    Write-Output ("{0,-58} no qa/manifests+verdicts -- predicate never runs" -f $p); continue
  }
  $mans = @(Get-ChildItem (Join-Path $qa 'manifests') -Filter *.md -File)
  $cands = @()
  foreach ($m in $mans) {
    if (Test-Path (Join-Path $qa ("verdicts\{0}.md" -f $m.BaseName))) { continue }
    $t = Get-Content $m.FullName -Raw
    $pl = Strip-Code ($t -replace '\*\*', '')
    if ($pl -notmatch '(?m)^[\s\-*#>|]*Status:\s*ready-for-check') { continue }
    if ($pl -match '(?im)^[\s\-*#>|]*Round cap:\s*\S') { continue }
    if ($pl -match '(?i)D-014[^\r\n]{0,120}(security class|never capped|waiv|exempt)') { continue }
    $cands += [pscustomobject]@{ Slug = $m.BaseName; Seam = (Get-ManifestSeam $t) }
  }
  $passSeams = @()
  if ($cands.Count -gt 0) {
    foreach ($v in (Get-ChildItem (Join-Path $qa 'verdicts') -Filter *.md -File)) {
      $vt = Get-Content $v.FullName -Raw
      if (-not (Test-VerdictPass $vt)) { continue }
      $vm = Join-Path $qa ("manifests\{0}.md" -f $v.BaseName)
      if (-not (Test-Path $vm)) { continue }
      $passSeams += [pscustomobject]@{ Slug = $v.BaseName; Seam = (Get-ManifestSeam (Get-Content $vm -Raw)) }
    }
  }
  $capped = @()
  foreach ($c in $cands) {
    if ($c.Seam.Count -eq 0) { continue }
    $hits = @()
    foreach ($ps in $passSeams) {
      if ($ps.Slug -eq $c.Slug) { continue }
      foreach ($f in $c.Seam) { if ($ps.Seam.Contains($f)) { $hits += $ps.Slug; break } }
    }
    $hits = @($hits | Select-Object -Unique)
    if ($hits.Count -ge 2) { $capped += ("{0} ({1}: {2})" -f $c.Slug, $hits.Count, ($hits -join ', ')) }
  }
  Write-Output ("{0,-58} manifests={1,-4} verdicts-read={2,-4} candidates={3,-3} WOULD-BLOCK={4}" -f `
    $p, $mans.Count, $passSeams.Count, $cands.Count, $capped.Count)
  foreach ($x in $capped) { Write-Output ("      CAPPED {0}" -f $x) }
}

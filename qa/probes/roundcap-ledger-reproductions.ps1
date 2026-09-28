# D-015 measurement for `iss-346-round-cap-mechanical-check`: runs the REAL hook against the two
# ledger issues' OWN recorded cases, rebuilt from this repo's REAL manifests and verdicts -- not from a
# corpus this unit authored. Throwaway temp trees only; the repo's own qa/ is read, never written.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File qa/probes/roundcap-ledger-reproductions.ps1
$ErrorActionPreference = 'Stop'
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$hook = if ($env:DG_HOOK) { $env:DG_HOOK } else { 'D:/ai_os/.claude/hooks/delivery-gate-stop.ps1' }
Write-Output ("hook sha256: " + (Get-FileHash $hook -Algorithm SHA256).Hash.ToLower())

function Run-Tree([hashtable]$copy, [hashtable]$literal) {
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("dgrep-" + [guid]::NewGuid().ToString('N').Substring(0,10))
  try {
    New-Item -ItemType Directory -Force -Path (Join-Path $tmp 'qa/manifests') | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $tmp 'qa/verdicts')  | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $tmp 'privtemp')     | Out-Null
    foreach ($k in $copy.Keys) { Copy-Item (Join-Path $repo $copy[$k]) (Join-Path $tmp $k) }
    foreach ($k in $literal.Keys) { Set-Content -NoNewline -Encoding utf8 -Path (Join-Path $tmp $k) -Value $literal[$k] }
    $tr = Join-Path $tmp 'transcript.jsonl'
    Set-Content -Encoding utf8 -Path $tr -Value '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"go"}]}}'
    $payload = [ordered]@{ session_id = [guid]::NewGuid().ToString(); hook_event_name = 'Stop'
      stop_hook_active = $false; cwd = $tmp; transcript_path = $tr } | ConvertTo-Json -Compress
    $job = Start-Job -ScriptBlock { param($h,$p,$t) $env:TEMP=$t; $env:TMP=$t
      ($p | & powershell -NoProfile -ExecutionPolicy Bypass -File $h) | Out-String
    } -ArgumentList $hook, $payload, (Join-Path $tmp 'privtemp')
    if (-not (Wait-Job $job -Timeout 90)) { Stop-Job $job; Remove-Job $job -Force; throw 'timed out' }
    $out = (Receive-Job $job) -join "`n"; Remove-Job $job -Force
    $log = Join-Path $tmp 'privtemp/claude-delivery-gate/log.txt'
    return [pscustomobject]@{ blocked = [bool]($out -match 'D-014 round cap'); stdout = $out
      log = $(if (Test-Path $log) { Get-Content $log -Raw } else { '' }) }
  } finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
}

# ---- ISS-346 reproduction 3, rebuilt from the ledger's OWN slugs -------------------------------------
# The two prior PASSed vector-gap units are the REAL files. The candidate is the unit the ledger says
# was pulled anyway; its manifest does not exist in this tree (D-044 held it back), so it is synthesised
# from ISS-346's own description -- ready-for-check, same seam, no class decision on the record.
$vgSeam = (Select-String -Path (Join-Path $repo 'qa/manifests/vector-gap-tenant-id.md') -Pattern '`([\w.\-]+(?:/[\w.\-]+)+\.ts)`' -AllMatches |
           ForEach-Object { $_.Matches } | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
Write-Output ("ISS-346 seam paths in the real vector-gap-tenant-id manifest: " + ($vgSeam -join ', '))
$candBody = "# Manifest -- vector-gap-durability`n`n**Status:** ready-for-check`n**Fix cycle:** 0 of max 3`n`n## What changed`n`n- ``$($vgSeam[0])`` -- the ISS-122 durability fix.`n"
$r = Run-Tree @{
  'qa/manifests/vector-gap-record.md'    = 'qa/manifests/vector-gap-record.md'
  'qa/verdicts/vector-gap-record.md'     = 'qa/verdicts/vector-gap-record.md'
  'qa/manifests/vector-gap-tenant-id.md' = 'qa/manifests/vector-gap-tenant-id.md'
  'qa/verdicts/vector-gap-tenant-id.md'  = 'qa/verdicts/vector-gap-tenant-id.md'
} @{ 'qa/manifests/vector-gap-durability.md' = $candBody }
Write-Output ("ISS-346 repro 3 -- vector-gap-durability REFUSED at selection time: {0}" -f $r.blocked)
Write-Output ("   " + ([regex]::Match($r.stdout, 'vector-gap-durability \([^)]*\)').Value))

# ---- ISS-365's case, rebuilt from the REAL manifests and verdicts -----------------------------------
# handshake-field-reader is the candidate; its verdict is deliberately OMITTED so the tree holds the
# state as it was BEFORE the checker ran, which is the selection-time moment ISS-365 requires.
$priors = @('T-017b-snapshot-features-ledger','ledger-shard-union-reader','mc-hooks-bolded-status','codex-hooks-links')
$copy = @{ 'qa/manifests/handshake-field-reader.md' = 'qa/manifests/handshake-field-reader.md' }
foreach ($p in $priors) {
  $copy["qa/manifests/$p.md"] = "qa/manifests/$p.md"
  $copy["qa/verdicts/$p.md"]  = "qa/verdicts/$p.md"
}
$r2 = Run-Tree $copy @{}
Write-Output ("ISS-365 -- handshake-field-reader REFUSED at selection time: {0}" -f $r2.blocked)
Write-Output ("   " + ([regex]::Match($r2.stdout, 'handshake-field-reader \([^)]*\)').Value))

# features-snapshot-session-end.ps1 -- T-017b SessionEnd regeneration hook.
#
# Sibling to lab-session-end.ps1 (that one warns about uncommitted Lab Protocol state; this one
# regenerates the read-first snapshot so the NEXT session's docs/SNAPSHOT.md is never stale by
# more than one session). Fires when a session ends gracefully. If docs/FEATURES.jsonl changed
# during this session (working tree OR staged), runs `node scripts/snapshot.mjs` to regenerate
# docs/SNAPSHOT.md. This is a convenience regeneration, not the enforcement gate -- the real
# gate is `pnpm lint:structure` (criterion 4/6b of qa/contracts/snapshot-features-ledger.md),
# which fails the build if SNAPSHOT.md is stale regardless of whether this hook ran.
#
# Always exits 0; fails open on any error (best-effort, same posture as lab-session-end.ps1).

param(
  [string]$InputJson = ""
)

$ErrorActionPreference = "Stop"

try {
  if ([string]::IsNullOrWhiteSpace($InputJson)) {
    try {
      $reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput())
      $InputJson = $reader.ReadToEnd()
    } catch { }
  }

  $cwd = ""
  if (-not [string]::IsNullOrWhiteSpace($InputJson)) {
    try { $event = $InputJson | ConvertFrom-Json; $cwd = [string]$event.cwd } catch { }
  }
  if ([string]::IsNullOrWhiteSpace($cwd)) { $cwd = (Get-Location).Path }
  if (-not (Test-Path -LiteralPath $cwd)) { exit 0 }

  $root = ""
  $probe = (Resolve-Path -LiteralPath $cwd).Path
  for ($i = 0; $i -lt 12; $i++) {
    if (Test-Path -LiteralPath (Join-Path $probe ".git")) { $root = $probe; break }
    $parent = Split-Path -Path $probe -Parent
    if ([string]::IsNullOrWhiteSpace($parent) -or $parent -eq $probe) { break }
    $probe = $parent
  }
  if ([string]::IsNullOrWhiteSpace($root)) { exit 0 }
  if (-not (Test-Path -LiteralPath (Join-Path $root "docs\FEATURES.jsonl"))) { exit 0 }

  $changed = & git -C $root status --porcelain -- docs/FEATURES.jsonl 2>$null
  if ($changed) {
    Push-Location $root
    try {
      node scripts/snapshot.mjs 2>$null | Out-Null
      Write-Output "T-017b: docs/FEATURES.jsonl changed this session -- regenerated docs/SNAPSHOT.md."
    } catch {
    } finally {
      Pop-Location
    }
  }
  exit 0
}
catch {
  exit 0
}

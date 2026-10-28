$ErrorActionPreference = 'Stop'
$workspace = 'C:\Users\product\Desktop\KnowledgeBase'
$stage = Join-Path $workspace 'qa\coordination\checker-efficiency-20261015\canonical-candidate'
$backup = Join-Path $workspace 'qa\coordination\checker-efficiency-20261015\global-before-remediation'
$items = @(
  @{ Name='review_budget.py'; Target='C:\Users\product\.agents\skills\checker\scripts\review_budget.py'; Before='3632D1C4DDA665FF5434456C0D875B3D776B411D7D6C4805FDBCA30005D1F5B2'; After='F24A90DA84E89A8A03E4A405997F6A0A9ADD3C4F9E1C282471D0BF9237542BBF' },
  @{ Name='SKILL.md'; Target='C:\Users\product\.agents\skills\checker\SKILL.md'; Before='886AC57C17C223CCBCBD9D38170E38734044F00547DB014920D339C592781DE9'; After='45B1FD647CEF4612D12A8ECB333129A8CF6DDEB2A78823F0CFAF4772A5D9A2D0' }
)
$alreadyCurrent = $true
foreach ($item in $items) {
  if ((Get-FileHash -LiteralPath (Join-Path $stage $item.Name)).Hash -ne $item.After) { throw 'Staged candidate drift' }
  $current = (Get-FileHash -LiteralPath $item.Target).Hash
  if ($current -ne $item.After) { $alreadyCurrent = $false }
  if ($current -ne $item.Before -and $current -ne $item.After) { throw ('Concurrent global change; HOLD: ' + $item.Target) }
}
if ($alreadyCurrent) { Write-Output 'ALREADY_CURRENT; no writes'; exit 0 }
if (Test-Path -LiteralPath $backup) { throw 'Backup already exists; do not overwrite prior provenance' }
New-Item -ItemType Directory -Path $backup | Out-Null
$changed = @()
try {
  foreach ($item in $items) {
    $current = (Get-FileHash -LiteralPath $item.Target).Hash
    if ($current -eq $item.After) { continue }
    if ($current -ne $item.Before) { throw ('Concurrent global change; HOLD: ' + $item.Target) }
    $saved = Join-Path $backup $item.Name
    Copy-Item -LiteralPath $item.Target -Destination $saved
    if ((Get-FileHash -LiteralPath $saved).Hash -ne $item.Before) { throw 'Backup drift' }
    $temporary = $item.Target + '.efficiency-' + $PID + '.tmp'
    if (Test-Path -LiteralPath $temporary) { throw 'Temporary install path exists' }
    Copy-Item -LiteralPath (Join-Path $stage $item.Name) -Destination $temporary
    if ((Get-FileHash -LiteralPath $item.Target).Hash -ne $item.Before) { throw 'Pre-replace global drift' }
    Move-Item -LiteralPath $temporary -Destination $item.Target -Force
    $changed += $item
    if ((Get-FileHash -LiteralPath $item.Target).Hash -ne $item.After) { throw 'Installed hash mismatch' }
  }
  $receipt = @{ Status='INSTALLED'; At=[DateTime]::UtcNow.ToString('o'); Items=$items; Backup=$backup }
  $receipt | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $backup 'install-receipt.json') -Encoding UTF8
  Write-Output 'INSTALLED; exact original backups retained; both hashes verified'
} catch {
  foreach ($item in $changed) {
    if ((Get-FileHash -LiteralPath $item.Target).Hash -eq $item.After) {
      Copy-Item -LiteralPath (Join-Path $backup $item.Name) -Destination $item.Target -Force
      if ((Get-FileHash -LiteralPath $item.Target).Hash -ne $item.Before) { throw 'Rollback hash mismatch' }
    } else { Write-Output ('HOLD: external change preserved during rollback: ' + $item.Target) }
  }
  throw
}

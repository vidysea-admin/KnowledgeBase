$ErrorActionPreference = 'Stop'
$stage = 'C:\Users\product\Desktop\KnowledgeBase\qa\coordination\checker-completion-reserve-20261015'
$target = 'C:\Users\product\.agents\skills\checker\scripts\review_budget.py'
$candidate = Join-Path $stage 'review_budget.py'
$verdictPath = Join-Path $stage 'verdict.md'
$baseSha = 'F24A90DA84E89A8A03E4A405997F6A0A9ADD3C4F9E1C282471D0BF9237542BBF'
$candidateSha = '36B1650CF7D65D0CB4416F558486DF279A519C75D2DAE44D3F64875D3DBEF66E'
$verdictSha = '5B85282E38D214AAE8B94707ADE86AF10A3F8805CA18B088F2E3D664CBA13324'
$backup = Join-Path $stage 'canonical-before-install.py'
$receiptPath = Join-Path $stage 'canonical-helper-install-receipt.json'

# A PASS is scoped to the exact candidate, cycle and frozen verdict, not any PASS text.
if ((Get-FileHash -LiteralPath $verdictPath).Hash -ne $verdictSha) { throw 'Verdict changed; HOLD for independent revalidation' }
$verdict = Get-Content -LiteralPath $verdictPath -Raw
if ([regex]::Matches($verdict, '(?m)^Verdict: PASS\r?$').Count -ne 1) { throw 'Matching independent PASS missing' }
if ([regex]::Matches($verdict, '(?m)^Cycle checked: 0\r?$').Count -ne 1) { throw 'Matching cycle0 missing' }
if ($verdict -notmatch ('(?im)^Candidate helper SHA256: ' + $candidateSha + '\r?$')) { throw 'Verdict candidate mismatch' }
if ($verdict -notmatch ('(?im)^Base helper SHA256: ' + $baseSha + '\r?$')) { throw 'Verdict base mismatch' }
if ((Get-FileHash -LiteralPath $candidate).Hash -ne $candidateSha) { throw 'Staged candidate changed' }
$current = (Get-FileHash -LiteralPath $target).Hash
if ($current -eq $candidateSha) { Write-Output 'ALREADY_CURRENT; no writes'; exit 0 }
if ($current -ne $baseSha) { throw 'Concurrent global helper change; HOLD, do not overwrite' }
if ((Test-Path -LiteralPath $backup) -or (Test-Path -LiteralPath $receiptPath)) { throw 'Prior installation evidence exists; preserve and reconcile it' }

$temporary = $target + '.completion-reserve-' + [guid]::NewGuid().ToString('N') + '.tmp'
$replaced = $false
try {
  # Exclusive backup creation, byte preserving; no overwrite of earlier provenance.
  $backupStream = [System.IO.File]::Open($backup, [System.IO.FileMode]::CreateNew)
  try { $baseBytes = [System.IO.File]::ReadAllBytes($target); $backupStream.Write($baseBytes, 0, $baseBytes.Length) }
  finally { $backupStream.Dispose() }
  if ((Get-FileHash -LiteralPath $backup).Hash -ne $baseSha) { throw 'Backup hash mismatch' }
  Copy-Item -LiteralPath $candidate -Destination $temporary
  if ((Get-FileHash -LiteralPath $temporary).Hash -ne $candidateSha) { throw 'Temporary candidate mismatch' }
  if ((Get-FileHash -LiteralPath $target).Hash -ne $baseSha) { throw 'Global drift before replacement; HOLD' }
  Move-Item -LiteralPath $temporary -Destination $target -Force
  $replaced = $true
  if ((Get-FileHash -LiteralPath $target).Hash -ne $candidateSha) { throw 'Installed helper readback mismatch' }
  @{ Status='INSTALLED'; At=[DateTime]::UtcNow.ToString('o'); Target=$target; BaseSha256=$baseSha; CandidateSha256=$candidateSha; VerdictSha256=$verdictSha; Backup=$backup } |
    ConvertTo-Json | Set-Content -LiteralPath $receiptPath -Encoding UTF8
  Write-Output 'INSTALLED; byte backup and exact helper readback verified'
} catch {
  if ($replaced) {
    if ((Get-FileHash -LiteralPath $target).Hash -eq $candidateSha) {
      Copy-Item -LiteralPath $backup -Destination $target -Force
      if ((Get-FileHash -LiteralPath $target).Hash -ne $baseSha) { throw 'Rollback hash mismatch' }
    } else { Write-Output 'HOLD: concurrent external change preserved; automatic rollback refused' }
  }
  throw
} finally {
  if ((Test-Path -LiteralPath $temporary) -and (Get-FileHash -LiteralPath $temporary).Hash -eq $candidateSha) {
    Remove-Item -LiteralPath $temporary
  }
}

param([switch]$DefinitionsOnly)
$ErrorActionPreference = 'Stop'

function Get-ByteSha256([byte[]]$Bytes) {
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($algorithm.ComputeHash($Bytes))).Replace('-', '') }
  finally { $algorithm.Dispose() }
}

function Read-LockedBytes([System.IO.FileStream]$Handle) {
  if ($Handle.Length -gt 1048576) { throw 'Unexpected target size; HOLD' }
  $Handle.Position = 0
  $memory = [System.IO.MemoryStream]::new()
  try { $Handle.CopyTo($memory); return ,$memory.ToArray() }
  finally { $memory.Dispose() }
}

function Invoke-LockedHelperInstall {
  param([string]$Target, [byte[]]$CandidateBytes, [string]$BaseSha,
        [string]$CandidateSha, [string]$Backup, [switch]$InjectWriteFailure)
  if ((Get-ByteSha256 $CandidateBytes) -ne $CandidateSha) { throw 'Candidate bytes changed' }
  $handle = $null; $backupHandle = $null; $attempted = $false
  try {
    # Lock precedes reading/hash validation. Same file identity and ACL are retained.
    $handle = [System.IO.File]::Open($Target, [System.IO.FileMode]::Open,
      [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    $original = Read-LockedBytes $handle
    $current = Get-ByteSha256 $original
    if ($current -eq $CandidateSha) { return @{ Status='ALREADY_CURRENT'; Writes=$false; Sha256=$current } }
    if ($current -ne $BaseSha) { throw 'Locked target differs from approved base; HOLD' }
    $backupHandle = [System.IO.File]::Open($Backup, [System.IO.FileMode]::CreateNew,
      [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    $backupHandle.Write($original, 0, $original.Length); $backupHandle.Flush($true)
    if ((Get-ByteSha256 (Read-LockedBytes $backupHandle)) -ne $BaseSha) { throw 'Backup readback mismatch' }
    $attempted = $true
    $handle.Position = 0
    if ($InjectWriteFailure) {
      $handle.Write($CandidateBytes, 0, [Math]::Min(7, $CandidateBytes.Length))
      $handle.Flush($true)
      throw 'Injected partial write failure'
    }
    $handle.Write($CandidateBytes, 0, $CandidateBytes.Length)
    $handle.SetLength($CandidateBytes.Length); $handle.Flush($true)
    if ((Get-ByteSha256 (Read-LockedBytes $handle)) -ne $CandidateSha) { throw 'Installed locked readback mismatch' }
    return @{ Status='INSTALLED'; Writes=$true; Sha256=$CandidateSha; Backup=$Backup }
  } catch {
    if ($attempted -and $null -ne $handle) {
      # Only our own attempted write is restored; exclusive ownership is still held.
      $handle.Position = 0
      $handle.Write($original, 0, $original.Length)
      $handle.SetLength($original.Length); $handle.Flush($true)
      if ((Get-ByteSha256 (Read-LockedBytes $handle)) -ne $BaseSha) { throw 'Rollback failed; preserve backup for manual recovery' }
    }
    throw
  } finally {
    if ($null -ne $backupHandle) { $backupHandle.Dispose() }
    if ($null -ne $handle) { $handle.Dispose() }
  }
}

if ($DefinitionsOnly) { return }
$stage = 'C:\Users\product\Desktop\KnowledgeBase\qa\coordination\checker-completion-reserve-20261015'
$target = 'C:\Users\product\.agents\skills\checker\scripts\review_budget.py'
$candidate = Join-Path $stage 'review_budget.py'
$verdictPath = Join-Path $stage 'verdict.md'
$baseSha = 'F24A90DA84E89A8A03E4A405997F6A0A9ADD3C4F9E1C282471D0BF9237542BBF'
$candidateSha = '36B1650CF7D65D0CB4416F558486DF279A519C75D2DAE44D3F64875D3DBEF66E'
$verdictSha = '5B85282E38D214AAE8B94707ADE86AF10A3F8805CA18B088F2E3D664CBA13324'
if ((Get-FileHash -LiteralPath $verdictPath).Hash -ne $verdictSha) { throw 'Verdict changed; HOLD' }
$verdict = Get-Content -LiteralPath $verdictPath -Raw
if ([regex]::Matches($verdict, '(?m)^Verdict: PASS\r?$').Count -ne 1) { throw 'Independent PASS missing' }
if ([regex]::Matches($verdict, '(?m)^Cycle checked: 0\r?$').Count -ne 1) { throw 'Matching helper cycle0 missing' }
if ($verdict -notmatch ('(?im)^Candidate helper SHA256: ' + $candidateSha + '\r?$')) { throw 'Verdict candidate mismatch' }
if ($verdict -notmatch ('(?im)^Base helper SHA256: ' + $baseSha + '\r?$')) { throw 'Verdict base mismatch' }
$result = Invoke-LockedHelperInstall -Target $target -CandidateBytes ([System.IO.File]::ReadAllBytes($candidate)) -BaseSha $baseSha -CandidateSha $candidateSha -Backup (Join-Path $stage 'canonical-before-install.py')
if ($result.Writes) {
  $result.At = [DateTime]::UtcNow.ToString('o'); $result.VerdictSha256 = $verdictSha
  $result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stage 'canonical-helper-install-receipt.json') -Encoding UTF8
}
$result | ConvertTo-Json

# Same-handle writes are not crash-atomic. Process/OS interruption can leave partial
# bytes; the durable QA backup remains. Never overwrite an unknown partial target
# automatically: recovery requires explicit review of current bytes and the backup.

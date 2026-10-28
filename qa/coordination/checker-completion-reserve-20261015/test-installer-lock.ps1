$ErrorActionPreference = 'Stop'
$stage = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $stage 'install-canonical-helper.ps1') -DefinitionsOnly
$fixtures = Join-Path $stage ('installer-fixtures\' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixtures -Force | Out-Null
$before = [Text.Encoding]::UTF8.GetBytes('approved original fixture bytes')
$after = [Text.Encoding]::UTF8.GetBytes('approved replacement fixture bytes, different length')
$baseSha = Get-ByteSha256 $before; $newSha = Get-ByteSha256 $after
$results = @()
function Assert-True($Condition, $Message) { if (-not $Condition) { throw $Message } }
function Expect-Refusal([scriptblock]$Operation) {
  $refused = $false
  try { & $Operation | Out-Null } catch { $refused = $true }
  Assert-True $refused 'Expected refusal did not occur'
}
function Target-At([string]$Name, [byte[]]$Bytes) {
  $path = Join-Path $fixtures ($Name + '.py')
  [System.IO.File]::WriteAllBytes($path, $Bytes)
  return $path
}

$wrong = [Text.Encoding]::UTF8.GetBytes('unrelated concurrent contents')
$target = Target-At 'wrong-base' $wrong
$backup = Join-Path $fixtures 'wrong-base.backup'
Expect-Refusal { Invoke-LockedHelperInstall -Target $target -CandidateBytes $after -BaseSha $baseSha -CandidateSha $newSha -Backup $backup }
Assert-True ((Get-FileHash -LiteralPath $target).Hash -eq (Get-ByteSha256 $wrong)) 'Wrong base modified'
Assert-True (-not (Test-Path -LiteralPath $backup)) 'Wrong base unexpectedly backed up'
$results += @{ Case='wrong base untouched'; Pass=$true }

$target = Target-At 'success' $before
$backup = Join-Path $fixtures 'success.backup'
$result = Invoke-LockedHelperInstall -Target $target -CandidateBytes $after -BaseSha $baseSha -CandidateSha $newSha -Backup $backup
Assert-True ($result.Status -eq 'INSTALLED') 'Installation did not complete'
Assert-True ((Get-FileHash -LiteralPath $target).Hash -eq $newSha) 'Successful install readback mismatch'
Assert-True ((Get-FileHash -LiteralPath $backup).Hash -eq $baseSha) 'Original backup mismatch'
$results += @{ Case='successful install readback and backup'; Pass=$true }

$result = Invoke-LockedHelperInstall -Target $target -CandidateBytes $after -BaseSha $baseSha -CandidateSha $newSha -Backup $backup
Assert-True ($result.Status -eq 'ALREADY_CURRENT' -and -not $result.Writes) 'Idempotence failed'
Assert-True ((Get-FileHash -LiteralPath $backup).Hash -eq $baseSha) 'Idempotence altered backup'
$results += @{ Case='idempotent no-op'; Pass=$true }

$target = Target-At 'writer-held' $before
$backup = Join-Path $fixtures 'writer-held.backup'
$writer = [System.IO.File]::Open($target, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
try { Expect-Refusal { Invoke-LockedHelperInstall -Target $target -CandidateBytes $after -BaseSha $baseSha -CandidateSha $newSha -Backup $backup } }
finally { $writer.Dispose() }
Assert-True ((Get-FileHash -LiteralPath $target).Hash -eq $baseSha) 'Locked target modified'
Assert-True (-not (Test-Path -LiteralPath $backup)) 'Locked target unexpectedly backed up'
$results += @{ Case='competing writer lock refuses'; Pass=$true }

$target = Target-At 'injected-failure' $before
$backup = Join-Path $fixtures 'injected-failure.backup'
Expect-Refusal { Invoke-LockedHelperInstall -Target $target -CandidateBytes $after -BaseSha $baseSha -CandidateSha $newSha -Backup $backup -InjectWriteFailure }
Assert-True ((Get-FileHash -LiteralPath $target).Hash -eq $baseSha) 'Partial-write failure was not restored'
Assert-True ((Get-FileHash -LiteralPath $backup).Hash -eq $baseSha) 'Failure backup mismatch'
$results += @{ Case='injected partial write restored under lock'; Pass=$true }

@{ Cases=$results; Passed=$results.Count; Failed=0; FixtureRoot=$fixtures; GlobalWrites=$false } | ConvertTo-Json -Depth 5

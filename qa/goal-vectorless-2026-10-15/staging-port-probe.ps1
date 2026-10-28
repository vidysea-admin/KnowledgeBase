$ErrorActionPreference = 'Stop'
$queryErrors = @()
try {
  $rows = @(Get-NetTCPConnection -LocalPort 27029 -State Listen -ErrorAction SilentlyContinue -ErrorVariable queryErrors)
  if ($queryErrors.Count -gt 0 -and @($queryErrors | Where-Object { $_.FullyQualifiedErrorId -notlike 'CmdletizationQuery_NotFound*' }).Count -gt 0) {
    @{ status='unknown'; port=27029; listeners=@() } | ConvertTo-Json -Compress
    exit 1
  }
  $safeRows = @($rows | Select-Object LocalPort,OwningProcess)
  @{ status=$(if($safeRows.Count -gt 0){'collision'}else{'available'});port=27029;listeners=$safeRows } | ConvertTo-Json -Depth 4 -Compress
} catch {
  @{ status='unknown';port=27029;listeners=@() } | ConvertTo-Json -Compress
  exit 1
}

# CODE ONLY until root CPU broker admits decompression. Never runs vendor binaries.
$ErrorActionPreference='Stop'
$prep=$PSScriptRoot
$zip=Join-Path $prep 'vendor/mongodb-8.0.34.zip'
$dest=Join-Path $prep 'vendor/selected'
$receipt=[ordered]@{started=[DateTime]::UtcNow.ToString('o');binaryExecuted=$false;ok=$false}
$archive=$null
try {
  [Diagnostics.Process]::GetCurrentProcess().PriorityClass='BelowNormal'
  $expected='6b021a0864494e4decf278b36477a29eb36072432773e4e62c2f42c302630db0'
  if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {throw 'checksum-mismatch'}
  if (Test-Path -LiteralPath $dest) {throw 'existing-extraction-refused'}
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive=[IO.Compression.ZipFile]::OpenRead($zip)
  $chosen=@(); $sum=0L
  foreach ($entry in $archive.Entries) {
    $name=$entry.FullName.Replace('\','/')
    if ($name.StartsWith('/') -or $name -match '(^|/)\.\.(/|$)|:|\x00' -or (($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000) {throw 'unsafe-archive-entry'}
    if ($name -match '^[^/]+/bin/(mongod\.exe|[^/]+\.dll)$|^[^/]+/(LICENSE[^/]*|THIRD-PARTY-NOTICES[^/]*|MPL-2[^/]*)$') {
      $sum+=$entry.Length
      if ($sum -gt 512MB -or ((Get-Item -LiteralPath $zip).Length+$sum) -gt 2GB) {throw 'selected-extraction-byte-limit'}
      $chosen+=@{entry=$entry;name=$name}
    }
  }
  if (@($chosen | Where-Object {$_.name -match '/bin/mongod\.exe$'}).Count -ne 1) {throw 'missing-or-duplicate-mongod'}
  New-Item -ItemType Directory -Path $dest | Out-Null
  $base=[IO.Path]::GetFullPath($dest)+[IO.Path]::DirectorySeparatorChar
  $deadline=[DateTime]::UtcNow.AddSeconds(180)
  $files=@(); $written=0L
  foreach ($item in $chosen) {
    $target=[IO.Path]::GetFullPath((Join-Path $dest $item.name))
    if (-not $target.StartsWith($base,[StringComparison]::OrdinalIgnoreCase)) {throw 'extraction-escaped-root'}
    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
    $inputStream=$item.entry.Open(); $outputStream=$null
    try {
      $outputStream=[IO.File]::Open($target,[IO.FileMode]::CreateNew)
      $buffer=[byte[]]::new(1048576); $entryBytes=0L
      while (($count=$inputStream.Read($buffer,0,$buffer.Length)) -gt 0) {
        if ([DateTime]::UtcNow -gt $deadline) {throw 'extraction-deadline'}
        $entryBytes+=$count; $written+=$count
        if ($entryBytes -gt $item.entry.Length -or $written -gt 512MB) {throw 'extraction-stream-byte-limit'}
        $outputStream.Write($buffer,0,$count)
      }
      if ($entryBytes -ne $item.entry.Length) {throw 'extraction-length-mismatch'}
    } finally {$inputStream.Dispose(); if ($outputStream) {$outputStream.Dispose()}}
    $signature=$null
    if ($target -match '\.(exe|dll)$') {
      $auth=Get-AuthenticodeSignature -LiteralPath $target
      $signature=@{status=[string]$auth.Status;subject=$auth.SignerCertificate.Subject;thumbprint=$auth.SignerCertificate.Thumbprint}
      # Informational passive result. Official ZIP metadata SHA256 is the provenance
      # gate; root explicitly permits known NotSigned without claiming signed proof.
    }
    $files+=@{path=$item.name;bytes=$entryBytes;sha256=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant();signature=$signature}
  }
  $receipt.files=$files; $receipt.selectedBytes=$written; $receipt.ok=$true
} catch {$receipt.errorType=$_.Exception.GetType().Name; $receipt.errorMessage=$_.Exception.Message}
finally {
  if ($archive) {$archive.Dispose()}
  $receipt.completed=[DateTime]::UtcNow.ToString('o')
  $receipt|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $prep 'vendor-extraction.json')
}
$receipt|ConvertTo-Json -Depth 8
if (-not $receipt.ok) {exit 1}

# Passive dependency preparation only. Never executes the downloaded artifact.
$ErrorActionPreference='Stop'
$prep=$PSScriptRoot
$vendor=Join-Path $prep 'vendor'
$zip=Join-Path $vendor 'mongodb-8.0.34.zip'
$partial=$zip+'.partial'
$expected='6b021a0864494e4decf278b36477a29eb36072432773e4e62c2f42c302630db0'
$url='https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-8.0.34.zip'
$receipt=[ordered]@{started=[DateTime]::UtcNow.ToString('o');url=$url;downloaded=$false;verified=$false;binaryExecuted=$false;errorType=$null}
$client=$null; $response=$null; $stream=$null; $output=$null; $hash=$null
try {
  [Diagnostics.Process]::GetCurrentProcess().PriorityClass='BelowNormal'
  $free=(Get-PSDrive -Name C).Free
  $receipt.freeBefore=$free
  if ($free -lt 4GB) { throw 'insufficient-free-disk' }
  New-Item -ItemType Directory -Path $vendor -Force | Out-Null
  if (Test-Path -LiteralPath $zip) {
    $actual=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expected) { throw 'existing-artifact-checksum-mismatch' }
    $receipt.reused=$true
    $receipt.sha256=$actual
    $receipt.bytes=(Get-Item -LiteralPath $zip).Length
    $receipt.verified=$true
  } else {
    if (Test-Path -LiteralPath $partial) { throw 'existing-partial-refuse-retry' }
    Add-Type -AssemblyName System.Net.Http
    $client=[System.Net.Http.HttpClient]::new()
    $client.Timeout=[TimeSpan]::FromSeconds(180)
    $deadline=[Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds(180))
    $response=$client.GetAsync($url,[System.Net.Http.HttpCompletionOption]::ResponseHeadersRead,$deadline.Token).GetAwaiter().GetResult()
    $response.EnsureSuccessStatusCode() | Out-Null
    $length=$response.Content.Headers.ContentLength
    if ($response.RequestMessage.RequestUri.AbsoluteUri -ne $url -or $length -ne 807616685 -or $length -gt 1GB) { throw 'artifact-header-mismatch' }
    $stream=$response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
    $output=[IO.File]::Open($partial,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    $hash=[Security.Cryptography.IncrementalHash]::CreateHash([Security.Cryptography.HashAlgorithmName]::SHA256)
    $buffer=[byte[]]::new(1048576); $total=0L
    while (($count=$stream.ReadAsync($buffer,0,$buffer.Length,$deadline.Token).GetAwaiter().GetResult()) -gt 0) {
      $total+=$count
      if ($total -gt 1GB -or $total -gt $length) { throw 'download-byte-limit' }
      $output.Write($buffer,0,$count); $hash.AppendData($buffer,0,$count)
    }
    $output.Dispose(); $output=$null
    $actual=[Convert]::ToHexString($hash.GetHashAndReset()).ToLowerInvariant()
    $receipt.bytes=$total; $receipt.sha256=$actual
    if ($total -ne $length -or $actual -ne $expected) { throw 'artifact-checksum-mismatch' }
    Move-Item -LiteralPath $partial -Destination $zip
    $receipt.downloaded=$true; $receipt.verified=$true
  }
} catch {
  $receipt.errorType=$_.Exception.GetType().Name
  $receipt.errorMessage=$_.Exception.Message
} finally {
  if ($output) {$output.Dispose()}; if ($stream) {$stream.Dispose()}; if ($response) {$response.Dispose()}; if ($client) {$client.Dispose()}; if ($hash) {$hash.Dispose()}
  $receipt.completed=[DateTime]::UtcNow.ToString('o')
  $receipt | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $prep 'vendor-download.json')
}
$receipt | ConvertTo-Json -Depth 5
if (-not $receipt.verified) { exit 1 }

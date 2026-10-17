param([Parameter(Mandatory=$true)][int]$ServerPid)
$ErrorActionPreference='Stop'
try {
  $process=Get-Process -Id $ServerPid -ErrorAction Stop
  # No address-family filter: include IPv4/IPv6 and wildcard listeners.
  $rows=@(Get-NetTCPConnection -LocalPort 27029 -ErrorAction Stop | ForEach-Object {
    @{localAddress=$_.LocalAddress;localPort=$_.LocalPort;remoteAddress=$_.RemoteAddress;
      remotePort=$_.RemotePort;state=[string]$_.State;pid=$_.OwningProcess}
  })
  @{pid=$process.Id;creationFileTime=[string]$process.StartTime.ToUniversalTime().ToFileTimeUtc();
    image=$process.Path;rows=$rows}|ConvertTo-Json -Depth 5 -Compress
} catch { exit 1 } # Never emit raw errors/paths or secrets.

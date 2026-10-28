param([Parameter(Mandatory=$true)][string]$TargetPath)
$ErrorActionPreference = 'Stop'
$resolvedPath = [IO.Path]::GetFullPath($TargetPath)
$directoryAcl = Get-Acl -LiteralPath $resolvedPath
$currentIdentitySid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$ownerIdentitySid = $directoryAcl.GetOwner([Security.Principal.SecurityIdentifier]).Value
$accessRules = @($directoryAcl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]) | ForEach-Object {
    @{ sid = $_.IdentityReference.Value;
       type = $_.AccessControlType.ToString(); rights = [long]$_.FileSystemRights }
})
@{ path = $resolvedPath; currentSid = $currentIdentitySid; ownerSid = $ownerIdentitySid; rules = $accessRules } |
    ConvertTo-Json -Depth 5 -Compress

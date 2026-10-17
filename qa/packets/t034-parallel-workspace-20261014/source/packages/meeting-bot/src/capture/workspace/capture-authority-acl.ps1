param([Parameter(Mandatory=$true)][string]$TargetPath)
$ErrorActionPreference = 'Stop'
$captureAuthorityPath = [IO.Path]::GetFullPath($TargetPath)
$captureAuthorityAcl = Get-Acl -LiteralPath $captureAuthorityPath
$captureServiceSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$captureOwnerSid = $captureAuthorityAcl.GetOwner([Security.Principal.SecurityIdentifier]).Value
$captureRules = @($captureAuthorityAcl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]) | ForEach-Object {
    @{ sid = $_.IdentityReference.Value; type = $_.AccessControlType.ToString(); rights = [long]$_.FileSystemRights }
})
@{ path = $captureAuthorityPath; currentSid = $captureServiceSid; ownerSid = $captureOwnerSid; rules = $captureRules } |
    ConvertTo-Json -Depth 5 -Compress

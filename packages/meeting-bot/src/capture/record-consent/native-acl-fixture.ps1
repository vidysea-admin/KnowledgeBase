# Test-only setup authorized for new UUID-owned directories under this repository's evidence root.
# Production private-acl.ps1 remains read-only. Never modify an existing directory's ACL.
param([Parameter(Mandatory=$true)][ValidateSet('Create','Cleanup')][string]$Action,
      [string]$FixtureDirectory)
$ErrorActionPreference = 'Stop'
$workspaceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..\..'))
$fixtureBase = [IO.Path]::GetFullPath((Join-Path $workspaceRoot 'qa\evidence\native-acl-fixtures'))
function Assert-PhysicalDirectory([string]$directory) {
    for ($candidate = $directory; $candidate; $candidate = [IO.Path]::GetDirectoryName($candidate)) {
        if ([IO.Directory]::Exists($candidate)) {
            $item = Get-Item -LiteralPath $candidate -Force
            if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
                throw 'Redirected fixture directory'
            }
        } elseif ([IO.File]::Exists($candidate)) { throw 'Fixture directory is a file' }
    }
}
Assert-PhysicalDirectory $fixtureBase
$currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
if ($Action -eq 'Create') {
    if ($FixtureDirectory) { throw 'Create does not accept a preexisting target' }
    [void][IO.Directory]::CreateDirectory($fixtureBase)
    $fixtureId = [Guid]::NewGuid().ToString()
    $target = Join-Path $fixtureBase $fixtureId
    if (Test-Path -LiteralPath $target) { throw 'Fixture UUID already exists' }
    $acl = [Security.AccessControl.DirectorySecurity]::new()
    $acl.SetAccessRuleProtection($true, $false)
    $acl.SetOwner($currentSid)
    $fixtureSids = @($currentSid.Value, 'S-1-5-18', 'S-1-5-32-544') | Select-Object -Unique
    foreach ($sid in $fixtureSids) {
        $identity = [Security.Principal.SecurityIdentifier]::new($sid)
        $rule = [Security.AccessControl.FileSystemAccessRule]::new($identity,
            [Security.AccessControl.FileSystemRights]::FullControl,
            ([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit),
            [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow)
        [void]$acl.AddAccessRule($rule)
    }
    # .NET Framework applies this DACL at creation; no Set-Acl on an existing path.
    [void][IO.Directory]::CreateDirectory($target, $acl)
    Assert-PhysicalDirectory $target
    $marker = @{kind='T011-native-acl-fixture';id=$fixtureId;currentSid=$currentSid.Value;directory=$target}
    $marker | ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $target '.t011-fixture.json') -Encoding UTF8
    @{fixtureDirectory=$target;fixtureId=$fixtureId} | ConvertTo-Json -Compress
} else {
    if (-not $FixtureDirectory -or -not [IO.Path]::IsPathRooted($FixtureDirectory)) { throw 'Absolute owned fixture required' }
    $target = [IO.Path]::GetFullPath($FixtureDirectory)
    $fixtureId = [IO.Path]::GetFileName($target)
    if ([IO.Path]::GetDirectoryName($target) -ine $fixtureBase -or $fixtureId -notmatch '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$') {
        throw 'Cleanup target is outside the owned fixture base'
    }
    Assert-PhysicalDirectory $target
    $markerFile = Get-Item -LiteralPath (Join-Path $target '.t011-fixture.json') -Force
    if ($markerFile.PSIsContainer -or ($markerFile.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Redirected fixture ownership marker' }
    $marker = Get-Content -LiteralPath (Join-Path $target '.t011-fixture.json') -Raw | ConvertFrom-Json
    if ($marker.kind -ne 'T011-native-acl-fixture' -or $marker.id -ne $fixtureId -or $marker.currentSid -ne $currentSid.Value -or $marker.directory -ine $target) {
        throw 'Cleanup ownership marker mismatch'
    }
    if ((Get-Acl -LiteralPath $target).GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $currentSid.Value) { throw 'Cleanup owner changed' }
    if (Get-ChildItem -LiteralPath $target -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) {
        throw 'Redirected fixture descendant'
    }
    Remove-Item -LiteralPath $target -Recurse -Force
    if (Test-Path -LiteralPath $target) { throw 'Fixture cleanup incomplete' }
    @{removed=$target} | ConvertTo-Json -Compress
}

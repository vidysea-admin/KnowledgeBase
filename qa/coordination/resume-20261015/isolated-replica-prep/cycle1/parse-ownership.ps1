$ErrorActionPreference='Stop'
$tokens=$null; $parseErrors=$null
[Management.Automation.Language.Parser]::ParseFile((Join-Path (Split-Path -Parent $PSScriptRoot) 'verify-owned-socket.ps1'),[ref]$tokens,[ref]$parseErrors)|Out-Null
@{node='verify-owned-socket/passive-parse';ok=($parseErrors.Count -eq 0);errors=@($parseErrors|ForEach-Object{$_.Message})}|ConvertTo-Json -Depth 4
if ($parseErrors.Count) {exit 1}

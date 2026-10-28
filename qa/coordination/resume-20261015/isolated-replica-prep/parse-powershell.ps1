# Passive parser only: does not invoke either parsed script.
$ErrorActionPreference='Stop'
$records=@()
foreach ($name in @('download-verified.ps1','extract-passive.ps1')) {
  $tokens=$null; $parseErrors=$null
  [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $name),[ref]$tokens,[ref]$parseErrors) | Out-Null
  $records += @{node=('powershell_parse/'+$name);ok=($parseErrors.Count -eq 0);errors=@($parseErrors | ForEach-Object {$_.Message})}
}
$records|ConvertTo-Json -Depth 5
if (@($records | Where-Object {-not $_.ok}).Count -gt 0) {exit 1}

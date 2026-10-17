$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Get-Location).Path)
$base='qa/coordination/resume-20261015'
$plan=Get-Content "$base/native-structure-plan.json" -Raw | ConvertFrom-Json
$out=Join-Path $root "$base/native-structure-maker"
[IO.Directory]::CreateDirectory($out) | Out-Null
function Confined([string]$rel) {
  $full=[IO.Path]::GetFullPath((Join-Path $root $rel))
  if(!$full.StartsWith($root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw "Outside workspace: $rel"}
  return $full
}
function Hash([string]$p){return (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
$paths=@(@($plan.moves.old)+@($plan.importUpdates.file) | Sort-Object -Unique)
$integration=Get-Content "$base/integration-type-repairs/candidate-pins.json" -Raw | ConvertFrom-Json
foreach($pin in $integration){if($paths -contains $pin.path){throw "Lease overlap: $($pin.path)"}}
$before=@()
foreach($rel in $paths){
  $src=Confined $rel
  if(!(Test-Path -LiteralPath $src -PathType Leaf)){throw "Missing $rel"}
  $backup=Join-Path $out ('before-'+$rel.Replace('/','__'))
  if(Test-Path -LiteralPath $backup){throw "Backup exists: $backup"}
  [IO.File]::WriteAllBytes($backup,[IO.File]::ReadAllBytes($src))
  if((Hash $backup) -ne (Hash $src)){throw 'Backup mismatch'}
  $before+=@{path=$rel;exists=$true;sha256=(Hash $src);backup=[IO.Path]::GetRelativePath($root,$backup).Replace('\','/')}
}
foreach($m in $plan.moves){$dest=Confined $m.new;if(Test-Path -LiteralPath $dest){throw "Destination exists: $($m.new)"};$before+=@{path=$m.new;exists=$false}}
$before | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $out 'before.json') -Encoding utf8
# Latin1 is a reversible byte-to-character mapping; ASCII edits preserve all unrelated bytes.
$encoding=[Text.Encoding]::Latin1
$expected=@{}
foreach($rel in $paths){$expected[$rel]=$encoding.GetString([IO.File]::ReadAllBytes((Confined $rel)))}
foreach($change in $plan.importUpdates){foreach($r in $change.replacements){if(!$expected[$change.file].Contains($r.old)){throw "Stale replacement $($change.file): $($r.old)"};$expected[$change.file]=$expected[$change.file].Replace($r.old,$r.new)}}
foreach($change in $plan.assetResolutionUpdates){if(!$expected[$change.file].Contains($change.old)){throw 'Stale asset URL'};$expected[$change.file]=$expected[$change.file].Replace($change.old,$change.new)}
foreach($m in $plan.moves){$src=Confined $m.old;$dest=Confined $m.new;[IO.Directory]::CreateDirectory((Split-Path $dest))|Out-Null;Move-Item -LiteralPath $src -Destination $dest}
$after=@()
foreach($rel in $paths){
  $move=@($plan.moves|Where-Object old -eq $rel)
  $destRel=if($move.Count){$move[0].new}else{$rel}
  $dest=Confined $destRel
  $original=$encoding.GetString([IO.File]::ReadAllBytes($dest))
  if($original -ne $expected[$rel]){[IO.File]::WriteAllBytes($dest,$encoding.GetBytes($expected[$rel]))}
  $actual=[IO.File]::ReadAllBytes($dest);$want=$encoding.GetBytes($expected[$rel])
  if(![Linq.Enumerable]::SequenceEqual[byte]($actual,$want)){throw "Byte mismatch $destRel"}
  $after+=@{oldPath=$rel;path=$destRel;sha256=(Hash $dest);bytes=$actual.Length;nonblank=@($encoding.GetString($actual).Split("`n")|Where-Object {$_.Trim().Length}).Count}
}
$counts=@{capture=@(Get-ChildItem (Confined 'packages/meeting-bot/src/capture') -File).Count;native=@(Get-ChildItem (Confined 'packages/meeting-bot/src/capture/native') -File).Count}
if($counts.capture -ne 29 -or $counts.native -ne 14){throw 'Unexpected loose file counts'}
$after|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $out 'candidate-pins.json') -Encoding utf8
@{status='MOVED_NOT_RUNTIME_CHECKED';counts=$counts;actual_total_tokens=$null;active_s=$null;token_metric='actual_total';moves=$plan.moves;sourcePins="$base/native-structure-maker/candidate-pins.json";preimagePins="$base/native-structure-maker/before.json";oldReceiptsPreserved=$true;integrationLeaseDisjoint=$true}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $out 'checkpoint.json') -Encoding utf8
Write-Output "Moved14; capture=$($counts.capture), native=$($counts.native); byte-verified23 candidate paths. No runtime checks."

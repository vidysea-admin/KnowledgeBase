$ErrorActionPreference='Stop'
$root=(Get-Location).Path
$d='qa/coordination/resume-20261015'
$out="$d/local-wip-post-d50"
New-Item -ItemType Directory -Path $out -Force|Out-Null
$base='d50a25c200dcbcf574ecade0aa205f5fcb45c5f8'
$index=@(git diff --cached --name-only)
if($LASTEXITCODE -ne 0 -or $index.Count){throw 'Nonempty/unreadable index: preserved; checkpoint preparation blocked'}
$head=(git rev-parse HEAD).Trim()
if($head -ne $base){throw 'Unexpected HEAD: no preparation against a different base'}
$status=@{}
foreach($line in @(git -c core.quotepath=false status --porcelain=v1 --untracked-files=all)){
 if($line.Length -ge 4){$status[$line.Substring(3).Trim('"').Replace('\','/')]=$line.Substring(0,2)}
}
$baseline=@{}
foreach($line in @(git -c core.quotepath=false ls-tree -r $base)){
 if($line -match '^\d+ blob ([a-f0-9]+)\t(.+)$'){$baseline[$Matches[2]]=$Matches[1]}
}
$paths=@{};$expected=@{};$deferred=@()
function AddPath([string]$path,[string]$owner,[string]$packet,[string]$pin=''){
 $path=$path.Replace('\','/')
 if($path.StartsWith($root.Replace('\','/')+'/')){$path=$path.Substring($root.Length+1)}
 if(-not $status.ContainsKey($path)){return}
 $paths[$path]=@{path=$path;owner=$owner;packet=$packet}
 if($pin){$expected[$path]=$pin}
}
foreach($entry in (Get-Content "$d/native-next-maker/combined-source-pins-genuine-phase-observer.json" -Raw|ConvertFrom-Json)){
 if($entry.path -in @('scripts/native-capture/server.ts','scripts/native-capture/server.test.ts')){
  $deferred+=@{path=$entry.path;reason='Central server join active; latest freeze and broker evidence required'};continue
 }
 AddPath $entry.path 'native-next-maker' "$d/native-next-maker/combined-source-pins-genuine-phase-observer.json" $entry.sha256
}
foreach($entry in (Get-Content "$d/watched-cadence/source-pins.json" -Raw|ConvertFrom-Json)){
 AddPath $entry.path 'watched-cadence' "$d/watched-cadence/source-pins.json" $entry.sha256
}
foreach($entry in (Get-Content "$d/eval-pilot/complete-answer-cycle3/pins.json" -Raw|ConvertFrom-Json).pins){
 AddPath $entry.path 'complete-answer-cycle3' "$d/eval-pilot/complete-answer-cycle3/pins.json" $entry.sha256
}
foreach($entry in (Get-Content "$d/isolated-replica-prep/cycle1/source-manifest.json" -Raw|ConvertFrom-Json)){
 AddPath $entry.path 'isolated-replica-prep-cycle1' "$d/isolated-replica-prep/cycle1/source-manifest.json" $entry.sha256
}
foreach($path in (Get-Content "$d/native-next-maker/deleted-source-paths-stage2.json" -Raw|ConvertFrom-Json)){
 AddPath $path 'native-next-db-structure' "$d/native-next-maker/deleted-source-paths-stage2.json"
}
$unitDirs=@('native-next-maker','watched-cadence','isolated-replica-prep','eval-pilot/complete-answer-cycle3','eval-pilot/complete-answer')
$omitted=@()
foreach($unit in $unitDirs){
 foreach($file in Get-ChildItem "$d/$unit" -File -Recurse -Force){
  $path=$file.FullName.Substring($root.Length+1).Replace('\','/')
  if($path -match '/(backups?|preimages|rawbacks|source-pins|central-server-join)(/|$)|\.(bin|bytes|raw|zip|exe|dll|msi|wav|mp4|webm|pyc)$|/private|/payload|/vendor/' -or $file.Length -gt 4000000){$omitted+=@{path=$path;reason='Source copy/private/binary/large/unfrozen boundary'};continue}
  AddPath $path $unit "$d/$unit/packet.md"
 }
}
foreach($file in Get-ChildItem "$d/broker" -File){
 if($file.Name -match '^(native-next-|genuine-phase-observer-|genuine-seal-isolated-|watched-cadence-|complete-answer-cycle3-|isolated-replica-)'){
  AddPath ($file.FullName.Substring($root.Length+1).Replace('\','/')) 'sole-broker scoped history/receipts' "$d/broker/$($file.Name)"
 }
}
# Reuse ONLY the scanner rule expression from the existing commit helper; never invoke its staging/commit body.
$helper="$d/create-local-milestone.ps1"
$helperLines=Get-Content $helper
$ruleLine=@($helperLines|Where-Object{$_ -match '^\s*\$patterns=@\('})
if($ruleLine.Count -ne 1){throw 'Existing scanner rule extraction ambiguous'}
Invoke-Expression $ruleLine[0]
$entries=@();$findings=@();$blocked=@();$totalBytes=0
foreach($path in @($paths.Keys|Sort-Object)){
 $meta=$paths[$path]
 if($path -match '^raw/|^data/|^sources/|(^|/)\.env|^qa/contracts/|^contracts/|^AGENTS.md$|^ARCHITECTURE.md$|^docs/DECISIONS.md$|^TASKS.md$|^\.goal/|(^|/)\.codex/|scripts/append_decision.ps1|^qa/issues|^qa/QUEUE.md$'){$blocked+=@{path=$path;reason='Forbidden governance/private/global path'};continue}
 $exists=Test-Path -LiteralPath $path -PathType Leaf
 $entry=[ordered]@{path=$path;owner=$meta.owner;packet=$meta.packet;status=$status[$path];mutation=if($exists){if($baseline.ContainsKey($path)){'modify'}else{'add'}}else{'delete'};beforeD50Blob=if($baseline.ContainsKey($path)){$baseline[$path]}else{$null};beforeD50Proof=if($baseline.ContainsKey($path)){'git ls-tree -r d50a25c200dcbcf574ecade0aa205f5fcb45c5f8; current porcelain delta'}else{'Absent from immutable d50 tree; unit packet provenance'};sha256=$null;bytes=0;packetPin=$expected[$path];packetPinMatches=$null}
 if($exists){
  $bytes=[IO.File]::ReadAllBytes((Join-Path $root $path));$entry.bytes=$bytes.Length;$totalBytes+=$bytes.Length
  $entry.sha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
  if($expected.ContainsKey($path)){$entry.packetPinMatches=$entry.sha256 -eq $expected[$path]}
  if($bytes -contains 0){$findings+=@{path=$path;type='binary-NUL';count=1}}
  else{$text=[Text.Encoding]::UTF8.GetString($bytes);foreach($rule in $patterns){$count=[regex]::Matches($text,$rule.r).Count;if($count){$findings+=@{path=$path;type=$rule.type;count=$count}}}}
 }
 $entries+=,$entry
}
$scan=[ordered]@{schema='post-d50-content-safety/1';recordedAt=(Get-Date).ToUniversalTime().ToString('o');helper=$helper;helperSha256=(Get-FileHash $helper).Hash.ToLowerInvariant();method='Extract existing helper scanner pattern assignment only; inspect exact raw candidate bytes without invoking staging/commit helper';files=$entries.Count;bytes=$totalBytes;findings=$findings;findingCount=[int](@($findings|Measure-Object count -Sum).Sum);valuesPersisted=$false;limitation='Heuristic patterns; arbitrary private prose and unknown formats not certified; findings require safe path-only disposition';actions=@{staging=0;commit=0;push=0;tests=0;database=0;provider=0}}
$scan|ConvertTo-Json -Depth 8|Set-Content "$out/content-safety.json" -Encoding utf8
$manifest=[ordered]@{schema='post-d50-local-wip-allowlist/1';recordedAt=(Get-Date).ToUniversalTime().ToString('o');root=$root;head=$head;indexEmpty=$true;state='PREPARATION_ONLY_AWAIT_ROOT_EXACT_STAGING_GRANT';entries=$entries;deletions=@($entries|Where-Object mutation -eq 'delete');deferred=$deferred;excluded=$omitted;blocked=$blocked;pinDrift=@($entries|Where-Object {$_.packetPinMatches -eq $false});safetyReceipt="$out/content-safety.json";actions=@{staging=0;commit=0;push=0;config=0;tests=0;database=0;provider=0};truth='LOCAL WIP/HOLD. Native 210 terminal =206 PASS/4 SKIP, original failures retained; intermittent recovered-unavailable failure unexplained. Replica PASS only offline source cycle1; runtime readiness HOLD and original FAIL retained. Eval human approval pending. Host/Mongo/native/privacy/downstream/release gates open. No generalized unit/source acceptance or release claim.'}
$manifest|ConvertTo-Json -Depth 10|Set-Content "$out/allowlist.json" -Encoding utf8
($entries|ForEach-Object{$_.path})|Set-Content "$out/exact-paths.txt" -Encoding utf8
@{candidateCount=$entries.Count;deletions=@($manifest.deletions).Count;deferred=$deferred.Count;pinDrift=@($manifest.pinDrift).Count;scanFindingRecords=$findings.Count;scanFindingCount=$scan.findingCount;bytes=$totalBytes;indexEmpty=$true}|ConvertTo-Json

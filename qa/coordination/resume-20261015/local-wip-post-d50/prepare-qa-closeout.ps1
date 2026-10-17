$ErrorActionPreference='Stop'
$d='qa/coordination/resume-20261015';$out="$d/local-wip-post-d50";$base='ec143c9e57a1b2bb13ee66a0b127e720fdf2dca6';$root=(Get-Location).Path
if((git rev-parse HEAD).Trim() -ne $base -or @(git diff --cached --name-only).Count){throw 'QA-only HEAD/index preparation gate failed'}
$metadata="$d/native-next-maker/watched-cadence-review/closeout/final-metadata-paths.json"
if((Get-FileHash $metadata).Hash.ToLowerInvariant() -ne '2848080ed754707b9932d6dd7f8fe11314478df0abb9e583d8cf30bfc8513250'){throw 'Exact59 metadata manifest identity mismatch'}
$list=Get-Content $metadata -Raw|ConvertFrom-Json
if($list.count -ne 59 -or $list.records.Count -ne 59 -or $list.source_candidate -ne $base){throw 'Exact59 source/count mismatch'}
$status=@{};foreach($l in @(git -c core.quotepath=false status --porcelain=v1 --untracked-files=all 2>$null)){if($l.Length -ge 4){$status[$l.Substring(3).Trim('"').Replace('\','/')]=$l.Substring(0,2)}}
$baseline=@{};foreach($l in @(git -c core.quotepath=false ls-tree -r $base)){if($l -match '^\d+ blob ([a-f0-9]+)\t(.+)$'){$baseline[$Matches[2]]=$Matches[1]}}
$paths=@($list.records|ForEach-Object{@{path=$_.path;sha256=$_.sha256;owner='checked-PASS cycle2 exact metadata';origin=$metadata}})
$request="$d/native-next-maker/remaining-native-guards-request.json"
$requestHash=(Get-FileHash $request).Hash.ToLowerInvariant();if(-not $requestHash.StartsWith('f33999')){throw 'Guard request root hash prefix mismatch'}
foreach($p in @($metadata,"$out/local-commit-receipt.json",$request)){$paths+=@{path=$p;sha256=(Get-FileHash $p).Hash.ToLowerInvariant();owner='root-authorized explicit QA supplement';origin='Root exact local QA-only checkpoint grant'}}
$rules=@(Get-Content "$d/create-local-milestone.ps1"|Where-Object{$_ -match '^\s*\$patterns=@\('});Invoke-Expression $rules[0]
$entries=@();$unchanged=@();$findings=@();$bytesTotal=0
foreach($p in $paths){
 if($p.path -notmatch '^qa/' -or $p.path -match '^qa/contracts/|/private-run-|/vendor/|\.projection\.json$'){throw 'QA-only forbidden boundary'}
 if((Get-FileHash -LiteralPath $p.path).Hash.ToLowerInvariant() -ne $p.sha256){throw "Pinned QA bytes drift: $($p.path)"}
 $isChanged=$status.ContainsKey($p.path)
 $ignoredNew=$p.path.EndsWith('.log') -and -not $baseline.ContainsKey($p.path)
 if(-not $isChanged -and -not $ignoredNew){$unchanged+=$p.path;continue}
 $bytes=[IO.File]::ReadAllBytes((Join-Path $root $p.path));$bytesTotal+=$bytes.Length
 if($bytes -contains 0){$findings+=@{path=$p.path;type='binary-NUL';count=1}}else{$text=[Text.Encoding]::UTF8.GetString($bytes);foreach($r in $patterns){$n=[regex]::Matches($text,$r.r).Count;if($n){$findings+=@{path=$p.path;type=$r.type;count=$n}}}}
 $entries+=@{path=$p.path;sha256=$p.sha256;bytes=$bytes.Length;mutation=if($baseline.ContainsKey($p.path)){'modify'}else{'add'};status=if($ignoredNew){'!!'}else{$status[$p.path]};beforeEcBlob=$baseline[$p.path];owner=$p.owner;origin=$p.origin}
}
$sourcePins=Get-Content "$d/native-next-maker/watched-cadence-review/candidate-source-pins.json" -Raw|ConvertFrom-Json
if($sourcePins.Count -ne 8){throw 'Expected exact eight source pins'}
foreach($p in $sourcePins){if((Get-FileHash -LiteralPath $p.path).Hash.ToLowerInvariant() -ne $p.sha256){throw 'Eight-source drift during QA closeout prep'}}
$output=[ordered]@{schema='qa-only-local-closeout-candidate/1';state='PREPARED_WAITING_REMAINING_NATIVE_GUARD_BROKER_RELEASE_NO_STAGE';head=$base;metadata59Manifest=$metadata;metadata59ManifestSha256='2848080ed754707b9932d6dd7f8fe11314478df0abb9e583d8cf30bfc8513250';entries=$entries;unchangedOmitted=$unchanged;counts=@{paths=$entries.Count;bytes=$bytesTotal};guardRequest=@{path=$request;sha256=$requestHash};source8Pins=$sourcePins;source8ContentIdentity='6bf34891db9aae674d6842c7929c92ba28cb13da8ac7e2dbb24a0ef53307dfec';scan=@{findings=$findings;findingCount=[int](@($findings|Measure-Object count -Sum).Sum);valuesPersisted=$false};indexEmpty=$true;actions=@{stage=0;commit=0;push=0};openGates='Parent39 remains in_progress. Contracts invocation green by vacuity. Four native prerequisite skips, unexplained intermittent recovery, live/human/host/Mongo/downstream/release gates and unknown10%metrics remain open. Source8 independentPASS is local implementation/offline slice only.'}
$output|ConvertTo-Json -Depth 15|Set-Content "$out/qa-closeout-prepared.json" -Encoding utf8
if($findings.Count){throw 'Exact new QA bytes scan findings require redacted disposition'}
[pscustomobject]@{paths=$entries.Count;bytes=$bytesTotal;unchangedOmitted=$unchanged.Count;scanFindings=0;source8Same=$true;indexEmpty=$true;staging=0;guardRequestSha256=$requestHash}|ConvertTo-Json

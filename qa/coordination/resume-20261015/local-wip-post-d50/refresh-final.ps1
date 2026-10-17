$ErrorActionPreference='Stop'
$d='qa/coordination/resume-20261015';$out="$d/local-wip-post-d50";$root=(Get-Location).Path
$base='d50a25c200dcbcf574ecade0aa205f5fcb45c5f8'
if((git rev-parse HEAD).Trim() -ne $base -or @(git diff --cached --name-only).Count){throw 'HEAD/index gate failed; index preserved'}
$original=Get-Content "$out/allowlist.json" -Raw|ConvertFrom-Json
$status=@{};foreach($l in @(git -c core.quotepath=false status --porcelain=v1 --untracked-files=all 2>$null)){if($l.Length -ge 4){$status[$l.Substring(3).Trim('"').Replace('\','/')]=$l.Substring(0,2)}}
$before=@{};foreach($l in @(git -c core.quotepath=false ls-tree -r $base)){if($l -match '^\d+ blob ([a-f0-9]+)\t(.+)$'){$before[$Matches[2]]=$Matches[1]}}
$paths=@{};foreach($e in $original.entries){$paths[$e.path]=@{path=$e.path;owner=$e.owner;packet=$e.packet;original=$e;provenance='Original authorized raw420 retained'}}
function Relative([string]$p){$p=$p.Replace('\','/');if($p.StartsWith($root.Replace('\','/')+'/')){$p=$p.Substring($root.Length+1)};return $p}
function AddExact([string]$p,[string]$owner,[string]$packet,[string]$why){
 $p=Relative $p
 if(-not $status.ContainsKey($p)){
  if($p -match '/broker/.*\.log$' -and (Test-Path -LiteralPath $p -PathType Leaf) -and -not $before.ContainsKey($p)){$status[$p]='!!'}
  else{throw "New candidate is not actual post-d50 mutation: $p"}
 }
 if(-not $paths.ContainsKey($p)){$paths[$p]=@{path=$p;owner=$owner;packet=$packet;original=$null;provenance=$why}}
}
$unitManifest="$d/native-next-maker/combined-source-pins-watched-server-join-repair2.json"
$unit=Get-Content $unitManifest -Raw|ConvertFrom-Json
if($unit.Count -ne 73 -or (Get-FileHash $unitManifest).Hash.ToLowerInvariant() -ne '1ad28fd36efe8eb92c454949ed2305a29dac8c6760f51d0e4dbea2dfabb4c797'){throw '73-pin manifest identity mismatch'}
$pinMap=@{}
foreach($pin in $unit){if((Get-FileHash -LiteralPath $pin.path).Hash.ToLowerInvariant() -ne $pin.sha256){throw "Frozen73 drift: $($pin.path)"};$pinMap[$pin.path]=$pin.sha256;AddExact $pin.path 'native73-joined-final' $unitManifest 'Root authorized exact frozen73 current unit source; preexisting origin retained'}
$formalPacket="$d/native-next-maker/watched-cadence-review/packet.json"
$formal=Get-Content $formalPacket -Raw|ConvertFrom-Json
if($formal.unit.candidate_sha -ne '6bf34891db9aae674d6842c7929c92ba28cb13da8ac7e2dbb24a0ef53307dfec' -or $formal.unit.files.Count -ne 8){throw 'Formal eight-file content identity mismatch'}
foreach($pin in $formal.unit.files){if((Get-FileHash -LiteralPath $pin.path).Hash.ToLowerInvariant() -ne $pin.sha256){throw 'Formal eight-file pin drift'}}
foreach($dir in @('native-next-maker/watched-server-join','native-next-maker/watched-cadence-review','watched-cadence/typing-repair')){
 foreach($f in Get-ChildItem -LiteralPath "$d/$dir" -File -Recurse -Force){
  if($f.Name -match '\.(zip|bin|bytes|exe|dll|pyc|wav|mp4|webm)$'){throw 'Unexpected binary in scoped QA directory'}
  AddExact $f.FullName $dir "$d/$dir/packet.json" 'Exact root-authorized new QA packets, preimages and compiler failure/repair history; no directory outside named unit'
 }
}
foreach($f in Get-ChildItem -LiteralPath "$d/broker" -File){
 if($f.Name -match '^watched-server-repair[12]-|^native-next-split|^native-next-readonly'){
  AddExact $f.FullName 'sole-broker final/historical receipts' "$d/broker/$($f.Name)" 'Root authorized atomic raw logs/receipts/title map/EXIT/read-only history'
 }
}
# Exact raw log dependencies of the already scoped atomic receipts; never directory-force-add.
foreach($meta in @($paths.Values)){
 if($meta.path -notmatch '/broker/.*-receipt\.json$'){continue}
 $receipt=Get-Content -LiteralPath $meta.path -Raw|ConvertFrom-Json
 $logPath=if($receipt.log -is [string]){$receipt.log}else{$receipt.log.path}
 if(-not $logPath){continue}
 $logPath=Relative $logPath
 if($logPath -notmatch '^qa/coordination/resume-20261015/broker/(native-next-|genuine-phase-observer-|genuine-seal-isolated-|watched-cadence-|watched-server-repair[12]-|complete-answer-cycle3-|isolated-replica-).*\.log$'){throw 'Receipt log outside explicitly scoped source units'}
 $logExpected=if($receipt.log -is [string]){$receipt.log_sha256}else{$receipt.log.sha256}
 if($logExpected -and (Get-FileHash -LiteralPath $logPath).Hash.ToLowerInvariant() -ne $logExpected){throw 'Atomic raw log identity mismatch'}
 AddExact $logPath 'exact atomic receipt raw-log dependency' $meta.path 'Exact log path referenced by already scoped atomic receipt; absent from d50 and ignored by existing *.log; requires authorized literal force-add only'
}
foreach($name in @('combined-source-pins-watched-server-join.json','combined-source-pins-watched-server-join-repair1.json','combined-source-pins-watched-server-join-repair2.json')){AddExact "$d/native-next-maker/$name" 'native-final-unit-manifests' $unitManifest 'Exact initial/failed/final source identities'}
# Resolve only canonical CAS references used by the specifically admitted two broker epochs.
$casRefs=@{}
foreach($f in Get-ChildItem -LiteralPath "$d/broker" -File -Filter 'watched-server-repair*.json'){
 $text=Get-Content $f.FullName -Raw
 foreach($match in [regex]::Matches($text,'"path"\s*:\s*"([^"]*pin-manifests[^"]*\.json)"')){
  $p=Relative (('"'+$match.Groups[1].Value+'"')|ConvertFrom-Json)
  $digest=[IO.Path]::GetFileNameWithoutExtension($p)
  if((Get-FileHash -LiteralPath $p).Hash.ToLowerInvariant() -ne $digest){throw 'Canonical CAS content hash mismatch'}
  $casRefs[$p]=$digest;AddExact $p 'broker canonical1688/repair1 input CAS' "$d/broker/$($f.Name)" 'Canonical raw CAS referenced by exact admitted broker receipt; descriptive input identity, not inclusion of every input'
 }
}
$currentCas=Get-Content "$d/broker/pin-manifests/83d54f4a5669c216d3330a3a42472c2fe8ed806466807c65ae2a73a5cc0e2363.json" -Raw|ConvertFrom-Json -AsHashtable
$dependencies=@(
 @{path='scripts/qa/scoped-check-runner.py';sha256='d99983ba54d43ecf22bae2e2bad0dad7a57156d9bb16c36cc38d05d3cce3fc6a';binding='current1688 CAS and actual supervisorSha256'},
 @{path="$d/runtime-alias-repair/register.mjs";sha256='e2af4f52f525032e808eae5452804fe7f83c51869ed427d106a3b128dd22999d';binding='current1688 CAS and historical actual pins'})
foreach($dep in $dependencies){if($status[$dep.path] -ne '??' -or (Get-FileHash $dep.path).Hash.ToLowerInvariant() -ne $dep.sha256 -or $currentCas.files[$dep.path] -ne $dep.sha256){throw 'Exact replay dependency identity mismatch'};AddExact $dep.path 'root-authorized exact replay dependency' "$d/broker/watched-server-repair2-final-seal.json" ('Preexisting untracked helper; required to replay admitted command; '+$dep.binding)}
$brokerLib="$d/broker/broker_lib.py"
if(Test-Path "$out/broker-lib-current-source-exception.json"){
 $exception=Get-Content "$out/broker-lib-current-source-exception.json" -Raw|ConvertFrom-Json
 if($exception.sha256 -ne (Get-FileHash $brokerLib).Hash.ToLowerInvariant()){throw 'Brokerlib root exception source drift'}
 AddExact $brokerLib 'root-authorized exact current replay dependency' "$out/broker-lib-current-source-exception.json" 'Preexisting untracked broker helper imported by admitted runners. Historical exact-byte binding UNKNOWN; current-source inclusion explicitly authorized by root; no retrospective same-byte execution claim.'
}
$rules=@(Get-Content "$d/create-local-milestone.ps1"|Where-Object{$_ -match '^\s*\$patterns=@\('});if($rules.Count -ne 1){throw 'Scanner rule ambiguity'};Invoke-Expression $rules[0]
$entries=@();$changes=@();$findings=@();$newScanned=0;$scanBytes=0;$added=@()
foreach($p in @($paths.Keys|Sort-Object)){
 $meta=$paths[$p];$old=$meta.original
 if(-not $status.ContainsKey($p)){throw "Candidate no longer an actual mutation: $p"}
 if($p -match '^raw/|^data/|^sources/|(^|/)\.env|(^|/)private-run-|/vendor/|^qa/contracts/|^contracts/|^AGENTS.md$|^ARCHITECTURE.md$|^docs/DECISIONS.md$|^TASKS.md$|^\.goal/|(^|/)\.codex/|scripts/append_decision.ps1|\.projection\.json$'){throw "Forbidden boundary: $p"}
 $exists=Test-Path -LiteralPath $p -PathType Leaf
 $entry=[ordered]@{path=$p;owner=$meta.owner;packet=$meta.packet;provenance=$meta.provenance;status=$status[$p];mutation=if($exists){if($before.ContainsKey($p)){'modify'}else{'add'}}else{'delete'};beforeD50Blob=$before[$p];beforeD50Proof=if($before.ContainsKey($p)){'Immutable d50 ls-tree blob plus current porcelain delta'}else{'Absent from immutable d50 tree; current unit scope/provenance explicit'};sha256=$null;bytes=0;frozen73Pin=$pinMap[$p]}
 if($exists){
  $entry.sha256=(Get-FileHash -LiteralPath $p).Hash.ToLowerInvariant();$entry.bytes=(Get-Item -LiteralPath $p).Length
  if($old -and $old.sha256 -ne $entry.sha256){
   if($p -notmatch '^qa/' -and -not $pinMap.ContainsKey($p)){throw "Unapproved source drift: $p"}
   $changes+=@{path=$p;before=$old.sha256;after=$entry.sha256;reason=if($pinMap.ContainsKey($p)){'Exact current frozen73 pin'}else{'Root-authorized scoped QA metadata append; source packet closure refreshed'}}
  }
  if(-not $old -or $old.sha256 -ne $entry.sha256){
   $bytes=[IO.File]::ReadAllBytes((Join-Path $root $p));$scanBytes+=$bytes.Length;$newScanned++
   if($bytes -contains 0){$findings+=@{path=$p;type='binary-NUL';count=1}}
   else{$text=[Text.Encoding]::UTF8.GetString($bytes);foreach($rule in $patterns){$n=[regex]::Matches($text,$rule.r).Count;if($n){$findings+=@{path=$p;type=$rule.type;count=$n}}}}
  }
 }elseif(-not $old -or $old.mutation -ne 'delete') {throw 'Unexpected deletion'}
 if(-not $old){$added+=$p}
 $entries+=,$entry
}
if($findings.Count){$findings|ConvertTo-Json -Depth 4|Set-Content "$out/final-scan-findings.json";throw 'Changed/new candidate secret scan findings require redacted disposition'}
$seal="$d/broker/watched-server-repair2-final-seal.json"
$final=[ordered]@{schema='post-d50-final-local-wip-allowlist/1';state='FROZEN_PREPARATION_ONLY_AWAIT_ROOT_EXPLICIT_STAGE_COMMIT_GRANT';root=$root;base=$base;head=(git rev-parse HEAD).Trim();original420Manifest="$out/allowlist.json";original420ManifestSha256=(Get-FileHash "$out/allowlist.json").Hash.ToLowerInvariant();entries=$entries;addedPaths=$added;changedOriginalEntries=$changes;removedOriginalEntries=@();deletions=@($entries|Where-Object mutation -eq 'delete');unit73=@{manifest=$unitManifest;sha256=(Get-FileHash $unitManifest).Hash.ToLowerInvariant();verified=73};formalEight=@{packet=$formalPacket;packetRawSha256=(Get-FileHash $formalPacket).Hash.ToLowerInvariant();contentIdentity=$formal.unit.candidate_sha;identityKind='dirty-eight-file-content-manifest-NOT-Git-commit';verified=8};currentBrokerSeal=@{path=$seal;sha256=(Get-FileHash $seal).Hash.ToLowerInvariant();observedFocused='16/16; no additional execution by checkpoint worker'};canonicalCAS=$casRefs;replayDependencies=$dependencies;brokerLibHistoricalIdentity=if($paths.ContainsKey($brokerLib)){'UNKNOWN; current bytes exception recorded'}else{'NOT_INCLUDED: waiting root current-source inclusion exception'};closure='Exact unit73 source and raw scoped QA closure plus referenced canonical CAS retained. 1688 broader input map is evidence identity, not a claim all1688 inputs committed here. Runtime binaries/dependencies/private fixtures outside candidate remain recorded environment prerequisites.';safety=@{reusedOriginalScans=($entries.Count-$newScanned-3);changedOrNewFilesScanned=$newScanned;changedOrNewBytesScanned=$scanBytes;findings=@();findingCount=0;valuesPersisted=$false;scannerHelper="$d/create-local-milestone.ps1"};counts=@{paths=$entries.Count;bytes=(@($entries|Measure-Object bytes -Sum).Sum);added=$added.Count;modifiedOriginal=$changes.Count;deleted=3};indexEmpty=(@(git diff --cached --name-only).Count -eq 0);actions=@{stage=0;commit=0;push=0;rawEvidenceEdit=0;tests=0;provider=0;database=0};truth=$original.truth}
$final.counts.bytes=[long]0
foreach($entry in $entries){$final.counts.bytes+=$entry.bytes}
$final['authorizedIgnoredRawLogPaths']=@($entries|Where-Object {$_.status -eq '!!'}|ForEach-Object {$_.path})
$final['priorWordingCorrection']='Original420 included atomic JSON receipts but excluded ignored *.log files. Final candidate explicitly adds exact source-unit log dependencies; no claim they were committed or included earlier.'
$final|ConvertTo-Json -Depth 16|Set-Content "$out/final-allowlist.json" -Encoding utf8
($entries|ForEach-Object path)|Set-Content "$out/final-exact-paths.txt" -Encoding utf8
$receipt=[ordered]@{path="$out/final-allowlist.json";sha256=(Get-FileHash "$out/final-allowlist.json").Hash.ToLowerInvariant();counts=$final.counts;unit73Verified=$true;eightFileIdentity=$formal.unit.candidate_sha;changedNewScan=$final.safety;indexEmpty=$final.indexEmpty;stage=0;commit=0;push=0}
$receipt|ConvertTo-Json -Depth 8|Set-Content "$out/final-preparation-receipt.json" -Encoding utf8
$receipt|ConvertTo-Json -Depth 8

$ErrorActionPreference='Stop'
$d='qa/coordination/resume-20261015';$out="$d/local-wip-post-d50";$root=(Get-Location).Path;$base='d0f6f2eff242f98a85ba4ccde483db08030ba3c8'
if((git rev-parse HEAD).Trim() -ne $base -or @(git diff --cached --name-only).Count){throw 'Prepared-next HEAD/index gate failed'}
$entries=@{};$references=@();$unchanged=@()
function Rel([string]$p){$p=$p.Replace('\','/');if($p.StartsWith($root.Replace('\','/')+'/')){$p=$p.Substring($root.Length+1)};return $p}
function Add([string]$p,[string]$hash,[string]$owner,[string]$why){
 $p=Rel $p
 if($p -notmatch '^qa/|^packages/meeting-bot/src/capture/native/(native-archive-recovery\.test\.ts|testsupport/native-guard-phase\.ts)$' -or $p -match '^qa/contracts/|/vendor/|/private-run-|\.projection\.json$|\.env'){throw 'Next preparation path boundary failed'}
 if(-not(Test-Path -LiteralPath $p -PathType Leaf)){throw "Exact evidence missing: $p"}
 $raw=(Get-FileHash -LiteralPath $p).Hash.ToLowerInvariant();if($hash -and $hash -ne $raw){throw "Exact evidence pin mismatch: $p"}
 if($entries.ContainsKey($p)){return}
 $tracked=@(git ls-tree $base -- $p);$delta=@(git status --porcelain=v1 --untracked-files=all -- $p)
 if($tracked.Count -and -not $delta.Count){$unchanged+=$p;return}
 $entries[$p]=@{path=$p;sha256=$raw;bytes=(Get-Item -LiteralPath $p).Length;mutation=if($tracked.Count){'modify'}else{'add'};status=if($p.EndsWith('.log')){'!!'}elseif($delta.Count){$delta[0].Substring(0,2)}else{'untracked-ignored-explicit'};owner=$owner;origin=$why;baseline=$base}
}
function DirectProof([string]$path,[string]$expected,[string]$owner){
 Add $path $expected $owner 'Exact released terminal or historical proof selected by root'
 $proof=Get-Content -LiteralPath $path -Raw|ConvertFrom-Json
 foreach($refName in @('pins','request','trace','log')){$ref=$proof.$refName;if($ref.path -and $ref.sha256){Add $ref.path $ref.sha256 $owner ('Direct '+$refName+' identity reference from '+$path)}}
 foreach($a in $proof.atomicReceipts){Add $a.path $a.sha256 $owner ('Atomic proof from '+$path);if($a.log.path){Add $a.log.path $a.log.sha256 $owner ('Exact raw log from '+$path)}}
}
$u22List="$d/u22-resume-prep/maker-closeout-allowlist.json";$u22=Get-Content $u22List -Raw|ConvertFrom-Json
foreach($p in $u22.paths){Add $p '' 'u22 independent cycle0 PASS metadata' $u22List}
DirectProof "$d/broker/u22-checker-boundary-final-seal.json" 'f900ca55faa59d8e86b9cdde088691294e8ef348625b99433dddb4e0eb68b603' 'u22 current independent boundary proof'
Add "$d/broker/u22-checker-boundary-run.py" '' 'u22 checker proof reproduction' 'Exact broker runner for checked boundary evidence'
Add "$out/u22-local-commit-receipt.json" '' 'immutable local commit chain' 'Actual d0 source WIP commit receipt; included verbatim'
Add 'packages/meeting-bot/src/capture/native/native-archive-recovery.test.ts' 'aa1de5248f25f941890cb64ff9e89ab61dc4d58f2f3fb3044029aa8ad1869925' 'native vertical diagnostic test maker' 'Frozen267LOC test diagnostic changes; not native acceptance'
Add 'packages/meeting-bot/src/capture/native/testsupport/native-guard-phase.ts' '099b181cf1178182dfb4c81563d662b37dbeded36c8e40aa3fd879592c3b8fad' 'native vertical phase helper maker' 'Frozen63LOC new diagnostic helper; not native acceptance'
foreach($name in @('broker-request.json','node-specific-request.json','packet.json','packet.md','source-pins.json','stage-catalog.json')){Add "$d/native-next-maker/native-guard-phases/$name" '' 'native exact diagnostic unit packet' 'Root identified owned unit packet; no wholeQA glob'}
foreach($name in @('native-phase-diagnostic-final-seal.json','native-bot-compiler60-final-seal.json')){DirectProof "$d/broker/$name" '' 'native prerequisite history'}
DirectProof "$d/broker/native-guard-trace-targeted-trace-helper-five-receipt.json" 'ec59481d1e9e79e1c588c5b0668b21c50cc246214b2bf11251f3f655c569974d' 'native actual five helper checks'
DirectProof "$d/broker/native-original-node1-final-seal.json" '' 'native actual original node1 scoped proof'
Add "$d/broker/native-original-node1-run.py" '' 'native actual node1 reproduction' 'Exact admitted actual node1 runner; node2 still LIVE and excluded'
$hydration="$d/eval-pilot/offline-hydration-audit/admitted-snapshot-repair2/wip-allowlist.json"
if((Get-FileHash $hydration).Hash.ToLowerInvariant() -ne '37e7da4865afd2e1fffeeb326bed5d74c4bc0dcea44f60f17772a20aa92b2bc3'){throw 'Quality exact9 list mismatch'}
$quality=Get-Content $hydration -Raw|ConvertFrom-Json
foreach($p in $quality.files){Add $p.path $p.sha256 'quality exact9 admitted snapshot repair2' $hydration}
Add $hydration '37e7da4865afd2e1fffeeb326bed5d74c4bc0dcea44f60f17772a20aa92b2bc3' 'quality exact9 metadata' 'Exact root-confirmed owner allowlist'
$hydrationSeal=Get-Content "$d/broker/hydration-repair2-final-seal.json" -Raw|ConvertFrom-Json
foreach($a in $hydrationSeal.atomicReceipts){if($a.log.path){Add $a.log.path $a.log.sha256 'quality exact compact proof raw log dependency' 'Direct atomic log from already approved hydration seal; no raw corpus/results'}}
$references=@($quality.existingWorkspaceProofReferencesOnly)
$references+=@{path="$d/eval-pilot/offline-hydration-audit/result.json";sha256='bb009a95474c7d555f4025e4c601649f1411147e42551402296bd2388e44725f';availability='EXTERNAL_LOCAL_RAW_FILE_NOT_CANDIDATE';reason='Original80/12 unchanged QA oracle-stage error, not production defect or fix. Preserve raw locally without importing excluded corpus/question/passages.'}
foreach($ref in $references){if((Get-FileHash -LiteralPath $ref.path).Hash.ToLowerInvariant() -ne $ref.sha256){throw 'External-local historical reference drift'}}
$rule=@(Get-Content "$d/create-local-milestone.ps1"|Where-Object{$_ -match '^\s*\$patterns=@\('});Invoke-Expression $rule[0]
$findings=@();$total=[long]0
foreach($e in $entries.Values){$bytes=[IO.File]::ReadAllBytes((Join-Path $root $e.path));$total+=$bytes.Length;if($bytes -contains 0){$findings+=@{path=$e.path;type='binary-NUL';count=1}}else{$text=[Text.Encoding]::UTF8.GetString($bytes);foreach($p in $patterns){$n=[regex]::Matches($text,$p.r).Count;if($n){$findings+=@{path=$e.path;type=$p.type;count=$n}}}}}
$result=[ordered]@{schema='next-after-u22-wip-preparation/1';state='PREPARED_ONLY_WAIT_ROOT_NODE2_ACTUAL_TERMINAL_RELEASE_NO_STAGE';head=$base;entries=@($entries.Values|Sort-Object path);count=$entries.Count;bytes=$total;unchangedNotCandidates=$unchanged;externalLocalProofReferencesNotCommitFiles=$references;nativeNode2='LIVE HEAD hold; no results assumed, no polling and no staging';qualityProof='Actual92/92 hydrated,238quotes,0tripwires source-conditioned only; NOT primary answer PASS. Three invalid timestamp rows DATAQUALITYOPEN, no data edit. Original80/12 was QA oracle-stage error.';u22='Independent cycle0 scopedPASS and makercheckedPASS at d0; real human reviews0/fullU22 gatesOPEN';scope='Only2 native diagnostic source files plus exact ownedQA. No DATA/gold119, production evaluator2, human review data, credentials/config/enforcement/vendor/privateUUIDstorage/projections. Scope0 labels and pending authorization unchanged.';scan=@{files=$entries.Count;bytes=$total;findings=$findings;valuesPersisted=$false};indexEmpty=(@(git diff --cached --name-only).Count -eq 0);actions=@{stage=0;commit=0;push=0;sourceEdits=0;tests=0}}
$result|ConvertTo-Json -Depth 20|Set-Content "$out/next-after-u22-prepared.json" -Encoding utf8
[pscustomobject]@{paths=$entries.Count;bytes=$total;scanFindingRecords=$findings.Count;head=$base;indexEmpty=$result.indexEmpty;state=$result.state;artifact="$out/next-after-u22-prepared.json"}|ConvertTo-Json

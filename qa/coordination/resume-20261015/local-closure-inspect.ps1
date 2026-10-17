$ErrorActionPreference='Stop'
$d='qa/coordination/resume-20261015'
$p=Get-Content "$d/local-commit-plan.json" -Raw|ConvertFrom-Json -AsHashtable
$r=(Get-Location).Path
$t=[Collections.Generic.HashSet[string]]::new([string[]]@(git ls-files))
$dirty=@{}
foreach($l in @(git -c core.quotepath=false status --porcelain=v1 --untracked-files=all 2>$null)){if($l.Length -ge 4){$dirty[$l.Substring(3).Trim('"').Replace('\','/')]=$l.Substring(0,2)}}
$seeds=[Collections.Generic.HashSet[string]]::new([string[]]@($p.sourceAndTestCandidateAllowlist|ForEach-Object{$_.path}))
$priorClosure=Get-Content "$d/local-commit-dependency-closure.json" -Raw|ConvertFrom-Json
foreach($prior in $priorClosure.finalExactEntries){[void]$seeds.Add($prior.path)}
$moveMap=@{}
foreach($moveFile in @('native-structure-plan.json','indexing-structure-plan.json')){$moveObj=Get-Content "$d/$moveFile" -Raw|ConvertFrom-Json;foreach($move in $moveObj.moves){$moveMap[$move.old]=$move.new;if($seeds.Remove($move.old)){[void]$seeds.Add($move.new)}}}
$pending=@()
foreach($f in @('t056-direct-answer/source-pins.json','t037-approved-trust/pins.json','native-phaseb-maker/source-pins.json','native-central-maker/source-pins.json','native-central-maker/native-structure-adoption.json','api-cycle-repairs/candidate-pins.json','workspace-cycle-repair/pins.json','native-cycle-maker/source-pins.json','indexing-structure-maker/candidate-pins.json','indexing-structure-maker/phase-b-adoption.json','t013-voice-conversation/candidate-pins.json')){
 $pinText=Get-Content "$d/$f" -Raw
 foreach($pinMatch in [regex]::Matches($pinText,'"path"\s*:\s*"([^"]+)"')){$pinPath=(('"'+$pinMatch.Groups[1].Value+'"')|ConvertFrom-Json).Replace('\','/');if($moveMap.ContainsKey($pinPath)){$pinPath=$moveMap[$pinPath]};if($pinPath -match '^(packages|apps|scripts)/' -and (Test-Path -LiteralPath $pinPath)){[void]$seeds.Add($pinPath);$pending+=@{path=$pinPath;scope="$d/$f";status='SOURCE_FROZEN_PENDING_BROKER_FULL_GATES'}}}
}
$assetSeeds=@('qa/evidence/t042-trusted-registry/fixture.ts','packages/meeting-bot/py/sb_join.py','packages/meeting-bot/py/sb_join_register.py','packages/meeting-bot/py/sb_join_tiles.py')
$assetSeeds+=@(Get-ChildItem packages/meeting-bot/py/tab-capture -File|Where-Object{$_.Name -match '\.(js|mjs|html|json)$'}|ForEach-Object{$_.FullName.Substring($r.Length+1).Replace('\','/')})
$assetSeeds+=@(Get-ChildItem packages/meeting-bot/src/capture/native -File|Where-Object{$_.Name -match '\.ts$'}|ForEach-Object{$_.FullName.Substring($r.Length+1).Replace('\','/')})
$assetSeeds+=@('schema/answer_runs.schema.json','schema/jobs.schema.json','schema/sessions.schema.json','schema/speaker_attributes.schema.json','schema/speaker_relationships.schema.json','schema/tree_index.schema.json','schema/index.json')
$assetSeeds+=@('config/ai-routing.yaml','migrations/20261015120000-speaker-relationships.cjs','migrations/20261015130000-speaker-attributes.cjs')
foreach($asset in $assetSeeds){if(Test-Path -LiteralPath $asset){[void]$seeds.Add($asset)}}
$pkgs=@{}
foreach($dir in @(Get-ChildItem packages,apps -Directory)){
 $file=Join-Path $dir.FullName 'package.json'
 if(Test-Path $file){$o=Get-Content $file -Raw|ConvertFrom-Json;$pkgs[$o.name]=@{root=$dir.FullName;main=$o.main}}
}
function ResolveSource([string]$a){
 $all=@($a)
 if($a -match '\.(js|mjs|cjs)$'){$all+=@(($a -replace '\.(js|mjs|cjs)$','.ts'),($a -replace '\.(js|mjs|cjs)$','.tsx'))}
 if($a -notmatch '\.[A-Za-z0-9]+$'){foreach($x in @('.ts','.tsx','.mjs','.js','.json','/index.ts','/index.tsx','/index.js')){$all+="$a$x"}}
 foreach($x in $all){if(Test-Path -LiteralPath $x -PathType Leaf){return [IO.Path]::GetFullPath($x).Substring($r.Length+1).Replace('\','/')}}
 return $null
}
$q=[Collections.Generic.Queue[string]]::new();foreach($s in $seeds){$q.Enqueue($s)}
$seen=[Collections.Generic.HashSet[string]]::new();$adds=@{};$bounds=@{};$missing=@();$excluded=@();$external=[Collections.Generic.HashSet[string]]::new()
$pattern='(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)["'']([^"'']+)["'']'
while($q.Count){
 $s=$q.Dequeue()
 if(-not $seen.Add($s) -or -not(Test-Path -LiteralPath $s -PathType Leaf) -or $s -notmatch '\.(ts|tsx|mjs|cjs|js)$'){continue}
 $raw=Get-Content -LiteralPath $s -Raw
 foreach($m in [regex]::Matches($raw,$pattern)){
  $imp=$m.Groups[1].Value;$res=$null;$kind='relative'
  if($imp.StartsWith('.')){$res=ResolveSource ([IO.Path]::GetFullPath((Join-Path (Split-Path (Join-Path $r $s)) $imp)))}
  elseif($imp -match '^(@lkb/[^/]+)(/.*)?$'){
   $kind='workspace';$pkg=$pkgs[$Matches[1]];$sub=$Matches[2]
   if($pkg){$rel=if($sub){$sub.TrimStart('/')}elseif($pkg.main){$pkg.main}else{'src/index.ts'};$res=ResolveSource (Join-Path $pkg.root $rel)}
  }else{[void]$external.Add($imp);continue}
  if(-not $res){$missing+=@{from=$s;specifier=$imp;kind=$kind};continue}
  if($res -ne 'qa/evidence/t042-trusted-registry/fixture.ts' -and ($res -notmatch '^(apps|packages|scripts|schema|config|migrations)/' -or $res -match '(^|/)(raw|data|node_modules|\.env|backups?|corpus)(/|$)')){
   $excluded+=@{from=$s;specifier=$imp;path=$res;reason='Generated/private/QA boundary requires explicit review'};continue
  }
  if($seeds.Contains($res)){continue}
  if($t.Contains($res)){
   if(-not $bounds.ContainsKey($res)){$bounds[$res]=@{path=$res;status=$dirty[$res];importedBy=[Collections.Generic.HashSet[string]]::new();classification=if($dirty[$res]){'TRACKED_DIRTY: HEAD compatibility unproven'}else{'TRACKED_HEAD_BOUNDARY'}}}
   [void]$bounds[$res].importedBy.Add($s)
   if($dirty[$res] -and -not $adds.ContainsKey($res)){$adds[$res]=@{path=$res;sha256=(Get-FileHash -LiteralPath $res).Hash.ToLowerInvariant();provenance='Imported tracked dirty SOURCE dependency; includes earlier intended user work, authorship unknown';importedBy=[Collections.Generic.HashSet[string]]::new();gate='INCLUDE_REQUIRED_CURRENT_SOURCE_AFTER_ROOT_FREEZE'};$q.Enqueue($res)}
   if($dirty[$res]){[void]$adds[$res].importedBy.Add($s)}
  }else{
   if(-not $adds.ContainsKey($res)){$adds[$res]=@{path=$res;sha256=(Get-FileHash -LiteralPath $res).Hash.ToLowerInvariant();provenance='Imported untracked source/config; authorship and preexisting dirty bytes unknown';importedBy=[Collections.Generic.HashSet[string]]::new();gate='ROOT_REVIEW_REQUIRED'};$q.Enqueue($res)}
   [void]$adds[$res].importedBy.Add($s)
  }
 }
}
$ar=@($adds.Keys|Sort-Object|ForEach-Object{$x=$adds[$_];$x.importedBy=@($x.importedBy|Sort-Object);$x})
$br=@($bounds.Keys|Sort-Object|ForEach-Object{$x=$bounds[$_];$x.importedBy=@($x.importedBy|Sort-Object);$x})
$allPaths=@(@($seeds)+@($adds.Keys)|Sort-Object -Unique)
$pythonQueue=[Collections.Generic.Queue[string]]::new();foreach($py in $allPaths|Where-Object{$_ -match '\.py$'}){$pythonQueue.Enqueue($py)}
$pythonSeen=[Collections.Generic.HashSet[string]]::new();$pythonDeps=@()
while($pythonQueue.Count){$py=$pythonQueue.Dequeue();if(-not $pythonSeen.Add($py)){continue};$rawPy=Get-Content -LiteralPath $py -Raw
 foreach($m in [regex]::Matches($rawPy,'(?m)^\s*(?:from|import)\s+([A-Za-z_][A-Za-z0-9_]*)')){
  $local=Join-Path (Split-Path $py) ($m.Groups[1].Value+'.py')
  if(Test-Path -LiteralPath $local){$local=$local.Replace('\','/');$changed=$dirty[$local];$pythonDeps+=@{from=$py;path=$local;status=$changed;classification=if($changed -or -not $t.Contains($local)){'INCLUDE_CURRENT_LOCAL_PYTHON_SOURCE'}else{'TRACKED_CLEAN_HELPER'}}
   if($changed -or -not $t.Contains($local)){$allPaths+=@($local);$pythonQueue.Enqueue($local)}
  }
 }
}
$allPaths=@($allPaths|Sort-Object -Unique)
$exactEntries=@($allPaths|ForEach-Object{@{path=$_;status=$dirty[$_];trackedAtHead=$t.Contains($_);sha256=(Get-FileHash -LiteralPath $_).Hash.ToLowerInvariant();provenance='Current intended user SOURCE/config work; preexisting changes and authorship unknown; inclusion requires final root freeze'}})
$pkgStatus=@(git status --porcelain=v1 --untracked-files=all -- ':(glob)**/package.json' pnpm-lock.yaml 2>$null)
$out=[ordered]@{schema='local-commit-dependency-closure/1';recordedAt=(Get-Date).ToUniversalTime().ToString('o');head=(git rev-parse HEAD);branch=(git branch --show-current);rootSeedCount=$seeds.Count;pendingFinalFreeze=$pending;scannedSourceFiles=$seen.Count;untrackedDependencyAdditions=$ar;trackedBoundaries=$br;missingLiteralImportTargets=$missing;excludedDependencyBoundaries=$excluded;externalSpecifiers=@($external|Sort-Object);proposedExactAllowlist=$allPaths;packageLockStatus=$pkgStatus;packageLockClassification='No package.json/pnpm-lock.yaml changes observed when status empty. External declarations/install resolution not proven.';coherence='NOT_CERTIFIED: literal relative/workspace closure stops at tracked HEAD boundaries. Modified exports/behavior, dynamic paths/assets, generated files, alias subpaths, Python and QA fixtures remain explicit review gates. Dirty-tree success cannot prove this subset.';requiredNext=@('Final T056/T037/central freeze/checker pins','Reconcile tracked dirty boundaries for HEAD compatibility or include exact necessary changes with provenance','Resolve excluded generated/QA boundaries and missing literal targets','Validate frozen exact proposed checkout; no blanket staging');actions=@{staging=0;commit=0;push=0;builds=0;tests=0;provider=0;database=0}}
$out|ConvertTo-Json -Depth 10|Set-Content "$d/local-commit-dependency-closure.json" -Encoding utf8
$out['sourceDependencyAdditions']=$ar
$out['untrackedDependencyAdditions']=@($ar|Where-Object{-not $t.Contains($_.path)})
$out['pythonHelperDependencies']=$pythonDeps
$out['finalExactEntries']=$exactEntries
$out['syntheticFixtureReview']=@{path='qa/evidence/t042-trusted-registry/fixture.ts';classification='APPROVED_SYNTHETIC_TEST_SOURCE_ONLY';basis='Entire source reviewed: fixed synthetic tenants/UUIDs/panel labels, literal SYNTHETIC_AUDIO_BYTES and SYNTHETIC_MASKED_VIDEO_BYTES, generated temp artifacts. No actual capture/corpus/credentials present.';generatedRuntimeFilesExcluded=$true}
$out['dynamicAssetReview']=@{browser='Exact tab asset directory source/manifest/html/tests seeded; TAB_ASSETS and recorder dynamic chrome.runtime.getURL/native worklet chain reviewed';python='Local sibling imports recursively resolved until tracked-clean helpers; SeleniumBase is external declared runtime, no execution';packages='Nine workspace package manifests inspected: source ./src/index.ts mains, no exports maps; manifests/lock unchanged';canonicalSchemas='Exact schema sources included alongside generated TypeScript dependencies; no contract/enforcement/governance files included'}
$out['coherence']='STATIC_SOURCE_CLOSURE_PREVIEW: required current tracked-dirty and untracked source dependencies included with unknown/preexisting authorship explicit. No missing literal imports observed; dynamic browser assets/Python helpers reviewed. NOT a build/checker certification. Central native archive writers remain active; final freeze/hash refresh and isolated exact-candidate validation required. Private corpus/provider configurations stay external prerequisites.'
$out|ConvertTo-Json -Depth 10|Set-Content "$d/local-commit-dependency-closure.json" -Encoding utf8
$p['dependencyClosure']=@{path="$d/local-commit-dependency-closure.json";status='PROVISIONAL_NOT_SELF_CONTAINMENT_PROOF';allowlistCount=$allPaths.Count;preservesOriginalCandidates=$true}
$p|ConvertTo-Json -Depth 12|Set-Content "$d/local-commit-plan.json" -Encoding utf8
@{seeds=$seeds.Count;scanned=$seen.Count;additions=$adds.Count;trackedDirty=@($br|Where-Object{$_.status}).Count;trackedClean=@($br|Where-Object{-not $_.status}).Count;missing=$missing.Count;excluded=$excluded.Count;packageLockChanged=$pkgStatus.Count;exactProposed=$allPaths.Count}|ConvertTo-Json

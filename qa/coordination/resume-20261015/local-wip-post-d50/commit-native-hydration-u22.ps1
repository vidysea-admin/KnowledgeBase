$ErrorActionPreference='Stop'
$d='qa/coordination/resume-20261015';$out="$d/local-wip-post-d50";$root=(Get-Location).Path;$base='d0f6f2eff242f98a85ba4ccde483db08030ba3c8';$nativeDir="$d/native-next-maker/native-guard-phases";$qualityList="$d/eval-pilot/offline-hydration-audit/admitted-snapshot-repair2/wip-allowlist.json"
$r=[ordered]@{schema='native-hydration-u22-local-wip-commit/1';status='PREPARING';base=$base;actions=@{stage=0;commit=0;push=0;config=0;tests=0};failures=@()}
function Save {$r|ConvertTo-Json -Depth 16|Set-Content "$out/native-hydration-u22-commit-receipt.json" -Encoding utf8}
function Rel([string]$p){$p=$p.Replace('\','/');if($p.StartsWith($root.Replace('\','/')+'/')){$p=$p.Substring($root.Length+1)};return $p}
try{
 if((git rev-parse HEAD).Trim() -ne $base -or @(git diff --cached --name-only).Count){throw 'Final WIP initial HEAD/index gate failed'}
 $prepared=Get-Content "$out/next-after-u22-prepared.json" -Raw|ConvertFrom-Json -AsHashtable
 $nativeList="$nativeDir/terminal-evidence-paths.json";$nativeHash='8141abce8e1c227403ab54a038836cb81bbd9e52b9d6317c9ad3ab064b851c3c'
 if((Get-FileHash $nativeList).Hash.ToLowerInvariant() -ne $nativeHash){throw 'Native owner frozen list identity mismatch'}
 if((Get-FileHash $qualityList).Hash.ToLowerInvariant() -ne '30cb459ab0d909b7b0143d4d5857fb593466c6a0b7c92af0f997bc8ce874c661'){throw 'Quality owner frozen12 list mismatch'}
 $native=Get-Content $nativeList -Raw|ConvertFrom-Json;$quality=Get-Content $qualityList -Raw|ConvertFrom-Json
 $map=@{};$updates=@();foreach($e in $prepared.entries){$map[$e.path]=$e}
 function AddOwned([string]$p,[string]$h,[string]$owner,[string]$why){
  $p=Rel $p
  if($p -notmatch '^qa/' -or $p -match '^qa/contracts/|/private-run-|/vendor/|\.env|\.projection\.json$'){throw 'Additional QA path violates exact scope'}
  $actual=(Get-FileHash -LiteralPath $p).Hash.ToLowerInvariant();if($h -and $actual -ne $h){throw "Owner frozen evidence drift: $p"}
  if($map.ContainsKey($p) -and $map[$p].sha256 -ne $actual){
   if($p -ne $qualityList){throw 'Unexpected prepared83 metadata drift'}
   $updates+=@{path=$p;before=$map[$p].sha256;after=$actual;reason='Root-authorized owner append from9 to12 proof files; original prepared83 hash preserved in baseline manifest'}
  }
  $map[$p]=@{path=$p;sha256=$actual;bytes=(Get-Item -LiteralPath $p).Length;owner=$owner;origin=$why;status=if($p.EndsWith('.log')){'!!'}else{'current-exact-QA'};baseline=$base}
 }
 foreach($p in $native.additional_qa_allowlist){AddOwned $p.path $p.sha256 'native owner exact46 terminal additions' $nativeList}
 AddOwned $nativeList $nativeHash 'native frozen terminal allowlist' 'Root authorized owner-self metadata, no recursive self hash'
 AddOwned "$nativeDir/terminal-report.md" 'a889e860f6554a8cad3788f76b9c0a2447ef67e7a9bfe11f1c20b7eecdb53d1f' 'native terminal report' 'Owner final report; individual guard proofs not broader checkerPASS'
 foreach($p in $quality.files){AddOwned $p.path $p.sha256 'quality exact12 source-conditioned proof' $qualityList}
 AddOwned $qualityList '30cb459ab0d909b7b0143d4d5857fb593466c6a0b7c92af0f997bc8ce874c661' 'quality frozen12 metadata' 'Root-authorized sanitized actual results/CAS append; no raw questions/passages/keys'
 $nativeSource=@{'packages/meeting-bot/src/capture/native/native-archive-recovery.test.ts'='aa1de5248f25f941890cb64ff9e89ab61dc4d58f2f3fb3044029aa8ad1869925';'packages/meeting-bot/src/capture/native/testsupport/native-guard-phase.ts'='099b181cf1178182dfb4c81563d662b37dbeded36c8e40aa3fd879592c3b8fad'}
 $u22=@{'scripts/eval/extraction-review-resume.mjs'='b16fb26f3f7f32b84ac030131a5366a8bbe7081c91aecff2db9b155604b41206';'scripts/eval/extraction-review-resume.test.mjs'='36f6d3478811d3f7954d6fcb84eb35f8724e4d821baf0b739dc415650642bddb'}
 foreach($p in $nativeSource.Keys){if($map[$p].sha256 -ne $nativeSource[$p]){throw 'Frozen native2 expected identity mismatch'}}
 $seals=@{node1=@{path="$d/broker/native-original-node1-final-seal.json";prefix='f421d7';trace=64};node2=@{path="$d/broker/native-original-node2-final-seal.json";hash='bea21fdc20250635f235b60faef2c63ac8817f4c15a858f8446ed104a062f4bf';trace=12}}
 foreach($key in $seals.Keys){$item=$seals[$key];$hash=(Get-FileHash $item.path).Hash.ToLowerInvariant();if(($item.hash -and $hash -ne $item.hash) -or ($item.prefix -and -not $hash.StartsWith($item.prefix))){throw 'Actual native terminal seal mismatch'};$s=Get-Content $item.path -Raw|ConvertFrom-Json;if($s.failure -or $s.headAfter -ne $base -or -not $s.allPinsFinalMatch -or -not $s.ownedFixtureRemoved -or $s.trace.records -ne $item.trace){throw 'Actual native terminal release/stability mismatch'};foreach($a in $s.atomicReceipts){if((Get-FileHash $a.path).Hash.ToLowerInvariant() -ne $a.sha256 -or (Get-FileHash $a.log.path).Hash.ToLowerInvariant() -ne $a.log.sha256){throw 'Native terminal atomic raw proof mismatch'}}}
 $watch=Get-Content "$out/qa-closeout-prepared.json" -Raw|ConvertFrom-Json;$unchangedPins=@{};foreach($p in $watch.source8Pins){$unchangedPins[$p.path]=$p.sha256};foreach($p in $u22.Keys){$unchangedPins[$p]=$u22[$p]};$unchangedGit=@{}
 foreach($p in $unchangedPins.Keys){if((Get-FileHash $p).Hash.ToLowerInvariant() -ne $unchangedPins[$p]){throw 'Watched8 orU22source2 raw drift'};$unchangedGit[$p]=(git rev-parse ($base+':'+$p)).Trim()}
 $before=@(git -c core.quotepath=false status --porcelain=v1 --untracked-files=all 2>$null);$status=@{};foreach($l in $before){$status[$l.Substring(3).Trim('"').Replace('\','/')]=$l.Substring(0,2)}
 $entries=@();$omitted=@();foreach($p in @($map.Keys|Sort-Object)){
  $e=$map[$p];if($p -notmatch '^qa/' -and -not $nativeSource.ContainsKey($p)){throw 'Final candidate contains unauthorized product source'}
  if((Get-FileHash -LiteralPath $p).Hash.ToLowerInvariant() -ne $e.sha256){throw "Prepared source/evidence unexpected drift: $p"}
  $tracked=@(git ls-tree $base -- $p);$ignored=$p.EndsWith('.log') -and -not $tracked.Count
  if($tracked.Count -and -not $status.ContainsKey($p)){$omitted+=$p;continue}
  if(-not $tracked.Count -and -not $status.ContainsKey($p) -and -not $ignored){throw "Unexpected ignored nonlog candidate: $p"}
  $e.status=if($ignored){'!!'}else{$status[$p]};$e['mutation']=if($tracked.Count){'modify'}else{'add'};$entries+=,$e
 }
 $rules=@(Get-Content "$d/create-local-milestone.ps1"|Where-Object{$_ -match '^\s*\$patterns=@\('});Invoke-Expression $rules[0]
 $findings=@();$bytes=[long]0;foreach($e in $entries){$raw=[IO.File]::ReadAllBytes((Join-Path $root $e.path));$bytes+=$raw.Length;if($raw -contains 0){$findings+=@{path=$e.path;type='binary-NUL';count=1}}else{$text=[Text.Encoding]::UTF8.GetString($raw);foreach($rule in $patterns){$n=[regex]::Matches($text,$rule.r).Count;if($n){$findings+=@{path=$e.path;type=$rule.type;count=$n}}}}}
 $r['scan']=@{files=$entries.Count;bytes=$bytes;findings=$findings;valuesPersisted=$false};Save;if($findings.Count){throw 'Final exact raw candidate secret scan findings'}
 $final=[ordered]@{schema='native-hydration-u22-frozen-final/1';base=$base;entries=$entries;counts=@{paths=$entries.Count;bytes=$bytes};prepared83="$out/next-after-u22-prepared.json";ownerNative=@{path=$nativeList;sha256=$nativeHash};ownerQuality=@{path=$qualityList;sha256='30cb459ab0d909b7b0143d4d5857fb593466c6a0b7c92af0f997bc8ce874c661'};authorizedMetadataUpdates=$updates;unchangedOmitted=$omitted;source2Native=$nativeSource;unchangedWatch8U22source2=$unchangedPins;scope='Native diagnostic-only test/helper changes; hydrated source-conditioned proof not primary-answerPASS; U22 resume scoped independentPASS, realhuman0/fullparentgatesOPEN';historical80of12=@{path="$d/eval-pilot/offline-hydration-audit/result.json";sha256='bb009a95474c7d555f4025e4c601649f1411147e42551402296bd2388e44725f';availability='EXTERNAL_LOCAL_RAW_UNMODIFIED; priorQAoracleerror, not production defect'};actions=@{stage=0;commit=0;push=0;tests=0}}
 $final|ConvertTo-Json -Depth 20|Set-Content "$out/native-hydration-u22-final-allowlist.json" -Encoding utf8;$r['manifest']=@{path="$out/native-hydration-u22-final-allowlist.json";sha256=(Get-FileHash "$out/native-hydration-u22-final-allowlist.json").Hash.ToLowerInvariant();paths=$entries.Count;bytes=$bytes}
 function RawGate {foreach($e in $entries){if((Get-FileHash $e.path).Hash.ToLowerInvariant() -ne $e.sha256){throw 'Final frozen candidate drift'}};foreach($p in $unchangedPins.Keys){if((Get-FileHash $p).Hash.ToLowerInvariant() -ne $unchangedPins[$p]){throw 'Watched/U22 raw drift'}}}
 RawGate;if((git rev-parse HEAD).Trim() -ne $base -or @(git diff --cached --name-only).Count){throw 'Final stage HEAD/index gate changed'}
 $normal=@($entries|Where-Object{$_.status -ne '!!'}|ForEach-Object{$_.path});$force=@($entries|Where-Object{$_.status -eq '!!'}|ForEach-Object{$_.path});$expected=@($entries.path|Sort-Object)
 function PathFile([string]$file,$paths){[IO.File]::WriteAllBytes((Join-Path $root $file),[Text.UTF8Encoding]::new($false).GetBytes((@($paths)-join [char]0)+[char]0))}
 PathFile "$out/native-hydration-normal.nul" $normal;PathFile "$out/native-hydration-force.nul" $force
 & git --literal-pathspecs add "--pathspec-from-file=$out/native-hydration-normal.nul" --pathspec-file-nul 2> "$out/native-hydration-stage.stderr.txt";if($LASTEXITCODE -ne 0){throw 'Exact final normal staging failed'};$r.actions.stage=1;Save
 if($force.Count){& git --literal-pathspecs add -f "--pathspec-from-file=$out/native-hydration-force.nul" --pathspec-file-nul 2> "$out/native-hydration-force.stderr.txt";if($LASTEXITCODE -ne 0){throw 'Exact final scoped raw-log staging failed'}}
 $names=@(git -c core.quotepath=false diff --cached --name-only --no-renames|Sort-Object);if(@(Compare-Object $expected $names).Count){throw 'Final staged exact path set mismatch'}
 $staged=@{};foreach($l in @(git -c core.quotepath=false ls-files --stage)){if($l -match '^\d+ ([a-f0-9]+) 0\s+(.+)$'){$staged[$Matches[2]]=$Matches[1]}};$blobMap=@{};$stagedFindings=@()
 foreach($e in $entries){$blob=(& git hash-object ('--path='+$e.path) -- $e.path 2>$null).Trim();if($LASTEXITCODE -ne 0 -or $blob -ne $staged[$e.path]){throw 'Final staged filtered blob mismatch'};$blobMap[$e.path]=$blob;$text=(& git cat-file blob $blob)-join "`n";if($LASTEXITCODE -ne 0){throw 'Final staged blob read failed'};foreach($rule in $patterns){$n=[regex]::Matches($text,$rule.r).Count;if($n){$stagedFindings+=@{path=$e.path;type=$rule.type;count=$n}}}}
 $r['stagedScan']=@{files=$entries.Count;findings=$stagedFindings;valuesPersisted=$false};Save;if($stagedFindings.Count){throw 'Final staged content scanner findings'}
 & git diff --cached --check > "$out/native-hydration-whitespace.stdout.txt" 2> "$out/native-hydration-whitespace.stderr.txt";$r['whitespaceExit']=$LASTEXITCODE;$r['whitespaceDisposition']='Exact raw proof/EOF preserved; recorded advisory only; no source normalization or configuration/hook bypass'
 $guard=& .codex/hooks/mc-precommit.ps1 -InputJson '{"command":"git commit"}';if($LASTEXITCODE -ne 0 -or ($guard-join '') -match '"permissionDecision"\s*:\s*"deny"'){throw 'Repository commit guard rejected'}
 RawGate;if((git rev-parse HEAD).Trim() -ne $base -or @(Compare-Object $expected @(git -c core.quotepath=false diff --cached --name-only --no-renames|Sort-Object)).Count){throw 'Final precommit identity changed'}
 $id=@(git show -s --format='%an%x09%ae%x09%cn%x09%ce' $base);$parts=$id[0]-split [char]9;if($LASTEXITCODE -ne 0 -or $parts[0] -ne 'Umesh Sugara' -or $parts[0] -ne $parts[2] -or $parts[1] -ne $parts[3] -or -not $parts[1]){throw 'Historical identity mismatch'}
 $message=@'
Record native guard and hydration verification with extraction review

LOCAL WIP. Native source changes are diagnostic test instrumentation/helper only; product logic unchanged. Exact original node1 and node2 each pass1/1 with zero skips: node1 Job107.625s/phase118.078s/64trace records; node2 FIRST attempt Job65.797s/phase75.578s/12trace records. Both owned fixtures cleaned and source/HEAD proofs retained. Five helper checks and affected typing evidence retained. These engineering receipts are not a broader native checkerPASS.

Hydration QA proof:92/92 source-conditioned hydrated results,238 verified quote proofs,zero tripwires. Original80/12 was QA oracle-stage error, not a repaired production defect. Raw3427/admitted3424 with3 DATAQUALITYOPEN timestamp rows; corpus unmodified. Actual sanitized compact results/CAS retained without raw passages/questions/keys. No primary-answerPASS or independent hydrationPASS.

U22 resume wrapper independent cycle0 PASS and makercheckedPASS close only the scoped local behavior at d0f6f2eff242f98a85ba4ccde483db08030ba3c8. Its two source files and eight watched source files are unchanged. Real human reviews/gold remain0. Thirty-nine parents remain in_progress; four native prerequisite skips, unexplained intermittent recovery, host/Mongo/native/downstream/primary-paid human approvals and unverified usage/10%metrics remain open.

All meaningful prior failure/HOLD evidence preserved verbatim; known raw proof whitespace remains advisory. No DATA/gold119 files, production evaluator changes, secret/config/enforcement changes, activation, deployment or push.
'@
 $message|Set-Content "$out/native-hydration-commit-message.txt" -Encoding utf8;$r.status='FINAL_STAGED_VERIFIED_NORMAL_COMMIT_ATTEMPT';Save
 & git -c ('user.name='+$parts[0]) -c ('user.email='+$parts[1]) commit -F "$out/native-hydration-commit-message.txt" > "$out/native-hydration-commit.stdout.txt" 2> "$out/native-hydration-commit.stderr.txt"
 $exit=$LASTEXITCODE;$r['commitExit']=$exit;Save;if($exit -ne 0){throw 'Normal final commit rejected; no retry/bypass; index preserved'}
 $r.actions.commit=1;$commit=(git rev-parse HEAD).Trim();$r['commit']=$commit;if((git rev-parse HEAD^).Trim() -ne $base){throw 'Final parent mismatch'}
 $changed=@(git -c core.quotepath=false diff-tree --no-commit-id --name-only --no-renames -r HEAD|Sort-Object);if(@(Compare-Object $expected $changed).Count){throw 'Final committed exact paths mismatch'}
 foreach($p in $nativeSource.Keys){if((git rev-parse ('HEAD:'+$p)).Trim() -ne $blobMap[$p]){throw 'Committed native2 bytes mismatch'}}
 foreach($p in $unchangedPins.Keys){if((git rev-parse ('HEAD:'+$p)).Trim() -ne $unchangedGit[$p]){throw 'Watched8/U22source2 committed bytes changed'}}
 RawGate;if(@(git diff --cached --name-only).Count){throw 'Final postcommit index not empty'}
 $after=@(git -c core.quotepath=false status --porcelain=v1 --untracked-files=all 2>$null);$post=@{};foreach($l in $after){$post[$l.Substring(3)]=$l.Substring(0,2)};$owned=@{};foreach($p in $expected){$owned[$p]=$true};$foreign=@();foreach($l in $before){$p=$l.Substring(3);if(-not $owned.ContainsKey($p) -and $post[$p] -ne $l.Substring(0,2)){$foreign+=$p}}
 $r['unrelatedDirtyStatusDrift']=$foreign;$r['remainingDirty']=@{total=$after.Count;tracked=@($after|Where-Object{-not $_.StartsWith('??')}).Count;untracked=@($after|Where-Object{$_.StartsWith('??')}).Count};$r['committedPaths']=$changed.Count;$r['nativeSource2Verified']=$true;$r['watch8U22source2Unchanged']=$true;$r['indexEmpty']=$true;$r['independentBroaderNativeHydrationPASS']=$false;$r.status='LOCAL_WIP_COMMITTED_NO_PUSH';Save
 if($foreign.Count){throw 'Unrelated dirty status drift observed; no recovery mutation attempted'}
 [pscustomobject]@{status=$r.status;commit=$commit;paths=$changed.Count;bytes=$bytes;source2Verified=$true;watch8U22source2Unchanged=$true;indexEmpty=$true;remainingDirty=$r.remainingDirty;pushes=0}|ConvertTo-Json -Depth 5
}catch{$r.status='FINAL_CHECKPOINT_STOPPED_INDEX_PRESERVED';$r.failures+=@{type=$_.Exception.GetType().Name;message=$_.Exception.Message};Save;throw}

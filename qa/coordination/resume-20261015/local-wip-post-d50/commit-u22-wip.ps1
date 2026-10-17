$ErrorActionPreference='Stop'
$d='qa/coordination/resume-20261015';$out="$d/local-wip-post-d50";$root=(Get-Location).Path;$base='37e51f95c367594bddb422c39c11415674ecf001';$unitDir="$d/u22-resume-prep"
$r=[ordered]@{schema='u22-local-wip-commit/1';status='PREPARING';base=$base;actions=@{stage=0;commit=0;push=0;config=0;tests=0};failures=@()}
function Save {$r|ConvertTo-Json -Depth 15|Set-Content "$out/u22-local-commit-receipt.json" -Encoding utf8}
try{
 if((git rev-parse HEAD).Trim() -ne $base -or (git rev-parse HEAD^).Trim() -ne 'ec143c9e57a1b2bb13ee66a0b127e720fdf2dca6' -or @(git diff --cached --name-only).Count){throw 'U22 initial HEAD/parent/index gate failed'}
 $allowed=Get-Content "$unitDir/wip-allowlist.json" -Raw|ConvertFrom-Json
 if($allowed.paths.Count -ne 34 -or @($allowed.paths|Sort-Object -Unique).Count -ne 34){throw 'Expected exact34 allowlist'}
 $sourcePins=@{'scripts/eval/extraction-review-resume.mjs'='b16fb26f3f7f32b84ac030131a5366a8bbe7081c91aecff2db9b155604b41206';'scripts/eval/extraction-review-resume.test.mjs'='36f6d3478811d3f7954d6fcb84eb35f8724e4d821baf0b739dc415650642bddb'}
 foreach($p in $sourcePins.Keys){if((Get-FileHash -LiteralPath $p).Hash.ToLowerInvariant() -ne $sourcePins[$p] -or @(git ls-tree $base -- $p).Count){throw 'U22 preexisting untracked source identity mismatch'}}
 $watch=Get-Content "$out/qa-closeout-prepared.json" -Raw|ConvertFrom-Json;$watchGit=@{}
 foreach($p in $watch.source8Pins){if((Get-FileHash -LiteralPath $p.path).Hash.ToLowerInvariant() -ne $p.sha256){throw 'Watched source8 drift'};$watchGit[$p.path]=(git rev-parse ($base+':'+$p.path)).Trim()}
 $sealPath="$d/broker/u22-current-final-seal.json";$sealHash='9f35bb7e6c6edc98f09d7d9a53d1b90a91aef3df8f8f092663771d9d8dcf0820'
 if((Get-FileHash $sealPath).Hash.ToLowerInvariant() -ne $sealHash){throw 'U22 actual broker seal hash mismatch'}
 $seal=Get-Content $sealPath -Raw|ConvertFrom-Json
 if($seal.contextGitBefore.head -ne $base -or $seal.contextGitAfter.head -ne $base -or -not $seal.allPinsFinalMatch -or $seal.failure -or $seal.rawInventorySha256 -ne 'c96d40e2e7294a341db29b67939647ea28b3866ebc79c642172f76aaca67f483'){throw 'U22 current seal candidate/stability mismatch'}
 foreach($atomic in $seal.atomicReceipts){if($atomic.exit -ne 0 -or (Get-FileHash $atomic.path).Hash.ToLowerInvariant() -ne $atomic.sha256 -or (Get-FileHash $atomic.log.path).Hash.ToLowerInvariant() -ne $atomic.log.sha256){throw 'U22 atomic receipt/log mismatch'}}
 if((Get-FileHash $seal.pins.path).Hash.ToLowerInvariant() -ne $seal.pins.sha256){throw 'U22 actual CAS mismatch'}
 $before=@(git -c core.quotepath=false status --porcelain=v1 --untracked-files=all 2>$null);$status=@{};foreach($l in $before){$status[$l.Substring(3).Trim('"').Replace('\','/')]=$l.Substring(0,2)}
 $rules=@(Get-Content "$d/create-local-milestone.ps1"|Where-Object{$_ -match '^\s*\$patterns=@\('});Invoke-Expression $rules[0]
 $entries=@();$omitted=@();$findings=@();$bytesTotal=0
 foreach($p in $allowed.paths){
  if($p -notin $sourcePins.Keys -and ($p -notmatch '^qa/' -or $p -match '^qa/contracts/|/private-run-|/vendor/|\.env')){throw 'U22 candidate outside exact source2+QA scope'}
  if(-not(Test-Path -LiteralPath $p -PathType Leaf)){throw 'U22 expected file missing'}
  $tracked=@(git ls-tree $base -- $p);$mutated=$status.ContainsKey($p);$ignored=$p.EndsWith('.log') -and -not $tracked.Count
  if(-not $mutated -and -not $ignored){$omitted+=$p;continue}
  if($sourcePins.ContainsKey($p) -and $status[$p] -ne '??'){throw 'U22 source preexisting untracked status changed'}
  $bytes=[IO.File]::ReadAllBytes((Join-Path $root $p));$bytesTotal+=$bytes.Length;$hash=(Get-FileHash -LiteralPath $p).Hash.ToLowerInvariant()
  if($bytes -contains 0){$findings+=@{path=$p;type='binary-NUL';count=1}}else{$text=[Text.Encoding]::UTF8.GetString($bytes);foreach($rule in $patterns){$n=[regex]::Matches($text,$rule.r).Count;if($n){$findings+=@{path=$p;type=$rule.type;count=$n}}}}
  $entries+=@{path=$p;sha256=$hash;bytes=$bytes.Length;status=if($ignored){'!!'}else{$status[$p]};mutation=if($tracked.Count){'modify'}else{'add'};owner=if($sourcePins.ContainsKey($p)){'Preexisting untracked maker output; root authorized WIPcheckpoint, not authored/edited by committer'}else{'Exact unit QA allowlist';};origin="$unitDir/wip-allowlist.json"}
 }
 $r['scan']=@{files=$entries.Count;bytes=$bytesTotal;findings=$findings;valuesPersisted=$false};$r['unchangedOmitted']=$omitted;Save;if($findings.Count){throw 'U22 exact candidate scanner findings'}
 $manifest=[ordered]@{schema='u22-root-frozen-wip-candidate/1';base=$base;exactRootAllowlist="$unitDir/wip-allowlist.json";rootAllowlistSha256=(Get-FileHash "$unitDir/wip-allowlist.json").Hash.ToLowerInvariant();entries=$entries;source2Pins=$sourcePins;rawCandidateIdentity=$seal.rawInventorySha256;brokerSeal=@{path=$sealPath;sha256=$sealHash;tests='3/3';contracts='exit0, vacuous'};unchangedOmitted=$omitted;independentReview='PENDING; no unit/parentPASS';humanReview='Real human gold/review gates OPEN';actions=@{stage=0;commit=0;push=0}}
 $manifest|ConvertTo-Json -Depth 15|Set-Content "$out/u22-commit-allowlist.json" -Encoding utf8
 $r['manifest']=@{path="$out/u22-commit-allowlist.json";sha256=(Get-FileHash "$out/u22-commit-allowlist.json").Hash.ToLowerInvariant();paths=$entries.Count;bytes=$bytesTotal}
 function RawGate {foreach($e in $entries){if((Get-FileHash -LiteralPath $e.path).Hash.ToLowerInvariant() -ne $e.sha256){throw 'U22 frozen raw drift'}};foreach($p in $watch.source8Pins){if((Get-FileHash -LiteralPath $p.path).Hash.ToLowerInvariant() -ne $p.sha256){throw 'Watched source8 raw drift'}}}
 RawGate;if((git rev-parse HEAD).Trim() -ne $base -or @(git diff --cached --name-only).Count){throw 'U22 HEAD/index changed before stage'}
 $expected=@($entries.path|Sort-Object);$normal=@($entries|Where-Object{$_.status -ne '!!'}|ForEach-Object{$_.path});$forced=@($entries|Where-Object{$_.status -eq '!!'}|ForEach-Object{$_.path})
 function PathFile([string]$p,$paths){[IO.File]::WriteAllBytes((Join-Path $root $p),[Text.UTF8Encoding]::new($false).GetBytes((@($paths)-join [char]0)+[char]0))}
 PathFile "$out/u22-normal.nul" $normal;PathFile "$out/u22-force.nul" $forced
 & git --literal-pathspecs add "--pathspec-from-file=$out/u22-normal.nul" --pathspec-file-nul 2> "$out/u22-stage.stderr.txt";if($LASTEXITCODE -ne 0){throw 'U22 exact normal staging failed'};$r.actions.stage=1;Save
 if($forced.Count){& git --literal-pathspecs add -f "--pathspec-from-file=$out/u22-force.nul" --pathspec-file-nul 2> "$out/u22-force.stderr.txt";if($LASTEXITCODE -ne 0){throw 'U22 exact raw-log staging failed'}}
 $names=@(git -c core.quotepath=false diff --cached --name-only --no-renames|Sort-Object);if(@(Compare-Object $expected $names).Count){throw 'U22 exact staged set mismatch'}
 $staged=@{};foreach($l in @(git -c core.quotepath=false ls-files --stage)){if($l -match '^\d+ ([a-f0-9]+) 0\s+(.+)$'){$staged[$Matches[2]]=$Matches[1]}}
 $blobMap=@{};$stagedFindings=@()
 foreach($e in $entries){$blob=(& git hash-object ('--path='+$e.path) -- $e.path 2>$null).Trim();if($LASTEXITCODE -ne 0 -or $staged[$e.path] -ne $blob){throw 'U22 staged filtered blob mismatch'};$blobMap[$e.path]=$blob;$text=(& git cat-file blob $blob)-join "`n";if($LASTEXITCODE -ne 0){throw 'U22 staged blob read failed'};foreach($rule in $patterns){$n=[regex]::Matches($text,$rule.r).Count;if($n){$stagedFindings+=@{path=$e.path;type=$rule.type;count=$n}}}}
 $r['stagedScan']=@{files=$entries.Count;findings=$stagedFindings;valuesPersisted=$false};Save;if($stagedFindings.Count){throw 'U22 staged content scanner findings'}
 & git diff --cached --check > "$out/u22-whitespace.stdout.txt" 2> "$out/u22-whitespace.stderr.txt";$r['whitespaceExit']=$LASTEXITCODE
 $r['whitespaceDisposition']='Exact raw unit proof preserved; raw log/EOF findings advisory only as authorized, no normalization/config/hook bypass.'
 $guard=& .codex/hooks/mc-precommit.ps1 -InputJson '{"command":"git commit"}';if($LASTEXITCODE -ne 0 -or ($guard-join '') -match '"permissionDecision"\s*:\s*"deny"'){throw 'Repository commit guard rejected'}
 RawGate;if((git rev-parse HEAD).Trim() -ne $base -or @(Compare-Object $expected @(git -c core.quotepath=false diff --cached --name-only --no-renames|Sort-Object)).Count){throw 'U22 precommit identity changed'}
 $id=@(git show -s --format='%an%x09%ae%x09%cn%x09%ce' $base);$parts=$id[0]-split [char]9;if($LASTEXITCODE -ne 0 -or $parts[0] -ne 'Umesh Sugara' -or $parts[0] -ne $parts[2] -or $parts[1] -ne $parts[3] -or -not $parts[1]){throw 'Historical identity mismatch'}
 $message=@'
Checkpoint extraction review resume and current verification

LOCAL WIP checkpoint of two preexisting untracked maker outputs plus exact unit QA. Raw candidate inventory c96d40e2e7294a341db29b67939647ea28b3866ebc79c642172f76aaca67f483 is a content identity, not a Git commit. Source2 bytes are unchanged by checkpoint writer.

Actual current source/helper/runtime-bound broker:3/3 resume checks pass; contracts verifier exit0 is vacuous. Raw commands, receipts/logs and21-pinCAS retained. No new tests executed by checkpoint writer and no historical evidence upgraded.

Independent review remains PENDING. This commit claims no unit or parentPASS. Real human extraction review/gold data, applicable integration/security/host/Mongo/native/provider/downstream and release gates remain open. Existing eight watched sources and their scopedPASS are unchanged.

Exact raw proof/EOF whitespace stays verbatim where present; no human review data, secrets, configuration/enforcement changes, activation, deployment or push.
'@
 $message|Set-Content "$out/u22-commit-message.txt" -Encoding utf8;$r.status='U22_STAGED_VERIFIED_NORMAL_COMMIT_ATTEMPT';Save
 & git -c ('user.name='+$parts[0]) -c ('user.email='+$parts[1]) commit -F "$out/u22-commit-message.txt" > "$out/u22-commit.stdout.txt" 2> "$out/u22-commit.stderr.txt"
 $exit=$LASTEXITCODE;$r['commitExit']=$exit;Save;if($exit -ne 0){throw 'Normal U22 commit rejected; no retry or bypass; index preserved'}
 $r.actions.commit=1;$commit=(git rev-parse HEAD).Trim();$r['commit']=$commit;if((git rev-parse HEAD^).Trim() -ne $base){throw 'U22 commit parent mismatch'}
 $changed=@(git -c core.quotepath=false diff-tree --no-commit-id --name-only --no-renames -r HEAD|Sort-Object);if(@(Compare-Object $expected $changed).Count){throw 'U22 committed set mismatch'}
 foreach($p in $sourcePins.Keys){if((git rev-parse ('HEAD:'+$p)).Trim() -ne $blobMap[$p] -or (Get-FileHash $p).Hash.ToLowerInvariant() -ne $sourcePins[$p]){throw 'U22 committed source2 identity mismatch'}}
 foreach($p in $watch.source8Pins){if((git rev-parse ('HEAD:'+$p.path)).Trim() -ne $watchGit[$p.path]){throw 'Watched source8 committed identity changed'}}
 RawGate;if(@(git diff --cached --name-only).Count){throw 'Post-U22 index not empty'}
 $after=@(git -c core.quotepath=false status --porcelain=v1 --untracked-files=all 2>$null);$post=@{};foreach($l in $after){$post[$l.Substring(3)]=$l.Substring(0,2)};$owned=@{};foreach($p in $expected){$owned[$p]=$true};$foreign=@();foreach($l in $before){$p=$l.Substring(3);if(-not $owned.ContainsKey($p) -and $post[$p] -ne $l.Substring(0,2)){$foreign+=$p}}
 $r['unrelatedDirtyStatusDrift']=$foreign;$r['remainingDirty']=@{total=$after.Count;tracked=@($after|Where-Object{-not $_.StartsWith('??')}).Count;untracked=@($after|Where-Object{$_.StartsWith('??')}).Count};$r['source2CommitBytesVerified']=$true;$r['watched8Unchanged']=$true;$r['indexEmpty']=$true;$r['committedPaths']=$changed.Count;$r.status='U22_LOCAL_WIP_COMMITTED_NO_PUSH';Save
 if($foreign.Count){throw 'Unrelated dirty status drift observed; no recovery mutation attempted'}
 [pscustomobject]@{status=$r.status;commit=$commit;paths=$changed.Count;unchangedOmitted=$omitted;source2Verified=$true;watch8Same=$true;indexEmpty=$true;remainingDirty=$r.remainingDirty;pushes=0}|ConvertTo-Json -Depth 5
}catch{$r.status='U22_CHECKPOINT_STOPPED_INDEX_PRESERVED';$r.failures+=@{type=$_.Exception.GetType().Name;message=$_.Exception.Message};Save;throw}

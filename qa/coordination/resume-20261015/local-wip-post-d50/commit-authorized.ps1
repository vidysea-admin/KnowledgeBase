$ErrorActionPreference='Stop'
$d='qa/coordination/resume-20261015';$out="$d/local-wip-post-d50";$root=(Get-Location).Path
$base='d50a25c200dcbcf574ecade0aa205f5fcb45c5f8'
$approved="$out/final-allowlist.json"
if((Get-FileHash $approved).Hash.ToLowerInvariant() -ne 'c14a2d6269d78dab2e6e95b2290935d86448a5b5e8c010c49b7118db6b98d3b1'){throw 'Root-reviewed571 manifest changed'}
$a=Get-Content $approved -Raw|ConvertFrom-Json -AsHashtable
$receipt=[ordered]@{schema='post-d50-local-wip-commit/1';status='PREPARING';base=$base;actions=@{staging=0;commit=0;push=0;config=0};failures=@();historicalHelperBinding='UNKNOWN; fresh current epoch binds current bytes only'}
function Save {$receipt|ConvertTo-Json -Depth 12|Set-Content "$out/local-commit-receipt.json" -Encoding utf8}
function Relative([string]$p){$p=$p.Replace('\','/');if($p.StartsWith($root.Replace('\','/')+'/')){$p=$p.Substring($root.Length+1)};return $p}
function WritePaths([string]$path,$paths){[IO.File]::WriteAllBytes((Join-Path $root $path),[Text.UTF8Encoding]::new($false).GetBytes((@($paths)-join [char]0)+[char]0))}
function AssertRoot {if((git rev-parse HEAD).Trim() -ne $base){throw 'HEAD changed'}}
function AssertRaw {
 foreach($e in $a.entries){if($e.mutation -eq 'delete'){if(Test-Path -LiteralPath $e.path){throw "Deletion reappeared: $($e.path)"}}elseif((Get-FileHash -LiteralPath $e.path).Hash.ToLowerInvariant() -ne $e.sha256){throw "Frozen bytes drift: $($e.path)"}}
}
try{
 AssertRoot
 if(@(git diff --cached --name-only).Count){throw 'Foreign/nonempty index preserved'}
 $beforeDirty=@(git -c core.quotepath=false status --porcelain=v1 --untracked-files=all 2>$null)
 $receipt['dirtyBefore']=@{total=$beforeDirty.Count;tracked=@($beforeDirty|Where-Object {-not $_.StartsWith('??')}).Count;untracked=@($beforeDirty|Where-Object {$_.StartsWith('??')}).Count}
 AssertRaw
 $newPaths=@{};$newPins=@{}
 function AddPinned([string]$path,[string]$sha,[string]$why){
  $path=Relative $path
  if($path -notmatch '^qa/coordination/resume-20261015/broker/(?:watched-current-helper[^/]*\.(?:json|log|py)|historical-broker-library-binding-unknown\.md|pin-manifests/[a-f0-9]{64}\.json)$'){throw "Fresh epoch path outside root grant: $path"}
  if(-not(Test-Path -LiteralPath $path -PathType Leaf)){throw 'Fresh epoch required file missing'}
  $actual=(Get-FileHash -LiteralPath $path).Hash.ToLowerInvariant();if($sha -and $sha -ne $actual){throw 'Fresh epoch pin mismatch'}
  $newPaths[$path]=@{path=$path;sha256=$actual;bytes=(Get-Item -LiteralPath $path).Length;status=if($path.EndsWith('.log')){'!!'}else{'??'};mutation='add';beforeD50Blob=$null;beforeD50Proof='New exact root-authorized fresh current-helper evidence; absent from d50 tree';owner='sole-broker current-helper epoch';packet="$d/broker/watched-current-helper-final-seal.json";provenance=$why}
 }
 $sealPath="$d/broker/watched-current-helper-final-seal.json";$seal=Get-Content $sealPath -Raw|ConvertFrom-Json
 if($seal.status -ne 'CURRENT_EPOCH_COMPLETE' -or $seal.atomicReceipts.Count -ne 5 -or -not $seal.allPinsFinalMatch -or -not $seal.unit73PinsFinalMatch){throw 'Fresh helper epoch not green/stable'}
 AddPinned $sealPath '' 'Exact current-helper terminal seal; historic identity remains unknown'
 AddPinned $seal.canonicalManifest.path $seal.canonicalManifest.sha256 'Referenced current1691 source/2runtime canonical CAS'
 $ownRunnerHash=$null
 foreach($r in $seal.atomicReceipts){
  if($r.exit -ne 0){throw 'Fresh atomic receipt nongreen'}
  AddPinned $r.path $r.sha256 'Directly referenced one of five fresh atomic raw receipts'
  $atomic=Get-Content -LiteralPath $r.path -Raw|ConvertFrom-Json
  AddPinned $atomic.log.path $atomic.log.sha256 'Exact fresh raw log referenced by atomic receipt; explicit literal force-add'
  if($ownRunnerHash -and $ownRunnerHash -ne $atomic.ownRunnerSha256){throw 'Fresh runner identity inconsistent'}
  $ownRunnerHash=$atomic.ownRunnerSha256
  foreach($prop in $atomic.requiredHelpersBefore.PSObject.Properties){if((Get-FileHash -LiteralPath $prop.Name).Hash.ToLowerInvariant() -ne $prop.Value){throw 'Current helper pin drift'}}
 }
 AddPinned "$d/broker/watched-current-helper-epoch.py" $ownRunnerHash 'Current ownRunnerSha256 recorded by all five actual atomic receipts'
 # Exact compiler config and historical-binding note are referenced by this scoped runner/epoch.
 AddPinned "$d/broker/watched-current-helper-tsconfig.json" '' 'Exact compiler config used by current-helper root-types argv'
 AddPinned "$d/broker/historical-broker-library-binding-unknown.md" '' 'Root-authorized truthful historical binding note'
 $existing=@{};foreach($e in $a.entries){$existing[$e.path]=$true}
 foreach($p in $newPaths.Keys){if($existing.ContainsKey($p)){throw 'Fresh evidence path unexpectedly already in571'}
  $old=@(git ls-tree $base -- $p);if($old.Count){throw 'Fresh evidence unexpectedly exists at base'}
 }
 $rules=@(Get-Content "$d/create-local-milestone.ps1"|Where-Object{$_ -match '^\s*\$patterns=@\('});if($rules.Count -ne 1){throw 'Scanner rules ambiguous'};Invoke-Expression $rules[0]
 $findings=@();$scanBytes=0
 foreach($e in $newPaths.Values){$bytes=[IO.File]::ReadAllBytes((Join-Path $root $e.path));$scanBytes+=$bytes.Length;if($bytes -contains 0){$findings+=@{path=$e.path;type='binary-NUL';count=1}}else{$t=[Text.Encoding]::UTF8.GetString($bytes);foreach($rule in $patterns){$n=[regex]::Matches($t,$rule.r).Count;if($n){$findings+=@{path=$e.path;type=$rule.type;count=$n}}}}}
 $receipt['freshScan']=@{files=$newPaths.Count;bytes=$scanBytes;findings=$findings;valuesPersisted=$false};Save
 if($findings.Count){throw 'Fresh evidence secret scan findings'}
 $a.entries=@($a.entries)+@($newPaths.Values|Sort-Object path)
 $a.state='ROOT_AUTHORIZED_FROZEN_EXACT_STAGE_AND_LOCAL_COMMIT'
 $a['freshEpoch']=@{seal=$sealPath;sha256=(Get-FileHash $sealPath).Hash.ToLowerInvariant();tests='28/28';active_s=$seal.elapsed_s;ownRunnerSha256=$ownRunnerHash;noHistoricalReuse=$true}
 $a['addedFreshEpochPaths']=@($newPaths.Keys|Sort-Object)
 $a['authorizedIgnoredRawLogPaths']=@($a.authorizedIgnoredRawLogPaths)+@($newPaths.Values|Where-Object{$_.status -eq '!!'}|ForEach-Object{$_.path})
 $a.counts.paths=$a.entries.Count;$a.counts.bytes=[long]0;foreach($e in $a.entries){$a.counts.bytes+=$e.bytes}
 $a|ConvertTo-Json -Depth 20|Set-Content "$out/commit-allowlist.json" -Encoding utf8
 $receipt['approvedManifest']=@{path="$out/commit-allowlist.json";sha256=(Get-FileHash "$out/commit-allowlist.json").Hash.ToLowerInvariant();paths=$a.entries.Count;bytes=$a.counts.bytes}
 $unit=Get-Content $a.unit73.manifest -Raw|ConvertFrom-Json
 foreach($p in $unit){if((Get-FileHash $p.path).Hash.ToLowerInvariant() -ne $p.sha256){throw 'Final unit73 drift'}}
 $formal=Get-Content $a.formalEight.packet -Raw|ConvertFrom-Json
 if($formal.unit.candidate_sha -ne $a.formalEight.contentIdentity){throw 'Eight-file manifest identity changed'}
 foreach($p in $formal.unit.files){if((Get-FileHash $p.path).Hash.ToLowerInvariant() -ne $p.sha256){throw 'Final eight-file bytes drift'}}
 AssertRoot;AssertRaw
 if(@(git diff --cached --name-only).Count){throw 'Foreign index appeared before staging'}
 $forced=@($a.authorizedIgnoredRawLogPaths|Sort-Object -Unique);$forceSet=@{};foreach($p in $forced){$forceSet[$p]=$true}
 $normal=@($a.entries|Where-Object{-not $forceSet.ContainsKey($_.path)}|ForEach-Object{$_.path})
 WritePaths "$out/stage-normal.nul" $normal;WritePaths "$out/stage-force-logs.nul" $forced
 & git --literal-pathspecs add "--pathspec-from-file=$out/stage-normal.nul" --pathspec-file-nul 2> "$out/stage-normal.stderr.txt"
 if($LASTEXITCODE -ne 0){throw 'Exact normal staging failed; index preserved'};$receipt.actions.staging=1;Save
 & git --literal-pathspecs add -f "--pathspec-from-file=$out/stage-force-logs.nul" --pathspec-file-nul 2> "$out/stage-force.stderr.txt"
 if($LASTEXITCODE -ne 0){throw 'Exact authorized force-log staging failed; index preserved'}
 $names=@(git -c core.quotepath=false diff --cached --name-only --no-renames|Sort-Object)
 $expected=@($a.entries|ForEach-Object{$_.path}|Sort-Object)
 if(@(Compare-Object $expected $names).Count){throw 'Staged path set mismatch; index preserved'}
 $stages=@{};foreach($l in @(git -c core.quotepath=false ls-files --stage)){if($l -match '^\d+ ([a-f0-9]+) 0\s+(.+)$'){$stages[$Matches[2]]=$Matches[1]}}
 $blobMap=@{}
 foreach($e in $a.entries){
  if($e.mutation -eq 'delete'){if($stages.ContainsKey($e.path)){throw 'Deletion still staged as existing'};continue}
  $oid=(& git hash-object ('--path='+$e.path) -- $e.path 2>$null).Trim();if($LASTEXITCODE -ne 0 -or $stages[$e.path] -ne $oid){throw 'Staged filtered blob differs from frozen approved bytes'};$blobMap[$e.path]=$oid
 }
 $blobMap|ConvertTo-Json -Depth 3|Set-Content "$out/staged-blob-map.json" -Encoding utf8
 & git diff --cached --check > "$out/staged-whitespace.stdout.txt" 2> "$out/staged-whitespace.stderr.txt"
 $receipt['whitespaceExit']=$LASTEXITCODE;Save
 if($LASTEXITCODE -ne 0){throw 'Staged whitespace check failed; no commit; index preserved'}
 # Scan actual staged filtered blobs, never emitting secret values or raw staged content.
 $stagedFindings=@()
 foreach($e in $a.entries){if($e.mutation -eq 'delete'){continue};$text=(& git cat-file blob $blobMap[$e.path]) -join "`n";if($LASTEXITCODE -ne 0){throw 'Staged blob read failed'};foreach($rule in $patterns){$n=[regex]::Matches($text,$rule.r).Count;if($n){$stagedFindings+=@{path=$e.path;type=$rule.type;count=$n}}}}
 $receipt['stagedScan']=@{files=$blobMap.Count;findings=$stagedFindings;valuesPersisted=$false};Save
 if($stagedFindings.Count){throw 'Actual staged content scan findings; index preserved'}
 AssertRoot;AssertRaw
 if(@(Compare-Object $expected @(git -c core.quotepath=false diff --cached --name-only --no-renames|Sort-Object)).Count){throw 'Staged set changed before commit'}
 $identity=@(& git show -s --format='%an%x09%ae%x09%cn%x09%ce' $base);if($LASTEXITCODE -ne 0){throw 'Historical identity unavailable'};$parts=$identity[0]-split [char]9
 if($parts[0] -ne 'Umesh Sugara' -or $parts[0] -ne $parts[2] -or $parts[1] -ne $parts[3] -or -not $parts[1]){throw 'Historical identity mismatch'}
 $msg=@'
Checkpoint vectorless capture recovery and watched-source cadence

LOCAL WIP checkpoint; parent acceptance remains incomplete. Parent: d50a25c200dcbcf574ecade0aa205f5fcb45c5f8.

Current known-helper epoch: 28/28 checks pass; root types, full dependency graph and scoped structure pass (41.047s). Historical broker-library same-byte binding remains UNKNOWN; current evidence does not rewrite earlier proofs.

Native floor retains 206 pass and 4 prerequisite skips, actual EXIT/fresh reopen and read-only evidence. Original failures and the unexplained intermittent recovered-unavailable result remain preserved.

Replica cycle1 PASS covers offline source fixes only; original FAIL and runtime HOLD remain. Human evaluation authority, host/native/Mongo/privacy/downstream/release qualification and independent parent acceptance remain open. No deployment, activation or push.
'@
 $msg|Set-Content "$out/authorized-commit-message.txt" -Encoding utf8
 $receipt.status='STAGED_VERIFIED_COMMIT_ATTEMPT';Save
 & git -c ('user.name='+$parts[0]) -c ('user.email='+$parts[1]) commit -F "$out/authorized-commit-message.txt" > "$out/commit.stdout.txt" 2> "$out/commit.stderr.txt"
 $commitExit=$LASTEXITCODE;$receipt['commitExit']=$commitExit;Save
 if($commitExit -ne 0){throw 'Normal commit rejected; no hook bypass or retry attempted; index preserved'}
 $receipt.actions.commit=1;$commit=(git rev-parse HEAD).Trim();$receipt['commit']=$commit
 if((git rev-parse HEAD^).Trim() -ne $base){throw 'Committed parent mismatch'}
 $committed=@(git -c core.quotepath=false diff-tree --no-commit-id --name-only --no-renames -r HEAD|Sort-Object)
 if(@(Compare-Object $expected $committed).Count){throw 'Committed path set mismatch'}
 foreach($p in $unit){$committedBlob=(git rev-parse ('HEAD:'+$p.path)).Trim();if($committedBlob -ne $blobMap[$p.path]){throw 'Committed73 bytes mismatch'}}
 foreach($p in $formal.unit.files){$path=Relative $p.path;if((git rev-parse ('HEAD:'+$path)).Trim() -ne $blobMap[$path]){throw 'Committed eight-file bytes mismatch'}}
 $afterIndex=@(git -c core.quotepath=false diff --cached --name-only --no-renames)
 $receipt['indexEmptyAfter']=$afterIndex.Count -eq 0
 $afterDirty=@(git -c core.quotepath=false status --porcelain=v1 --untracked-files=all 2>$null)
 $receipt['remainingDirty']=@{total=$afterDirty.Count;tracked=@($afterDirty|Where-Object{-not $_.StartsWith('??')}).Count;untracked=@($afterDirty|Where-Object{$_.StartsWith('??')}).Count}
 $preservation=@();$owned=@{};foreach($p in $expected){$owned[$p]=$true};$post=@{};foreach($line in $afterDirty){$post[$line.Substring(3)]=$line.Substring(0,2)}
 foreach($line in $beforeDirty){$path=$line.Substring(3);if(-not $owned.ContainsKey($path) -and $post[$path] -ne $line.Substring(0,2)){$preservation+=$path}}
 $receipt['unrelatedDirtyStatusDrift']=$preservation
 if($preservation.Count){throw 'Unexpected unrelated dirty status drift; no recovery mutation attempted'}
 $receipt['committedPaths']=$committed.Count;$receipt['unit73CommitBytesVerified']=$true;$receipt['eightFileCommitIdentityVerified']=$true;$receipt.status='LOCAL_WIP_COMMITTED_NO_PUSH';Save
 [pscustomobject]@{status=$receipt.status;commit=$commit;paths=$committed.Count;tests='current28/28; native206pass4skip; EXIT+readonly';remainingDirty=$receipt.remainingDirty;indexEmpty=$receipt.indexEmptyAfter;pushes=0}|ConvertTo-Json -Depth 5
}catch{$receipt.status='CHECKPOINT_STOPPED_INDEX_PRESERVED';$receipt.failures+=@{type=$_.Exception.GetType().Name;message=$_.Exception.Message};Save;throw}

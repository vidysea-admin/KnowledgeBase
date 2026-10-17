$ErrorActionPreference='Stop'
$d='qa/coordination/resume-20261015/local-wip-post-d50';$base='d50a25c200dcbcf574ecade0aa205f5fcb45c5f8';$root=(Get-Location).Path
$a=Get-Content "$d/commit-allowlist.json" -Raw|ConvertFrom-Json
$map=Get-Content "$d/staged-blob-map.json" -Raw|ConvertFrom-Json -AsHashtable
$receipt=Get-Content "$d/local-commit-receipt.json" -Raw|ConvertFrom-Json -AsHashtable
function Save {$receipt|ConvertTo-Json -Depth 15|Set-Content "$d/local-commit-receipt.json" -Encoding utf8}
try{
 if((git rev-parse HEAD).Trim() -ne $base){throw 'HEAD changed'}
 $expected=@($a.entries.path|Sort-Object);$names=@(git -c core.quotepath=false diff --cached --name-only --no-renames|Sort-Object)
 if($expected.Count -ne 586 -or @(Compare-Object $expected $names).Count){throw 'Exact586 staged set changed'}
 $current=@{};foreach($l in @(git -c core.quotepath=false ls-files --stage)){if($l -match '^\d+ ([a-f0-9]+) 0\s+(.+)$'){$current[$Matches[2]]=$Matches[1]}}
 foreach($e in $a.entries){
  if($e.mutation -eq 'delete'){if((Test-Path -LiteralPath $e.path) -or $current.ContainsKey($e.path)){throw 'Deletion identity changed'};continue}
  if((Get-FileHash -LiteralPath $e.path).Hash.ToLowerInvariant() -ne $e.sha256 -or $current[$e.path] -ne $map[$e.path]){throw 'Frozen raw/staged identity changed'}
 }
 $scan=Get-Content "$d/actual-staged-content-safety.json" -Raw|ConvertFrom-Json
 if($scan.findingCount -ne 0 -or $scan.files -ne 583){throw 'Actual staged scanner not green'}
 $receipt['stagedScan']=@{path="$d/actual-staged-content-safety.json";sha256=(Get-FileHash "$d/actual-staged-content-safety.json").Hash.ToLowerInvariant();findings=0;files=583}
 $receipt['whitespaceDisposition']=@{actualExit=$receipt.whitespaceExit;issues=37;paths=12;rootDecision='Advisory for THIS LOCAL WIP commit; no active contract requires global zero. Preserve three DB source EOF blank lines, two byte preimages and seven verbatim raw logs. No byte edit or Git/hook/config change.';pathOnlyEvidence="$d/whitespace-path-only.json"}
 $guardOutput=& .codex/hooks/mc-precommit.ps1 -InputJson '{"command":"git commit"}'
 if($LASTEXITCODE -ne 0 -or ($guardOutput -join '') -match '"permissionDecision"\s*:\s*"deny"'){throw 'Repository commit guard rejected'}
 $receipt['repositoryGuard']=@{invoked='.codex/hooks/mc-precommit.ps1';denied=$false;pendingCheckerWarningsPreserved=$true}
 $id=@(& git show -s --format='%an%x09%ae%x09%cn%x09%ce' $base);if($LASTEXITCODE -ne 0){throw 'Historical identity read failed'};$parts=$id[0]-split [char]9
 if($parts[0] -ne 'Umesh Sugara' -or $parts[0] -ne $parts[2] -or $parts[1] -ne $parts[3] -or -not $parts[1]){throw 'Historical identity mismatch'}
 $message=@'
Checkpoint vectorless capture recovery and watched-source cadence

LOCAL WIP / HOLD checkpoint; parent acceptance remains incomplete. Parent: d50a25c200dcbcf574ecade0aa205f5fcb45c5f8.

Current known-helper epoch: 28/28 checks pass; root types, full dependency graph and scoped structure pass (41.047s). Historical broker-library same-byte binding remains UNKNOWN; current evidence does not rewrite earlier proofs.

Native floor retains 206 pass and 4 prerequisite skips, actual EXIT/fresh reopen and read-only evidence. Original failures and the unexplained intermittent recovered-unavailable result remain preserved.

Known whitespace remains verbatim: git diff --cached --check reported 37 findings across 12 paths (three DB source EOF blank lines, two source byte preimages and seven raw logs). Root accepted this advisory style warning for this local WIP only; no source/evidence normalization or hook/config bypass.

Replica cycle1 PASS covers offline source fixes only; original FAIL and runtime HOLD remain. Human evaluation authority, host/native/Mongo/privacy/downstream/release qualification and independent parent acceptance remain open. No deployment, activation or push.
'@
 $message|Set-Content "$d/authorized-commit-message.txt" -Encoding utf8
 $receipt['identity']=@{sourceCommit=$base;historicalNameMatched=$true;emailPrintedOrPersisted=$false;configMutation=$false}
 $receipt.status='STAGED_VERIFIED_NORMAL_COMMIT_ATTEMPT';Save
 & git -c ('user.name='+$parts[0]) -c ('user.email='+$parts[1]) commit -F "$d/authorized-commit-message.txt" > "$d/commit.stdout.txt" 2> "$d/commit.stderr.txt"
 $own=$LASTEXITCODE;$receipt['commitExit']=$own;Save
 if($own -ne 0){throw 'Normal commit rejected; no retry or bypass; index preserved'}
 $receipt.actions.commit=1;$commit=(git rev-parse HEAD).Trim();$receipt['commit']=$commit
 if((git rev-parse HEAD^).Trim() -ne $base){throw 'Committed parent mismatch'}
 $committed=@(git -c core.quotepath=false diff-tree --no-commit-id --name-only --no-renames -r HEAD|Sort-Object)
 if(@(Compare-Object $expected $committed).Count){throw 'Committed paths mismatch'}
 $tree=@{};foreach($l in @(git -c core.quotepath=false ls-tree -r HEAD)){if($l -match '^\d+ blob ([a-f0-9]+)\t(.+)$'){$tree[$Matches[2]]=$Matches[1]}}
 $unit=Get-Content $a.unit73.manifest -Raw|ConvertFrom-Json
 foreach($pin in $unit){if((Get-FileHash $pin.path).Hash.ToLowerInvariant() -ne $pin.sha256 -or $tree[$pin.path] -ne $map[$pin.path]){throw 'Committed73 source identity mismatch'}}
 $formal=Get-Content $a.formalEight.packet -Raw|ConvertFrom-Json
 if($formal.unit.candidate_sha -ne $a.formalEight.contentIdentity){throw 'Eight content identity drift'}
 foreach($pin in $formal.unit.files){$p=$pin.path.Substring($root.Length+1).Replace('\','/');if($tree[$p] -ne $map[$p]){throw 'Committed eight-file identity mismatch'}}
 $afterIndex=@(git -c core.quotepath=false diff --cached --name-only --no-renames);$receipt['indexEmptyAfter']=$afterIndex.Count -eq 0
 if($afterIndex.Count){throw 'Postcommit index not empty; preserved'}
 $after=@(git -c core.quotepath=false status --porcelain=v1 --untracked-files=all 2>$null)
 $receipt['remainingDirty']=@{total=$after.Count;tracked=@($after|Where-Object{-not $_.StartsWith('??')}).Count;untracked=@($after|Where-Object{$_.StartsWith('??')}).Count}
 $receipt['committedPaths']=$committed.Count;$receipt['unit73CommitBytesVerified']=$true;$receipt['eightFileCommitIdentityVerified']=$true
 $receipt['unrelatedDirtyWork']='No reset/clean/stash; exact staged mutation set only committed. Remaining dirty status counted; shared-agent additions may increase untracked count.'
 $receipt.status='LOCAL_WIP_COMMITTED_NO_PUSH';Save
 [pscustomobject]@{status=$receipt.status;commit=$commit;parent=$base;paths=$committed.Count;indexEmpty=$receipt.indexEmptyAfter;remainingDirty=$receipt.remainingDirty;pushes=0}|ConvertTo-Json -Depth 5
}catch{$receipt.status='CHECKPOINT_STOPPED_INDEX_PRESERVED';$receipt.failures+=@{type=$_.Exception.GetType().Name;message=$_.Exception.Message};Save;throw}

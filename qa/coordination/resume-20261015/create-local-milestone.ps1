param([switch]$ResumeOwnedIndex)
$ErrorActionPreference='Stop'
$d='qa/coordination/resume-20261015'
$runStamp=(Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$receipt=[ordered]@{schema='local-milestone-commit/1';startedAt=(Get-Date).ToUniversalTime().ToString('o');authorization='Explicit user local commit, root released LOCAL WIP milestone; no push';commands=@();status='STARTED';commitSha=$null;pushes=0;configMutations=0;stageMutations=0}
function SaveReceipt {$receipt|ConvertTo-Json -Depth 12|Set-Content "$d/local-milestone-commit-receipt.json" -Encoding utf8}
function RunGit([string]$label,[string[]]$gitArgs){
 $stdout="$d/commit-$runStamp-$label.stdout.txt";$stderr="$d/commit-$runStamp-$label.stderr.txt"
 $result=@(& git @gitArgs 2> $stderr);$own=$LASTEXITCODE
 $result|Set-Content $stdout -Encoding utf8
 $receipt.commands+=@{label=$label;ownExit=$own;stdout=$stdout;stderr=$stderr};SaveReceipt
 if($own-ne 0){throw "Git operation failed: $label (exit $own)"}
 return $result
}
function BlobBytes([string]$oid){
 $psi=[Diagnostics.ProcessStartInfo]::new();$psi.FileName='git';$psi.ArgumentList.Add('cat-file');$psi.ArgumentList.Add('blob');$psi.ArgumentList.Add($oid);$psi.UseShellExecute=$false;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true;$psi.CreateNoWindow=$true
 $proc=[Diagnostics.Process]::Start($psi);$mem=[IO.MemoryStream]::new();$proc.StandardOutput.BaseStream.CopyTo($mem);$err=$proc.StandardError.ReadToEnd();$proc.WaitForExit();if($proc.ExitCode-ne 0){throw 'Staged blob read failed'};return ,$mem.ToArray()
}
try {
 $a=Get-Content "$d/local-commit-final-allowlist.json" -Raw|ConvertFrom-Json
 $receipt.allowlistSha256=(Get-FileHash "$d/local-commit-final-allowlist.json").Hash.ToLowerInvariant()
 $receipt.baseSha=(@(RunGit 'head-before' @('rev-parse','HEAD'))[0])
 if($receipt.baseSha-ne $a.head){throw 'HEAD changed'}
 $receipt.branch=(@(RunGit 'branch-before' @('branch','--show-current'))[0])
 if($receipt.branch-ne $a.branch){throw 'Branch changed'}
 $indexBefore=@(RunGit 'index-before' @('diff','--cached','--name-only'))
 if($indexBefore.Count){
  if(-not $ResumeOwnedIndex){throw 'Unexpected nonempty index: stopped without reset'}
  $owned=@(RunGit 'resume-owned-index-names' @('-c','core.quotepath=false','diff','--cached','--name-only','--no-renames'))
  $approved=@($a.mutations|ForEach-Object{$_.path}|Sort-Object -Unique)
  if(@(Compare-Object @($approved) @($owned|Sort-Object -Unique)).Count){throw 'Unexpected resume index contents'}
  $receipt['resumedExactOwnedIndex']=$true
 }
 $verdictPath='qa/verdicts/t013-t037-t056-joined-source-slices.md';$v=Get-Content $verdictPath -Raw
 $code='import {readFileSync} from "node:fs";import {verdictCycle} from "./scripts/qa/dispatch-state.mjs";console.log(verdictCycle(readFileSync("qa/verdicts/t013-t037-t056-joined-source-slices.md","utf8")))'
 $cycle=@(& node --input-type=module -e $code);$parserExit=$LASTEXITCODE
 $receipt.commands+=@{label='actual-repository-verdict-cycle-parser';ownExit=$parserExit}
 $sha=[regex]::Match($v,'(?m)^Reviewed SHA: ([a-f0-9]+)\s*$').Groups[1].Value
 if($parserExit-ne 0-or $cycle[0]-ne '0'-or $v-notmatch '(?m)^Verdict: HOLD\s*$'-or $v-notmatch '(?m)^Status: NEEDS_EXTRA_REVIEW\s*$'-or $sha-ne 'eebad8d658fad78a678eae50252909b44c567f0184feda35bdbc3df97be122de'){throw 'Canonical verdict identity mismatch'}
 $receipt.verdict=@{path=$verdictPath;verdict='HOLD';status='NEEDS_EXTRA_REVIEW';cycle=0;reviewedSha=$sha;sha256=(Get-FileHash $verdictPath).Hash.ToLowerInvariant()}
 $drift=@();foreach($e in $a.allExistingCandidateEntries){if(-not(Test-Path -LiteralPath $e.path -PathType Leaf)-or (Get-FileHash -LiteralPath $e.path).Hash.ToLowerInvariant()-ne $e.sha256){$drift+=$e.path}}
 $receipt.rawShaDrift=$drift;if($drift.Count){throw 'Raw candidate SHA mismatch'}
 $forbidden=@($a.allExistingCandidateEntries|Where-Object{$_.path-match '^raw/|^data/|^sources/|(^|/)\.env|\.(wav|mp4|webm|pem|key|pfx|bytes)$|^qa/(contracts|verdicts)/|^contracts/|^AGENTS.md$|^ARCHITECTURE.md$|^docs/DECISIONS.md$|^TASKS.md$|^\.goal/|(^|/)\.codex/|scripts/append_decision.ps1'})
 if($forbidden.Count){throw 'Forbidden/private/governance path in stage list'}
 $paths=@(@($a.allExistingCandidateEntries|ForEach-Object{$_.path})+@($a.mutations|Where-Object{$_.mutation-eq 'delete'}|ForEach-Object{$_.path})|Sort-Object -Unique)
 $pathspec="$d/local-milestone-stage.pathspec.nul";[IO.File]::WriteAllBytes((Join-Path (Get-Location) $pathspec),[Text.UTF8Encoding]::new($false).GetBytes(($paths-join [char]0)+[char]0))
 if(-not $ResumeOwnedIndex){$null=RunGit 'add-exact-pathspec' @('--literal-pathspecs','add',('--pathspec-from-file='+$pathspec),'--pathspec-file-nul');$receipt.stageMutations=1}
 $names=@(RunGit 'staged-names' @('-c','core.quotepath=false','diff','--cached','--name-only','--no-renames'))
 $expected=@($a.mutations|ForEach-Object{$_.path}|Sort-Object -Unique)
 $delta=@(Compare-Object @($expected) @($names|Sort-Object -Unique));$receipt.stagedPathMismatch=$delta
 if($delta.Count){throw 'Staged name identity mismatch; index retained'}
 $receipt.stagedPathCount=$names.Count;$receipt.stagedNames=$names
 $null=RunGit 'staged-name-status' @('-c','core.quotepath=false','diff','--cached','--name-status','--no-renames')
 $null=RunGit 'staged-stat' @('diff','--cached','--stat')
 $null=RunGit 'staged-whitespace-check' @('diff','--cached','--check')
 $stageMap=@{};foreach($line in @(RunGit 'staged-index' @('-c','core.quotepath=false','ls-files','--stage'))){if($line-match '^\d+ ([a-f0-9]+) 0\s+(.+)$'){$stageMap[$Matches[2]]=$Matches[1]}}
 $blobMismatch=@();$findings=@()
 $patterns=@(@{type='private-key';r='-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----'},@{type='provider-key';r='(?<![A-Za-z0-9])(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}|AIza[0-9A-Za-z_-]{30,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{35,}|xox[baprs]-[A-Za-z0-9-]{20,})'},@{type='bearer-jwt';r='(?i)\bBearer\s+[A-Za-z0-9_-]{18,}|\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\b'},@{type='secret-assignment';r='(?i)\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|secret[_-]?key)\b\s*[:=]\s*["''][^"'']{12,}["'']'},@{type='credential-uri';r='(?i)(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|https?)://[A-Za-z0-9._%-]+:[^@\s"'']{6,}@'},@{type='embedded-media';r='data:(?:audio|video|image)/[^;]+;base64,[A-Za-z0-9+/=]{100,}|["''][A-Za-z0-9+/]{512,}={0,2}["'']'})
 foreach($e in $a.allExistingCandidateEntries){
  $oid=@(& git hash-object ('--path='+$e.path) -- $e.path);$own=$LASTEXITCODE
  if($own-ne 0-or $oid[0]-ne $stageMap[$e.path]){$blobMismatch+=$e.path;continue}
  if($e.path-notin $names){continue}
  $bytes=BlobBytes $stageMap[$e.path];if($bytes-contains 0){$findings+=@{path=$e.path;line=0;type='binary-NUL'};continue}
  $lines=[Text.Encoding]::UTF8.GetString($bytes)-split '\r?\n'
  for($i=0;$i-lt $lines.Count;$i++){foreach($rule in $patterns){if([regex]::IsMatch($lines[$i],$rule.r)){
   if($rule.type-eq 'credential-uri'-and $e.path-eq 'apps/api/src/connector-workflow/workflow.test.ts'-and ($i+1)-in @(68,159)){continue}
   $findings+=@{path=$e.path;line=$i+1;type=$rule.type}
  }}}
 }
 $receipt.stagedBlobMismatch=$blobMismatch;$receipt.stagedPrivateFindings=$findings;$receipt.stagedSecretValuesPersisted=$false
 $receipt.commands+=@{label='filtered-blob-identity-and-staged-content-scan';ownExit=if($blobMismatch.Count-or $findings.Count){1}else{0};paths=$a.allExistingCandidateEntries.Count};SaveReceipt
 if($blobMismatch.Count-or $findings.Count){throw 'Staged content/identity check failed; index retained'}
 foreach($e in $a.allExistingCandidateEntries){if((Get-FileHash -LiteralPath $e.path).Hash.ToLowerInvariant()-ne $e.sha256){throw 'Raw source drift after staging; index retained'}}
 $identity=@(& git show -s --format='%an%x09%ae%x09%cn%x09%ce' $receipt.baseSha);if($LASTEXITCODE-ne 0){throw 'Identity lookup failed'};$parts=$identity[0]-split [char]9
 if($parts[0]-ne 'Umesh Sugara'-or $parts[0]-ne $parts[2]-or $parts[1]-ne $parts[3]-or -not $parts[1]){throw 'Established identity mismatch'}
 $receipt.identity=@{name=$parts[0];sourceCommit=$receipt.baseSha;emailPrintedOrPersisted=$false;configMutation=$false}
 $receipt.stagedTree=(@(RunGit 'tree-before-commit' @('write-tree'))[0])
 $null=RunGit 'local-commit' @('-c',('user.name='+$parts[0]),'-c',('user.email='+$parts[1]),'commit',('--file='+"$d/local-milestone-commit-message.txt"))
 $receipt.commitSha=(@(RunGit 'head-after' @('rev-parse','HEAD'))[0])
 $receipt.committedTree=(@(RunGit 'tree-after-commit' @('rev-parse','HEAD^{tree}'))[0])
 if($receipt.committedTree-ne $receipt.stagedTree){throw 'Committed tree mismatch'}
 $receipt.committedPaths=@(RunGit 'committed-paths' @('-c','core.quotepath=false','diff-tree','--no-commit-id','--name-only','-r','--no-renames',$receipt.commitSha))
 $receipt.indexEmptyAfter=(@(RunGit 'index-after' @('diff','--cached','--name-only')).Count-eq 0)
 $status=@(& git -c core.quotepath=false status --porcelain=v1 --untracked-files=all 2> "$d/commit-post-status.stderr.txt");$receipt.commands+=@{label='post-status';ownExit=$LASTEXITCODE}
 $status|Set-Content "$d/commit-post-status.txt" -Encoding utf8
 $receipt.postStatusCounts=@{total=$status.Count;tracked=@($status|Where-Object{-not $_.StartsWith('??')}).Count;untracked=@($status|Where-Object{$_.StartsWith('??')}).Count}
 $receipt.status='LOCAL_WIP_COMMITTED_NO_PUSH';$receipt.finishedAt=(Get-Date).ToUniversalTime().ToString('o');SaveReceipt
 @{status=$receipt.status;commitSha=$receipt.commitSha;stagedPathCount=$receipt.stagedPathCount;committedPathCount=$receipt.committedPaths.Count;indexEmptyAfter=$receipt.indexEmptyAfter;remainingDirty=$receipt.postStatusCounts;pushes=0}|ConvertTo-Json -Depth 5
}catch{$receipt.status='STOPPED_INDEX_PRESERVED';$receipt.failure=$_.Exception.Message;$receipt.finishedAt=(Get-Date).ToUniversalTime().ToString('o');SaveReceipt;throw}

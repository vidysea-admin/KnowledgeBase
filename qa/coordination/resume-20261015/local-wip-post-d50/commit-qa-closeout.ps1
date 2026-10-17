$ErrorActionPreference='Stop'
$d='qa/coordination/resume-20261015';$out="$d/local-wip-post-d50";$root=(Get-Location).Path;$base='ec143c9e57a1b2bb13ee66a0b127e720fdf2dca6'
$a=Get-Content "$out/qa-closeout-prepared.json" -Raw|ConvertFrom-Json -AsHashtable
$receipt=[ordered]@{schema='qa-only-local-closeout-commit/1';base=$base;status='PREPARING';actions=@{stage=0;commit=0;push=0;config=0};failures=@()}
function Save {$receipt|ConvertTo-Json -Depth 15|Set-Content "$out/qa-closeout-commit-receipt.json" -Encoding utf8}
function Rel([string]$p){$p=$p.Replace('\','/');if($p.StartsWith($root.Replace('\','/')+'/')){$p=$p.Substring($root.Length+1)};return $p}
function PathFile([string]$file,$paths){[IO.File]::WriteAllBytes((Join-Path $root $file),[Text.UTF8Encoding]::new($false).GetBytes((@($paths)-join [char]0)+[char]0))}
function RawGate {
 foreach($e in $a.entries){if($e.path -notmatch '^qa/' -or (Get-FileHash -LiteralPath $e.path).Hash.ToLowerInvariant() -ne $e.sha256){throw 'QA-only frozen candidate identity failed'}}
 foreach($p in $a.source8Pins){if((Get-FileHash -LiteralPath $p.path).Hash.ToLowerInvariant() -ne $p.sha256){throw 'Eight-source raw identity drift'}}
}
function SourceTree {
 $map=@{};foreach($p in $a.source8Pins){$map[$p.path]=(git rev-parse ($base+':'+$p.path)).Trim()};return $map
}
try{
 if((git rev-parse HEAD).Trim() -ne $base -or @(git diff --cached --name-only).Count){throw 'QA-only initial HEAD/index gate failed'}
 RawGate
 $beforeDirty=@(git -c core.quotepath=false status --porcelain=v1 --untracked-files=all 2>$null);$beforeSource=SourceTree
 $receipt['beforeDirty']=@{total=$beforeDirty.Count;tracked=@($beforeDirty|Where-Object{-not $_.StartsWith('??')}).Count;untracked=@($beforeDirty|Where-Object{$_.StartsWith('??')}).Count}
 $sealPath="$d/broker/native-remaining-two-final-seal.json";$sealSha='9c36c4730957ddad76b441d0139b31305b43e92727a8d3046c6ef9c6986c97a8'
 if((Get-FileHash $sealPath).Hash.ToLowerInvariant() -ne $sealSha){throw 'Exact released guard seal mismatch'}
 $seal=Get-Content $sealPath -Raw|ConvertFrom-Json
 if($seal.candidate -ne $base -or $seal.headAfter -ne $base -or -not $seal.allPinsFinalMatch -or -not $seal.ownedFixtureRemoved){throw 'Guard release prerequisites not proved'}
 $existing=@{};foreach($e in $a.entries){$existing[$e.path]=$true}
 $new=@{}
 function AddEvidence([string]$p,[string]$h,[string]$why){
  $p=Rel $p
  if($existing.ContainsKey($p)){if($h -and ($a.entries|Where-Object{$_.path -eq $p}).sha256 -ne $h){throw 'Existing QA/request pin mismatch'};return}
  if($p -notmatch '^qa/coordination/resume-20261015/broker/(native-remaining-two[^/]*\.(json|log|py|md)|pin-manifests/[a-f0-9]{64}\.json|native-binaries\.json|native-binary-hashes\.json)$'){throw 'Guard QA evidence outside explicit scope'}
  $actual=(Get-FileHash -LiteralPath $p).Hash.ToLowerInvariant();if($h -and $h -ne $actual){throw 'Guard raw evidence hash mismatch'}
  if(@(git ls-tree $base -- $p).Count){throw 'Unexpected guard metadata existing at source commit'}
  $new[$p]=@{path=$p;sha256=$actual;bytes=(Get-Item -LiteralPath $p).Length;mutation='add';status=if($p.EndsWith('.log')){'!!'}else{'??'};owner='released sole-broker two native guard attempt';origin=$why;beforeEcBlob=$null}
 }
 AddEvidence $sealPath $sealSha 'Actual final released seal; native two guards INCOMPLETE, not assertion failure/PASS'
 AddEvidence $seal.request.path $seal.request.sha256 'Exact actual request already in prepared62'
 AddEvidence $seal.pins.path $seal.pins.sha256 'Exact88-pin canonical CAS from actual attempt'
 foreach($r in $seal.atomicReceipts){
  AddEvidence $r.path $r.sha256 'Exact direct atomic receipt from released seal'
  AddEvidence $r.log.path $r.log.sha256 'Exact direct raw log; empty guard log valid and counts UNKNOWN'
 }
 $cas=Get-Content $seal.pins.path -Raw|ConvertFrom-Json -AsHashtable
 $runner="$d/broker/native-remaining-two-run.py";$runnerAbs=Join-Path $root $runner
 $runnerPin=$cas.files[$runnerAbs];if(-not $runnerPin){throw 'Actual runner missing from88-pin CAS'}
 AddEvidence $runner $runnerPin 'Exact actual broker runner bound by released88-pin CAS'
 AddEvidence "$d/broker/native-remaining-two-timeout-checkpoint.md" '' 'Exact scoped timeout/release explanation preserving unknown counts'
 AddEvidence "$d/broker/native-binaries.json" '' 'Public local executable lookup metadata directly read by actual runner; no executable payload'
 AddEvidence "$d/broker/native-binary-hashes.json" '' 'Executable identity lookup metadata directly read by actual runner; no executable payload'
 $rules=@(Get-Content "$d/create-local-milestone.ps1"|Where-Object{$_ -match '^\s*\$patterns=@\('});Invoke-Expression $rules[0]
 $findings=@();$newBytes=0
 foreach($e in $new.Values){$bytes=[IO.File]::ReadAllBytes((Join-Path $root $e.path));$newBytes+=$bytes.Length;if($bytes -contains 0){$findings+=@{path=$e.path;type='binary-NUL';count=1}}else{$t=[Text.Encoding]::UTF8.GetString($bytes);foreach($rule in $patterns){$n=[regex]::Matches($t,$rule.r).Count;if($n){$findings+=@{path=$e.path;type=$rule.type;count=$n}}}}}
 $receipt['newGuardScan']=@{files=$new.Count;bytes=$newBytes;findings=$findings;valuesPersisted=$false};Save
 if($findings.Count){throw 'New exact guard QA secret scan findings'}
 $a.entries=@($a.entries)+@($new.Values|Sort-Object path);$a.state='ROOT_AUTHORIZED_BROKER_RELEASED_QA_ONLY_COMMIT';$a['guardResult']=@{seal=$sealPath;sha256=$sealSha;forcedExit=124;guardActiveSeconds=70.594;phaseSeconds=84.375;terminalCounts='UNKNOWN empty raw log; two requested guards INCOMPLETE';accounting='SHARED INTEGRATION; not watched checker';treeClosed=$true;ownedFixtureRemoved=$true}
 $a.counts.paths=$a.entries.Count;$a.counts.bytes=[long]0;foreach($e in $a.entries){$a.counts.bytes+=$e.bytes}
 $a|ConvertTo-Json -Depth 20|Set-Content "$out/qa-closeout-final-allowlist.json" -Encoding utf8
 $receipt['manifest']=@{path="$out/qa-closeout-final-allowlist.json";sha256=(Get-FileHash "$out/qa-closeout-final-allowlist.json").Hash.ToLowerInvariant();paths=$a.entries.Count;bytes=$a.counts.bytes}
 RawGate
 if((git rev-parse HEAD).Trim() -ne $base -or @(git diff --cached --name-only).Count){throw 'HEAD/index changed before QA-only stage'}
 $forced=@($a.entries|Where-Object{$_.status -eq '!!'}|ForEach-Object{$_.path});$normal=@($a.entries|Where-Object{$_.status -ne '!!'}|ForEach-Object{$_.path});$expected=@($a.entries|ForEach-Object{$_.path}|Sort-Object)
 PathFile "$out/qa-closeout-normal.nul" $normal;PathFile "$out/qa-closeout-force.nul" $forced
 & git --literal-pathspecs add "--pathspec-from-file=$out/qa-closeout-normal.nul" --pathspec-file-nul 2> "$out/qa-stage-normal.stderr.txt";if($LASTEXITCODE -ne 0){throw 'Exact QA normal staging failed'};$receipt.actions.stage=1;Save
 if($forced.Count){& git --literal-pathspecs add -f "--pathspec-from-file=$out/qa-closeout-force.nul" --pathspec-file-nul 2> "$out/qa-stage-force.stderr.txt";if($LASTEXITCODE -ne 0){throw 'Exact QA raw-log force staging failed'}}
 $names=@(git -c core.quotepath=false diff --cached --name-only --no-renames|Sort-Object)
 if(@(Compare-Object $expected $names).Count -or @($names|Where-Object{$_ -notmatch '^qa/'}).Count){throw 'Exact QA-only staged path set mismatch'}
 $stages=@{};foreach($l in @(git -c core.quotepath=false ls-files --stage)){if($l -match '^\d+ ([a-f0-9]+) 0\s+(.+)$'){$stages[$Matches[2]]=$Matches[1]}}
 $stagedFindings=@()
 foreach($e in $a.entries){
  $blob=(& git hash-object ('--path='+$e.path) -- $e.path 2>$null).Trim();if($LASTEXITCODE -ne 0 -or $blob -ne $stages[$e.path]){throw 'QA staged filtered blob does not match approved bytes'}
  $text=(& git cat-file blob $blob)-join "`n";if($LASTEXITCODE -ne 0){throw 'QA staged blob read failed'};foreach($rule in $patterns){$n=[regex]::Matches($text,$rule.r).Count;if($n){$stagedFindings+=@{path=$e.path;type=$rule.type;count=$n}}}
 }
 $receipt['actualStagedScan']=@{files=$a.entries.Count;findings=$stagedFindings;valuesPersisted=$false};Save;if($stagedFindings.Count){throw 'Actual staged QA secret scan findings'}
 & git diff --cached --check > "$out/qa-staged-whitespace.stdout.txt" 2> "$out/qa-staged-whitespace.stderr.txt";$receipt['whitespaceExit']=$LASTEXITCODE
 $receipt['whitespaceDisposition']='Preserve exact raw QA proof. No source staged; source prior37 warnings unchanged. Actual metadata diff check result recorded without disabling Git/hooks/config.'
 $guardOutput=& .codex/hooks/mc-precommit.ps1 -InputJson '{"command":"git commit"}';if($LASTEXITCODE -ne 0 -or ($guardOutput-join '') -match '"permissionDecision"\s*:\s*"deny"'){throw 'Repository commit guard rejected'}
 RawGate
 if((git rev-parse HEAD).Trim() -ne $base -or @(Compare-Object $expected @(git -c core.quotepath=false diff --cached --name-only --no-renames|Sort-Object)).Count){throw 'Precommit final identity changed'}
 $id=@(git show -s --format='%an%x09%ae%x09%cn%x09%ce' $base);$parts=$id[0]-split [char]9
 if($LASTEXITCODE -ne 0 -or $parts[0] -ne 'Umesh Sugara' -or $parts[0] -ne $parts[2] -or $parts[1] -ne $parts[3] -or -not $parts[1]){throw 'Historical per-command identity mismatch'}
 $message=@'
Record independent cadence review and local verification evidence

QA-only local checkpoint. Product source candidate remains ec143c9e57a1b2bb13ee66a0b127e720fdf2dca6; all eight reviewed source files/content identity are unchanged. Canonical independent cycle2 PASS and maker checked-PASS close only that watched-cadence local implementation/offline slice.

Preserve complete review history, narrow boundary evidence, contracts invocation green by vacuity, actual unknown usage and unverified10%metrics. Parent39 remains in_progress; no parent/integration/release acceptance is asserted.

The remaining two native guards are INCOMPLETE: actual forced exit124,70.594s supervised job,84.375s shared integration phase, empty raw log and UNKNOWN terminal counts. This is neither two PASSes nor an attributed assertion failure. Owned tree closed, disposable fixture removed, source/HEAD identities stable. Evidence is separate from watched checker; no retry or source edit.

Four prior native prerequisite skips, unexplained intermittent recovery, human/pilot/host/Mongo/native/downstream/release gates remain open. Raw proof and known source whitespace stay verbatim. No source/config/enforcement changes, activation, deployment or push.
'@
 $message|Set-Content "$out/qa-closeout-commit-message.txt" -Encoding utf8;$receipt.status='QA_STAGED_VERIFIED_NORMAL_COMMIT_ATTEMPT';Save
 & git -c ('user.name='+$parts[0]) -c ('user.email='+$parts[1]) commit -F "$out/qa-closeout-commit-message.txt" > "$out/qa-commit.stdout.txt" 2> "$out/qa-commit.stderr.txt"
 $exit=$LASTEXITCODE;$receipt['commitExit']=$exit;Save;if($exit -ne 0){throw 'Normal QA commit rejected; no bypass or retry; index preserved'}
 $receipt.actions.commit=1;$commit=(git rev-parse HEAD).Trim();$receipt['commit']=$commit
 if((git rev-parse HEAD^).Trim() -ne $base){throw 'QA commit parent mismatch'}
 $changed=@(git -c core.quotepath=false diff-tree --no-commit-id --name-only --no-renames -r HEAD|Sort-Object)
 if(@(Compare-Object $expected $changed).Count){throw 'QA committed path set mismatch'}
 foreach($p in $a.source8Pins){if((git rev-parse ('HEAD:'+$p.path)).Trim() -ne $beforeSource[$p.path]){throw 'Eight committed product sources changed'}}
 RawGate
 if(@(git diff --cached --name-only).Count){throw 'Postcommit index not empty'}
 $after=@(git -c core.quotepath=false status --porcelain=v1 --untracked-files=all 2>$null)
 $postMap=@{};foreach($l in $after){$postMap[$l.Substring(3)]=$l.Substring(0,2)};$owned=@{};foreach($p in $expected){$owned[$p]=$true};$foreignDrift=@()
 foreach($l in $beforeDirty){$p=$l.Substring(3);if(-not $owned.ContainsKey($p) -and $postMap[$p] -ne $l.Substring(0,2)){$foreignDrift+=$p}}
 $receipt['unrelatedDirtyStatusDrift']=$foreignDrift
 $receipt['remainingDirty']=@{total=$after.Count;tracked=@($after|Where-Object{-not $_.StartsWith('??')}).Count;untracked=@($after|Where-Object{$_.StartsWith('??')}).Count}
 $receipt['source8Same']=$true;$receipt['sourceCandidate']=$base;$receipt['indexEmpty']=$true;$receipt['committedQaPaths']=$changed.Count;$receipt['nativeGuardStatus']='INCOMPLETE timeout; actual terminal counts UNKNOWN';$receipt.status='QA_ONLY_LOCAL_COMMITTED_NO_PUSH';Save
 if($foreignDrift.Count){throw 'Unrelated dirty status drift observed; no recovery mutation attempted'}
 [pscustomobject]@{status=$receipt.status;commit=$commit;qaPaths=$changed.Count;source8Same=$true;sourceCandidate=$base;remainingDirty=$receipt.remainingDirty;indexEmpty=$true;pushes=0}|ConvertTo-Json -Depth 5
}catch{$receipt.status='QA_CHECKPOINT_STOPPED_INDEX_PRESERVED';$receipt.failures+=@{type=$_.Exception.GetType().Name;message=$_.Exception.Message};Save;throw}

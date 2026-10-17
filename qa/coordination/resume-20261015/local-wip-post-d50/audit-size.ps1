$ErrorActionPreference='Stop'
$d='qa/coordination/resume-20261015/local-wip-post-d50'
$m=Get-Content "$d/allowlist.json" -Raw|ConvertFrom-Json
$status=@{}
foreach($line in @(git -c core.quotepath=false status --porcelain=v1 --untracked-files=all 2>$null)){
 if($line.Length -ge 4){$status[$line.Substring(3).Trim('"').Replace('\','/')]=$line.Substring(0,2)}
}
function JsonDigest($value){
 $raw=ConvertTo-Json -InputObject $value -Depth 80 -Compress
 $bytes=[Text.UTF8Encoding]::new($false).GetBytes($raw)
 return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
}
$receipts=@{}
foreach($e in @($m.entries|Where-Object {$_.path -match '/broker/.*-receipt\.json$'})){
 $o=Get-Content $e.path -Raw|ConvertFrom-Json -AsHashtable
 $digest=JsonDigest $o
 $receipts[$digest]=@{path=$e.path;rawSha256=$e.sha256;rawBytes=$e.bytes;availability='RETAINED_IN_LEAN_PROPOSAL'}
}
$projections=@();$omit=@{}
foreach($e in @($m.entries|Where-Object {$_.path -match '/broker/.*\.json$' -and $_.bytes -gt 900000})){
 $o=Get-Content $e.path -Raw|ConvertFrom-Json -AsHashtable
 if(-not $o.Contains('results') -or $o.results.Count -lt 2){continue}
 $refs=@();$allMatched=$true
 foreach($result in $o.results){
  $digest=JsonDigest $result
  if(-not $receipts.ContainsKey($digest)){$allMatched=$false}
  $refs+=@{canonicalJsonSha256=$digest;canonicalAtomicReceipt=$receipts[$digest];label=$result.label;log=$result.log;logSha256=$result.log_sha256}
 }
 if(-not $allMatched){continue}
 $metadata=[ordered]@{}
 foreach($k in $o.Keys){if($k -ne 'results'){$metadata[$k]=$o[$k]}}
 $projection=[ordered]@{schema='raw-aggregate-projection/1';original=@{path=$e.path;sha256=$e.sha256;bytes=$e.bytes;availability='EXTERNAL_LOCAL_RAW_FILE_NOT_IN_LEAN_COMMIT';rawOnDiskUnmodified=$true};transformation='Retain all non-results fields; replace repeated embedded result objects with independently equal canonical-JSON digests of retained atomic raw receipts. Projection is derived, never the original receipt.';metadata=$metadata;resultReferences=$refs}
 $projectionPath="$d/$([IO.Path]::GetFileNameWithoutExtension($e.path)).projection.json"
 $projection|ConvertTo-Json -Depth 80|Set-Content $projectionPath -Encoding utf8
 $projections+=@{path=$projectionPath;owner='local-checkpoint-size-audit';packet="$d/size-audit.json";status='??';mutation='add';beforeD50Blob=$null;beforeD50Proof='Absent from d50; generated derived projection explicitly labeled';sha256=(Get-FileHash $projectionPath).Hash.ToLowerInvariant();bytes=(Get-Item $projectionPath).Length;packetPin=$null;packetPinMatches=$null}
 $omit[$e.path]=@{path=$e.path;sha256=$e.sha256;bytes=$e.bytes;reason='Aggregate duplicates exact atomic receipt objects; every result independently matched to retained receipt by canonical JSON SHA256';availability='EXTERNAL_LOCAL_RAW_FILE_NOT_IN_LEAN_COMMIT';projection=$projectionPath}
}
$duplicateGroups=@($m.entries|Where-Object sha256|Group-Object sha256|Where-Object Count -gt 1|ForEach-Object{@{sha256=$_.Name;count=$_.Count;bytesPerCopy=$_.Group[0].bytes;extraBytes=($_.Count-1)*$_.Group[0].bytes;paths=@($_.Group.path)}})
$remaining=@($m.entries|Where-Object {-not $omit.ContainsKey($_.path)})
$lean=[ordered]@{schema='post-d50-lean-local-wip-proposal/1';state='PROPOSED_ONLY_NO_STAGING';base=$m.head;parentAllowlist="$d/allowlist.json";entries=@($remaining)+@($projections);omittedExternalLocal=@($omit.Values|Sort-Object path);actions=@{staging=0;commit=0;push=0;rawMutation=0};truth=$m.truth;deferred=@($m.deferred)+@{path='scripts/native-capture/server-watched.test.ts';reason='New central join awaiting final freeze; existing server.test.ts remains deferred pending exact lease authority'}}
$lean|ConvertTo-Json -Depth 20|Set-Content "$d/lean-allowlist.proposed.json" -Encoding utf8
$audit=[ordered]@{schema='post-d50-size-audit/1';recordedAt=(Get-Date).ToUniversalTime().ToString('o');originalPaths=$m.entries.Count;originalBytes=(@($m.entries|Measure-Object bytes -Sum).Sum);top10=@($m.entries|Sort-Object bytes -Descending|Select-Object -First 10 path,bytes);duplicateGroups=$duplicateGroups;duplicateExtraCopies=(@($duplicateGroups|ForEach-Object{$_.count-1}|Measure-Object -Sum).Sum);duplicateExtraBytes=(@($duplicateGroups|Measure-Object extraBytes -Sum).Sum);actualMutationCount=@($m.entries|Where-Object{$status.ContainsKey($_.path)}).Count;noLongerDirty=@($m.entries|Where-Object{-not $status.ContainsKey($_.path)}|ForEach-Object path);statuses=@($m.entries|Group-Object status|Select-Object Name,Count);leanPaths=$lean.entries.Count;leanBytes=(@($lean.entries|Measure-Object bytes -Sum).Sum);omittedAggregateCount=$omit.Count;omittedAggregateBytes=(@($omit.Values|Measure-Object bytes -Sum).Sum);projectionCount=$projections.Count;projectionBytes=(@($projections|Measure-Object bytes -Sum).Sum);requiredPreserved='Atomic raw original-failure/reproduction/terminal receipts and logs, source packets/manifests, final compact joined seal/checkpoint and210-case map, original replica FAIL and cycle1 source-only PASS retained. No vendor payload/source-map/private runtime included.';redundancy='Native receipts repeat1890-entry pins_before and pins_after. Aggregate summaries/seals embed those whole receipts again. Lean proposal removes only aggregates whose EVERY embedded result canonical digest matches a retained atomic receipt. Non-results metadata retained in explicitly derived projections. Originals remain untouched locally with raw hash; links from old packets may point to external-local files, never claimed committed.';indexEmpty=(@(git diff --cached --name-only).Count -eq 0);actions=@{staging=0;commit=0;push=0;rawMutation=0;tests=0;provider=0;database=0}}
$audit|ConvertTo-Json -Depth 15|Set-Content "$d/size-audit.json" -Encoding utf8
[pscustomobject]$audit|Select-Object originalPaths,originalBytes,actualMutationCount,leanPaths,leanBytes,omittedAggregateCount,omittedAggregateBytes,projectionBytes,indexEmpty|ConvertTo-Json

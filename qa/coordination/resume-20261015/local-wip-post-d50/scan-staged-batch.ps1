$ErrorActionPreference='Stop'
$d='qa/coordination/resume-20261015/local-wip-post-d50'
$a=Get-Content "$d/commit-allowlist.json" -Raw|ConvertFrom-Json
$map=Get-Content "$d/staged-blob-map.json" -Raw|ConvertFrom-Json -AsHashtable
$line=@(Get-Content qa/coordination/resume-20261015/create-local-milestone.ps1|Where-Object{$_ -match '^\s*\$patterns=@\('});Invoke-Expression $line[0]
$psi=[Diagnostics.ProcessStartInfo]::new();$psi.FileName='git';$psi.ArgumentList.Add('cat-file');$psi.ArgumentList.Add('--batch');$psi.UseShellExecute=$false;$psi.RedirectStandardInput=$true;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true;$psi.CreateNoWindow=$true
$proc=[Diagnostics.Process]::Start($psi);$buffer=[IO.MemoryStream]::new();$copy=$proc.StandardOutput.BaseStream.CopyToAsync($buffer);$errorTask=$proc.StandardError.ReadToEndAsync()
$entries=@($a.entries|Where-Object mutation -ne 'delete')
foreach($e in $entries){$proc.StandardInput.WriteLine($map[$e.path])};$proc.StandardInput.Close();$copy.GetAwaiter().GetResult();$proc.WaitForExit();$errors=$errorTask.GetAwaiter().GetResult();if($proc.ExitCode -ne 0){throw 'Staged batch read failed'}
$raw=$buffer.ToArray();$offset=0;$findings=@();$bytesRead=0
foreach($e in $entries){
 $start=$offset;while($offset -lt $raw.Length -and $raw[$offset] -ne 10){$offset++};$header=[Text.Encoding]::ASCII.GetString($raw,$start,$offset-$start);$offset++
 if($header -notmatch '^([a-f0-9]+) blob (\d+)$' -or $Matches[1] -ne $map[$e.path]){throw 'Staged batch header identity failed'}
 $count=[int]$Matches[2];$text=[Text.Encoding]::UTF8.GetString($raw,$offset,$count);$offset+=$count+1;$bytesRead+=$count
 if($text.Contains([char]0)){$findings+=@{path=$e.path;type='binary-NUL';count=1}}
 foreach($rule in $patterns){$n=[regex]::Matches($text,$rule.r).Count;if($n){$findings+=@{path=$e.path;type=$rule.type;count=$n}}}
}
if($offset -ne $raw.Length){throw 'Staged batch framing failed'}
$result=[ordered]@{schema='actual-staged-content-safety/1';files=$entries.Count;bytes=$bytesRead;findings=$findings;findingCount=[int](@($findings|Measure-Object count -Sum).Sum);valuesPersisted=$false;method='git cat-file --batch actual staged blob map; exact framing/blob identity; existing helper scanner rules';stageMutations=0;commit=0;push=0}
$result|ConvertTo-Json -Depth 8|Set-Content "$d/actual-staged-content-safety.json" -Encoding utf8
$result|ConvertTo-Json -Depth 8

import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const script = fileURLToPath(new URL('./install-supervisor.ps1', import.meta.url));
const source = readFileSync(script, 'utf8');
const fixture = `<?xml version="1.0"?><Task xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><Triggers><LogonTrigger><Enabled>true</Enabled><UserId>S-1-5-21-1-2-3-1001</UserId></LogonTrigger></Triggers><Principals><Principal id="Operator"><UserId>S-1-5-21-1-2-3-1001</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals><Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><ExecutionTimeLimit>PT0S</ExecutionTimeLimit><RestartOnFailure><Interval>PT1M</Interval><Count>3</Count></RestartOnFailure></Settings><Actions Context="Operator"><Exec><Command>C:\\fixture\\node.exe</Command><Arguments>"C:\\fixture\\scripts\\webinar\\run-pipeline.mjs" --run --watch</Arguments><WorkingDirectory>C:\\fixture</WorkingDirectory></Exec></Actions></Task>`;
function run(body, xml = fixture) {
  const code = `. '${script.replaceAll("'", "''")}'
$script:fixture = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(xml).toString('base64')}'))
$script:registered = 0
$script:physical = \${function:Assert-LkbPhysicalPath}
function Assert-LkbPhysicalPath([string]$Path,[bool]$Directory) { return $Path }
function Get-LkbSid { return 'S-1-5-21-1-2-3-1001' }
function Invoke-LkbPreview { return $script:fixture }
function Get-LkbExistingTask { return $null }
function Register-LkbDisabledTask([string]$Name,[string]$Xml,[string]$Sid) {
  if ($Name -cne 'lkb-webinar-portable-supervisor' -or $Sid -cne 'S-1-5-21-1-2-3-1001') { throw 'wrong registration binding' }
  [xml]$task=$Xml
  if ($task.Task.Settings.Enabled -cne 'false' -or $task.Task.Triggers.LogonTrigger.Enabled -cne 'false') { throw 'not disabled BEFORE registration' }
  $script:registered++; return $Xml
}
${body}`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(code, 'utf16le').toString('base64')], {encoding:'utf8', timeout:15000, windowsHide:true});
  assert.equal(result.error, undefined, result.error?.message);
  assert.notEqual(result.status, null, 'PowerShell must terminate normally');
  return result;
}
const win = {skip:process.platform !== 'win32'};
test('preview disables XML and never calls registration', win, () => {
  const r=run(String.raw`Install-LkbSupervisor 'C:\fixture\node.exe' 'C:\fixture' $false
if ($script:registered -ne 0) { throw 'preview mutated' }`);
  assert.equal(r.status,0,r.stderr); assert.match(r.stdout,/PREVIEW \(nothing changed\)/); assert.match(r.stdout,/<Enabled>false<\/Enabled>/);
});
test('explicit install sends disabled task to fixed current-user registration', win,()=>{
  const r=run(String.raw`Install-LkbSupervisor 'C:\fixture\node.exe' 'C:\fixture' $true
if ($script:registered -ne 1) { throw 'registration count' }`);
  assert.equal(r.status,0,r.stderr); assert.match(r.stdout,/INSTALLED DISABLED/);
});
test('existing task refuses replacement',win,()=>{
  const r=run(String.raw`function Get-LkbExistingTask { return 'existing' }
Install-LkbSupervisor 'C:\fixture\node.exe' 'C:\fixture' $true`);
  assert.notEqual(r.status,0); assert.match(r.stderr,/Existing supervisor task refused/);
});
test('invalid XML/bindings/settings refuse before registration',win,()=>{
  const cases=[fixture.replace('C:\\fixture\\node.exe','C:\\foreign\\node.exe'),fixture.replace('PT0S','PT1H'),fixture.replaceAll('S-1-5-21-1-2-3-1001','S-1-5-21-1-2-3-1002'),fixture.replace('--run --watch','--run --other'),fixture.replace('</Actions>','<Exec><Command>evil</Command></Exec></Actions>'),'not xml','<!DOCTYPE Task [<!ENTITY e "x">]>'+fixture];
  for(const xml of cases) {
    const r=run(String.raw`try { Install-LkbSupervisor 'C:\fixture\node.exe' 'C:\fixture' $true; throw 'UNEXPECTED_SUCCESS' } catch { if ($_.Exception.Message -eq 'UNEXPECTED_SUCCESS') { throw }; if ($script:registered -ne 0) { throw 'registered invalid XML' }; Write-Output 'REFUSED' }`,xml);
    assert.equal(r.status,0,r.stderr); assert.match(r.stdout,/REFUSED/);
  }
});
test('generator failure and invalid current user refuse',win,()=>{
  for(const override of [`function Invoke-LkbPreview { throw 'generator failure' }`,`function Get-LkbSid { return 'S-1-5-18' }`]){
    const r=run(String.raw`${override}
Install-LkbSupervisor 'C:\fixture\node.exe' 'C:\fixture' $true`);
    assert.notEqual(r.status,0);
  }
});
test('physical path validator refuses relative, missing and quoted paths',win,()=>{
  const r=run(String.raw`foreach ($path in @('relative', 'C:\definitely-absent-supervisor\node.exe', 'C:\bad"path')) {
try { & $script:physical $path $false; throw 'UNEXPECTED_SUCCESS' } catch { if ($_.Exception.Message -eq 'UNEXPECTED_SUCCESS') { throw }; Write-Output 'REFUSED' }
}`);
  assert.equal(r.status,0,r.stderr); assert.equal((r.stdout.match(/REFUSED/g)||[]).length,3);
});
test('source has bounded generator, create-only registration and no activation',()=>{
  assert.match(source,/DeadlineMs = 15000/); assert.match(source,/ElapsedMilliseconds -ge \$DeadlineMs/); assert.match(source,/RegisterTask\(\$Name, \$Xml, 2,/);
  assert.doesNotMatch(source,/Start-ScheduledTask|Enable-ScheduledTask|\.Run\(|-Password|Get-Credential/);
});
test('parent-exit pending stdout reproduction refuses within remaining deadline',win,()=>{
  const r=run(String.raw`$never = [Threading.Tasks.TaskCompletionSource[int]]::new()
$reader = [pscustomobject]@{}; $reader | Add-Member ScriptMethod ReadAsync ({ param($Buffer,$Offset,$Count) return $never.Task }.GetNewClosure())
$empty = [pscustomobject]@{}; $empty | Add-Member ScriptMethod ReadAsync { param($Buffer,$Offset,$Count) return [Threading.Tasks.Task]::FromResult([int]0) }
$process = [pscustomobject]@{ExitCode=0;StandardOutput=$reader;StandardError=$empty}
$process | Add-Member ScriptMethod WaitForExit { param($Ms) Write-Host 'PARENT_EXIT_REPORTED'; return $true }
try { Read-LkbBoundedStreams $process 100; throw 'UNEXPECTED_SUCCESS' } catch { if ($_.Exception.Message -notmatch 'stream drain timed out') { throw }; Write-Output 'BOUNDED_REFUSAL' }`);
  assert.equal(r.status,0,r.stderr); assert.match(r.stdout,/BOUNDED_REFUSAL/);
});
test('stdout and stderr accumulation both refuse at their streaming cap',win,()=>{
  for(const stream of ['StandardOutput','StandardError']) {
    const r=run(String.raw`$full = [pscustomobject]@{}; $full | Add-Member ScriptMethod ReadAsync { param($Buffer,$Offset,$Count) return [Threading.Tasks.Task]::FromResult([int]1024) }
$empty = [pscustomobject]@{}; $empty | Add-Member ScriptMethod ReadAsync { param($Buffer,$Offset,$Count) return [Threading.Tasks.Task]::FromResult([int]0) }
$process = [pscustomobject]@{ExitCode=0;StandardOutput=$empty;StandardError=$empty}; $process.${stream}=$full
$process | Add-Member ScriptMethod WaitForExit { param($Ms) return $true }
try { Read-LkbBoundedStreams $process 1000; throw 'UNEXPECTED_SUCCESS' } catch { if ($_.Exception.Message -notmatch 'too large') { throw }; Write-Output 'STREAM_CAP_REFUSED' }`);
    assert.equal(r.status,0,r.stderr); assert.match(r.stdout,/STREAM_CAP_REFUSED/);
  }
});
test('cycle0 recorded independent reproduction is replayed verbatim and cannot hang',win,()=>{
  const code=". 'C:\\Users\\product\\Desktop\\KnowledgeBase\\scripts\\webinar\\supervisor\\install-supervisor.ps1'\n$script:never = [Threading.Tasks.TaskCompletionSource[string]]::new()\n$script:reader = [pscustomobject]@{}\n$script:reader | Add-Member ScriptMethod ReadToEndAsync { return $script:never.Task }\n$script:errReader = [pscustomobject]@{}\n$script:errReader | Add-Member ScriptMethod ReadToEndAsync { return [Threading.Tasks.Task]::FromResult([string]'') }\n$script:mock = [pscustomobject]@{StartInfo=$null;ExitCode=0;StandardOutput=$script:reader;StandardError=$script:errReader}\n$script:mock | Add-Member ScriptMethod Start { return $true }\n$script:mock | Add-Member ScriptMethod WaitForExit { param($Ms) Write-Host 'PARENT_EXIT_REPORTED'; return $true }\n$script:mock | Add-Member ScriptMethod Dispose { }\nfunction New-Object { param([string]$TypeName) if ($TypeName -eq 'Diagnostics.Process') { return $script:mock }; Microsoft.PowerShell.Utility\\New-Object -TypeName $TypeName }\nInvoke-LkbPreview 'C:\\fixture\\node.exe' 'C:\\fixture'";
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')],{encoding:'utf8',timeout:5000,windowsHide:true});
  assert.equal(result.error,undefined,result.error?.message);
  assert.notEqual(result.status,null); assert.notEqual(result.status,0,'invalid mocked process must refuse');
});

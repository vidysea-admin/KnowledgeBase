import {test} from '../../apps/web/node_modules/vitest/dist/index.js';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, existsSync, unlinkSync, rmdirSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
test('native private job reaps live owned descendant after parent success', () => {
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
 const temp=mkdtempSync(join(root,'qa/evidence/t051-supervisor-owned-')),pidFile=join(temp,'owned.json'),tag='t051-checker-cycle1-native-job';
 const parentCode="setTimeout(()=>{const c=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:['ignore','inherit','inherit'],detached:true,windowsHide:true});require('node:fs').writeFileSync("+JSON.stringify(pidFile)+",JSON.stringify({pid:c.pid,tag:"+JSON.stringify(tag)+"}));c.unref();process.exit(0)},250)";
 const q=x=>"'"+x.replaceAll("'","''")+"'";
 const code=[
 ". './scripts/webinar/supervisor/install-supervisor.ps1'",
 "$ErrorActionPreference='Stop';$job=New-LkbProcessJob;$process=[Diagnostics.Process]::new();$start=[Diagnostics.ProcessStartInfo]::new()",
 "$start.FileName="+q(process.execPath),
 "$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true",
 "$start.ArgumentList.Add('-e');$start.ArgumentList.Add("+q(parentCode)+");$process.StartInfo=$start",
 "$drainOutcome='completed';$child=$null;$parentPid=$null",
 "try {",
 " if (-not $process.Start()) { throw 'start refused' };$parentPid=$process.Id;$job.Assign($process.Handle)",
 " try { $null=Read-LkbBoundedStreams $process 1000 } catch { if ($_.Exception.Message -notmatch 'stream drain timed out') { throw };$drainOutcome='timedout' }",
 " if (-not $process.HasExited -or $process.ExitCode -ne 0) { throw 'parent success not observed' }",
 " $receipt=Get-Content -LiteralPath "+q(pidFile)+" -Raw | ConvertFrom-Json",
 " if ($receipt.tag -cne '"+tag+"') { throw 'foreign PID receipt' }",
 " $child=[Diagnostics.Process]::GetProcessById($receipt.pid)",
 " if ($child.HasExited -or $child.ProcessName -ne 'node') { throw 'owned descendant not alive before job close' }",
 "} finally { $job.Dispose();if ($process.Id -and -not $process.HasExited) { $null=$process.WaitForExit(2000) };$process.Dispose() }",
 "if (-not $child.WaitForExit(3000)) { throw 'owned descendant survived job close' }",
 "[ordered]@{probe='native-private-job';parentPid=$parentPid;childPid=$child.Id;parentExited0=$true;drainOutcome=$drainOutcome;ownedDescendantExited=$child.HasExited}|ConvertTo-Json -Compress;$child.Dispose()"
 ].join('\n');
 let ownedPid;
 try {
  const start=Date.now(),result=spawnSync('C:\\Program Files\\PowerShell\\7\\pwsh.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')],{cwd:root,encoding:'utf8',timeout:20000,windowsHide:true});
  if(existsSync(pidFile)){const receipt=JSON.parse(readFileSync(pidFile,'utf8'));if(receipt.tag===tag)ownedPid=receipt.pid;}
  assert.equal(result.error,undefined,result.error?.message);assert.equal(result.status,0,result.stderr);
  const receipt=JSON.parse(result.stdout.trim());assert.equal(receipt.parentExited0,true);assert.equal(receipt.ownedDescendantExited,true);
  console.log(JSON.stringify({...receipt,durationMs:Date.now()-start}));
 } finally {
  if(ownedPid){try{process.kill(ownedPid,0);process.kill(ownedPid);}catch(error){if(error.code!=='ESRCH')throw error;}}
  if(existsSync(pidFile))unlinkSync(pidFile);rmdirSync(temp);
 }
},25000);


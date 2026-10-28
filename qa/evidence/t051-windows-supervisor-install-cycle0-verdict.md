# T-051 disabled Windows supervisor installer — independent check

VERDICT: FAIL
Cycle checked: 0

Scope: disabled-installation interface and mocked registration only, C6/I2–I5 of qa/contracts/webinar-portable-release.md; common-launcher C7–C8/I3 of qa/contracts/umesh-calendar-attendance.md. This verdict does not certify Task Scheduler registration, activation, restart, real-webinar processing/index/Ask, connected alerts or Ubuntu.

## Timing and provenance

Candidate checker launch: 2026-10-14 09:22:49 UTC. Scope/hash review began then; review completion timestamp unknown. Exclusive CPU slot requested before launch; allocation awaited until first authorized execution at 09:33:06 UTC. Slot approval exact timestamp unrecorded; no suite ran while waiting. Preparation earlier at 08:34:43 UTC had no candidate.
Commands ended by 09:34:44 UTC. Draft/persist began 09:34:44 UTC; initial persisted completion confirmed 09:35:38 UTC, launch-to-verdict 12m49s. The roughly ten-minute known slot wait explains exceeding the 120–180s target; review/drafting durations and approval-processing intervals are not inferred by subtraction.

Both new files were untracked and fully read. Initial and final SHA256 match packet cycle 0:
- scripts/webinar/supervisor/install-supervisor.ps1: 5C3986B3F1357552A5810C4089D42A9AB81B66B3E3AD5F47194CC23B96144630
- scripts/webinar/supervisor/install-supervisor.test.mjs: B95557A2FB12344055C775F88B549B497A3560DA4BB8DCFF482038B977860A5A

## Independent evidence

1. Exact command: `node --test --test-isolation=none --test-concurrency=1 --test-timeout=15000 scripts/webinar/supervisor/install-supervisor.test.mjs`.
   Approved rerun; exit 0, tool duration 8.410822s, 7/7 pass, 0 skipped. Output: preview/disabled explicit registration/existing collision/XML refusals/generator+identity/physical paths/create-only source checks all green.
2. Independent in-memory probe command: `node --input-type=module -e '<JavaScript below, shell single quotes doubled>'`.
   Approved, tool duration 3.384222s, exit 0. Probe counts: 1 reproduced bound violation; 1 real read-only integration success.
   Exact output:
   `{"probe":"unbounded-drain-after-parent-exit","durationMs":2032,"status":null,"error":"ETIMEDOUT","stdout":"PARENT_EXIT_REPORTED"}`
   `{"probe":"actual-setup-to-disabled-preview-no-scheduler-access","durationMs":883,"status":0,"disabledFlags":2,"commonRunner":true}`
3. Exact final command: `python contracts/verify_contracts.py; Get-FileHash -Algorithm SHA256 -LiteralPath 'scripts/webinar/supervisor/install-supervisor.ps1','scripts/webinar/supervisor/install-supervisor.test.mjs'`.
   Exit 0, combined duration 0.573513s; output `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`; both hashes unchanged. Python-only duration unmeasured.

## Acceptance violation

Invoke-LkbPreview bounds parent WaitForExit to 15 seconds, then synchronously awaits ReadToEndAsync tasks without any remaining deadline. A parent that exits successfully while an inherited output pipe remains open can hang installation indefinitely. The independent probe retains the exact production function and mocks only the native process boundary: Start and WaitForExit succeed, exit code is zero, stderr completes, stdout remains pending. It reaches PARENT_EXIT_REPORTED and requires the external two-second kill. Parent success therefore does not establish the claimed bounded generator.

Output and stderr reads also buffer without a byte ceiling until completion; stdout length is checked afterward and stderr has no ceiling. Timeout calls Kill on the parent without owned-descendant cleanup/reaping. These are concrete gaps in the packet's bounded-subprocess acceptance. Fix the drain deadline/byte bound and add a regression at the actual process-reader boundary before resubmission.

Correct reviewed behavior: physical ancestor reparse refusal; current SID binding; fixed absolute Node/common runner/workdir; one action/principal/trigger; InteractiveToken/LeastPrivilege/IgnoreNew/PT0S/restart3; both disabled flags before mocked registration; existing-name refusal and TASK_CREATE-only race protection. Real existing setup output was consumed by the actual converter in preview, with scheduler inspection/registration functions configured to throw if reached. No Task Scheduler COM, actual installation, activation, credentials, browser, capture, provider or database operation occurred. Downstream run-pipeline.mjs retains live-proof, isolated work-DB, tenant/API ownership and poller-lock gates.

Attributed reuse: maker packet identifies fixtures/cycle and 7/7 result; all relevant unit evidence was independently rerun. No issue-fix corpus is claimed; original-ledger replay is not applicable.
ISSUES-WRITTEN: none (assigned write scope is only this verdict; reproducible finding communicated to maker/root).
EXPLANATION: scoped FAIL for the reproduced bound violation. Actual installation/restart and whole-release gates remain unverified regardless of the passing mocks.

## Exact independent probe JavaScript

```js
import {spawnSync} from 'node:child_process'; import assert from 'node:assert/strict';
const source=". 'C:\\Users\\product\\Desktop\\KnowledgeBase\\scripts\\webinar\\supervisor\\install-supervisor.ps1'\n$script:never = [Threading.Tasks.TaskCompletionSource[string]]::new()\n$script:reader = [pscustomobject]@{}\n$script:reader | Add-Member ScriptMethod ReadToEndAsync { return $script:never.Task }\n$script:errReader = [pscustomobject]@{}\n$script:errReader | Add-Member ScriptMethod ReadToEndAsync { return [Threading.Tasks.Task]::FromResult([string]'') }\n$script:mock = [pscustomobject]@{StartInfo=$null;ExitCode=0;StandardOutput=$script:reader;StandardError=$script:errReader}\n$script:mock | Add-Member ScriptMethod Start { return $true }\n$script:mock | Add-Member ScriptMethod WaitForExit { param($Ms) Write-Host 'PARENT_EXIT_REPORTED'; return $true }\n$script:mock | Add-Member ScriptMethod Dispose { }\nfunction New-Object { param([string]$TypeName) if ($TypeName -eq 'Diagnostics.Process') { return $script:mock }; Microsoft.PowerShell.Utility\\New-Object -TypeName $TypeName }\nInvoke-LkbPreview 'C:\\fixture\\node.exe' 'C:\\fixture'";
const args=['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(source,'utf16le').toString('base64')];
const before=Date.now(); const result=spawnSync('powershell.exe',args,{encoding:'utf8',timeout:2000,windowsHide:true});
assert.equal(result.error?.code,'ETIMEDOUT'); assert.match(result.stdout,/PARENT_EXIT_REPORTED/);
console.log(JSON.stringify({probe:'unbounded-drain-after-parent-exit',durationMs:Date.now()-before,status:result.status,error:result.error.code,stdout:result.stdout.trim()}));
const preview = ". 'C:\\Users\\product\\Desktop\\KnowledgeBase\\scripts\\webinar\\supervisor\\install-supervisor.ps1'\nfunction Get-LkbExistingTask { throw 'unexpected scheduler read' }\nfunction Register-LkbDisabledTask { throw 'unexpected scheduler write' }\nInstall-LkbSupervisor '"+process.execPath.replaceAll("'","''")+"' 'C:\\Users\\product\\Desktop\\KnowledgeBase' $false";
const t=Date.now();const good=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(preview,'utf16le').toString('base64')],{encoding:'utf8',timeout:20000,windowsHide:true});
assert.equal(good.error,undefined);assert.equal(good.status,0,good.stderr);assert.match(good.stdout,/PREVIEW \(nothing changed\)/);assert.equal((good.stdout.match(/<Enabled>false<\/Enabled>/g)||[]).length,2);assert.match(good.stdout,/--run --watch/);
console.log(JSON.stringify({probe:'actual-setup-to-disabled-preview-no-scheduler-access',durationMs:Date.now()-t,status:good.status,disabledFlags:2,commonRunner:true}));
```


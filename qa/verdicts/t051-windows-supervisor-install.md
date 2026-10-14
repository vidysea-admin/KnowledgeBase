# T-051 disabled supervisor interface — cycle 1

VERDICT: PASS
Cycle checked: 1
Scope: disabled-installation interface/mocked registration; webinar-portable-release C6/I2–I5 and common-launcher umesh-calendar-attendance C7–C8/I3. Actual Task Scheduler installation, activation/restart, unattended capture, real-webinar processing/index/Ask, alerts and Ubuntu remain NOT VERIFIED.

Timing: candidate review began2026-10-14 09:46:50UTC, initially stale cycle0 packet. Cycle1 packet subsequently finalized. Review-end timestamp unknown. Optional exact-owned-process query hit Access denied; escalation waited2468.6s then user aborted. No cycle1 test process ran during this wait. Resumed scope/pin check10:29:06; required commands ended10:35:46. Draft/persist began10:35:46; confirmation below. Target exceeded primarily by measured approval interruption; other intervals unknown.

Initial/final hashes match cycle1:
- installer2FD5C7F6CCFD91D263C290D3DB89BF38FF83B037DF1D6935BE06E56B6E978EE3
- tests4BFFC4E521C294645407244B076A0D3E747D40C7268015B86A9E7BDFF0BB5261

Independent commands:
1. Root cwd: `node --test --test-isolation=none --test-concurrency=1 --test-timeout=15000 scripts/webinar/supervisor/install-supervisor.test.mjs`. Exit0,10/10,0skips,TAP17.076475s; execution/poll durations10.002289s/4.173795s; handle91073 completed.
2. Root cwd,pwsh7: `. './scripts/webinar/supervisor/install-supervisor.ps1'; function Get-LkbExistingTask { throw 'Unexpected scheduler read' }; function Register-LkbDisabledTask { throw 'Unexpected scheduler write' }; Install-LkbSupervisor (Get-Command node.exe).Source (Get-Location).Path $false`. Exit0,2.345743s. Actual setup XML/current user/fixed common runner consumed, both disabled flags; scheduler functions never reached.
3. apps/web cwd: `node node_modules/vitest/vitest.mjs run --config C:/Users/product/Desktop/KnowledgeBase/qa/evidence/t051-supervisor-native-job.config.mjs C:/Users/product/Desktop/KnowledgeBase/qa/evidence/t051-supervisor-native-job.test.mjs --pool=threads --maxWorkers=1 --minWorkers=1`. Final exit0,1/1,4.993693s tool/3.72s Vitest/3180ms native probe. Receipt: `{"probe":"native-private-job","parentPid":14404,"childPid":16352,"parentExited0":true,"drainOutcome":"timedout","ownedDescendantExited":true,"durationMs":3180}`. Parent exited0; detached owned child remained alive retaining pipes; actual reader refused deadline; private Job close terminated child. Tagged-PID cleanup only; owned temporary-directory count0.
4. `python contracts/verify_contracts.py`, with archive/hash commands combined1.251311s,exit0,PASS by vacuity; Python-only duration unknown. Final source/fixture hash and temp-count command0.672817s,exit0.

ISS-380 corpus: original source body replayed unchanged1/1 refuses without hang. Old mock exposes ReadToEndAsync only; repaired interface refuses that incomplete native boundary, which alone does not prove closure. Additional actual ReadAsync pending task preserves stalled-drain boundary and passes1/1; stdout/stderr pre-append caps2/2; actual native retained-pipe descendant probe establishes cleanup. No original case omitted.

Reviewed15s shared process/drain deadline,64Ki-character ceiling on each stream, completed-task checks, private KILL_ON_JOB_CLOSE finally disposal, creation-only collision protection, exact SID/InteractiveToken/LeastPrivilege/single action/trigger/principal, and disabled-before-registration. Existing downstream live-proof/work-DB/tenant/API/poller-lock gates unchanged.

Checker fixture iterations: wrong root Vitest path MODULE_NOT_FOUND0.886068s; fixture cwd ENOENT8.964953s; two non-detached child expectations failed5.370767s/5.471521s because Node's own teardown preceded private Job close. Final detached fixture exercises intended boundary. Product bytes unchanged; all fixture children terminated. Earlier timeout mock spawned only direct PowerShell, no real descendants; optional process query unavailable/dropped.

Attributed maker10/10/native-preview evidence independently rerun. ISSUES-WRITTEN: none; canonical ISS-380 filed by authorized writer, now independently verified.
Cycle0 archival QA copy: qa/evidence/t051-windows-supervisor-install-cycle0-verdict.md, SHA492A162E12E7A6FF21EC9286ECB501B387CB15496B489A629EE24557AC953F89.
Native fixture SHA38C33A3FAFE326D708C472EFD237BFFDA2E0C25FB29BC721BA7F4A8CB425FB31; config SHA456334E4D0AA642C32705144D81B2F59066EA33599A041FC498FD5C723769DBA.
EXPLANATION: scoped PASS only. No actual task COM/install, runtime credentials, capture, provider/database operation or product-source mutation.
Persist confirmed 2026-10-14 10:37:17 UTC; launch-to-verdict 50m27s, including the aborted 2468.6s approval wait. Test slot released before drafting.

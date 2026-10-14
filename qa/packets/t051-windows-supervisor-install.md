# Checker packet: t051-windows-supervisor-install, cycle 1

Root: C:/Users/product/Desktop/KnowledgeBase. Read skills/checker/SKILL.md. Maker owns only two new script files and manifest/packet. Checker owns qa/verdicts/t051-windows-supervisor-install.md; do not edit maker source or contracts.

Candidate base: no tracked originals. Final cycle1 SHA256 installer 2FD5C7F6CCFD91D263C290D3DB89BF38FF83B037DF1D6935BE06E56B6E978EE3; tests 4BFFC4E521C294645407244B076A0D3E747D40C7268015B86A9E7BDFF0BB5261. Recheck final hashes before verdict.

Interface: powershell -NoProfile -File scripts/webinar/supervisor/install-supervisor.ps1 -NodePath <absolute node.exe> -ProjectRoot <physical repo> [-Install]. Default preview; -Install is disabled task registration, NOT activation. Actual -Install is forbidden during this check; only mocked registration is authorized.

Call map: Install-LkbSupervisor validates physical paths including ancestor reparse points, verifies current user SID, invokes existing setup.mjs --service-preview with bounded native process, then ConvertTo-LkbDisabledTask validates XML identity/action/root/settings and disables settings+logon trigger. Register-LkbDisabledTask uses Schedule.Service root folder RegisterTask flag 2 (TASK_CREATE), current SID, interactive token 3; no replacement flag. Existing task inspection precedes creation; create-only protects subsequent collision. Returned task XML is checked for disabled flags and bindings.

Read-only dependencies: scripts/webinar/setup.mjs renderServicePreview; scripts/webinar/run-pipeline.mjs immediate deployed consumer target. No helper tests establish actual Task Scheduler install/restart; code PASS must be bounded to interface plus mocked registration. Existing C6 executable prerequisites and C7 downstream live path are separate.

Focused command: node --test --test-isolation=none --test-concurrency=1 --test-timeout=15000 scripts/webinar/supervisor/install-supervisor.test.mjs. Maker approved execution exit0, 7/7, 8.61s. Tests dot-source installer into bounded noninteractive PowerShell, override physical paths/account/generator/task functions, consume controlled XML, and never contact Task Scheduler. Seven tests cover preview, disabled explicit registration, collision, seven XML refusal subcases, generator/user refusal, real physical-path refusal and bounded/create-only/no-activation source assertions. First sandbox execution failed to spawn PowerShell (null status), then approved exact-command rerun passed. Use the saved command approval for subprocess execution rather than repeat predictable failure. Child-spawn errors/null status now explicitly fail every probe.

Required validator: python contracts/verify_contracts.py maker exit0, 0.48s (currently no frozen contracts; vacuity does not certify installer). No mutation tests required; if checker chooses mutation, obey timeout/byte-backup/restoration trap/cmp rule. Structural move to supervisor/ occurred before first ready candidate; sibling URL and explicit project-root producer/consumer paths remain valid. Integrator must add nested test discovery to centralized script.

No ledger issue is claimed fixed; union issue ledger remains canonical. Activation/restart/live credentials/Ubuntu proof remain HOLD. No git commit requested.

## Cycle 1 repair and evidence

Cycle0 independent FAIL is acknowledged unchanged: output tasks could hang after parent exit, accumulation was unbounded, Kill targeted only parent. New Read-LkbBoundedStreams uses concurrent asynchronous 1024-character reads, checks completion before result, shared15s drain/process deadline and each-stream65536-character pre-append bound. New lazy P/Invoke Windows Job helper uses KILL_ON_JOB_CLOSE and closes private job in finally even after parent exit; assignment errors refuse and stop unassigned generator. Native helper compiled/executed in actual read-only preview, not in test registration mocks.

Approved exact suite above now exit0 10/10,13.41s. Cycle0 exact original reproduction is permanently embedded unchanged in the final test and replayed1/1; it now refuses the incomplete mocked process without hanging. Direct pending-read task probe reaches new reader and times out safely1/1; repeated chunks test both stdout/stderr limits2/2. Existing7 checks retained. Independent checker should inspect/measure cleanup claims without Task Scheduler registration.

Actual read-only integration command: `. './scripts/webinar/supervisor/install-supervisor.ps1'; function Get-LkbExistingTask { throw 'Unexpected scheduler read' }; function Register-LkbDisabledTask { throw 'Unexpected scheduler write' }; Install-LkbSupervisor (Get-Command node.exe).Source (Get-Location).Path $false`. Approved exit0,3.77s; two disabled flags, absolute current common runner/node/root, no scheduler calls. Approval wait is separate from execution duration. Saved exact command prefix exists. Keep old cycle0 evidence as historical; current candidate is cycle1.

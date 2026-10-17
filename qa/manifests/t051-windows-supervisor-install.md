# T-051 disabled Windows supervisor installation interface

Status: checked-PASS
**Handshake status:** checked-PASS
Fix cycle: 1

Authority: root execution GO for new supervisor installer and focused mocked tests; user requested fastest parallel closure. Priority tier 3, T-051. No existing setup/runner/watch source changes; no actual task registration, capture, service start, credentials or proof-marker writes.

Contract: qa/contracts/webinar-portable-release.md C6, I2-I5; qa/contracts/umesh-calendar-attendance.md C7-C8/I3 insofar as common Windows launcher safety. Scoped build acceptance: preview has no registration; explicit install requests one disabled current-user task; fixed absolute existing runner/action, exact owner/settings, creation-only collision refusal; activation/live recovery remain HOLD. This is not whole-task acceptance.

Changed paths: scripts/webinar/supervisor/install-supervisor.ps1; scripts/webinar/supervisor/install-supervisor.test.mjs (both new, no base). Packet: qa/packets/t051-windows-supervisor-install.md.

Security flags: system data write through explicit -Install, current-user identity and fixed task ownership; no auth API, tenant read/write or credentials. Independent checker required. No actual installation authorized in this unit.

Evidence: node --test --test-isolation=none --test-concurrency=1 --test-timeout=15000 scripts/webinar/supervisor/install-supervisor.test.mjs: exit0, 7/7, 8.61s; PowerShell registration functions mocked, no actual Task Scheduler access. Initial sandbox child-spawn failure produced null statuses, not product acceptance; required approved rerun completed. Test harness now explicitly refuses child-spawn errors/null termination. python contracts/verify_contracts.py: exit0, 0.48s, PASS by vacuity (no frozen contracts). No live task install/start/restart evidence exists. Historical Windows synthetic 60-minute evidence is reused only as unrelated capture prerequisite, not live supervision acceptance.

Cycle 0 independent FAIL: unbounded ReadToEndAsync drain after parent exit, late output bound and parent-only kill. Cycle 1 replaces reads with bounded concurrent 1024-character ReadAsync chunks, 15-second shared drain/parent deadline and 65536-character ceiling on each stream. A private Windows Job with KILL_ON_JOB_CLOSE closes in finally, including inherited descendants retaining pipes. Assignment failure refuses and stops the unassigned generator. Actual descendant-failure behavior awaits independent checker; do not infer it from preview alone.

Cycle 1 evidence: exact approved test command above exit0, 10/10, 13.41s. Exact cycle0 recorded reproduction embedded unchanged and replayed 1/1 refusal without hang; direct pending-output deadline probe 1/1 and streaming stdout/stderr cap probes 2/2. Native actual setup-to-disabled preview with scheduler read/write functions replaced by throws exits0, 3.77s, consumes existing setup output and retains two disabled flags. No actual task access/install. Validator unchanged; use recorded prior vacuity evidence.

Frozen cycle 1 SHA256: installer 2FD5C7F6CCFD91D263C290D3DB89BF38FF83B037DF1D6935BE06E56B6E978EE3; tests 4BFFC4E521C294645407244B076A0D3E747D40C7268015B86A9E7BDFF0BB5261. Source remains beneath supervisor/ to respect directory structural limit.

Whole release remains NOT VERIFIED; actual Windows real-webinar processing/index/Ask, supervisor restart, connected alerts and independent Ubuntu acceptance remain separate.

Close-out: independent checker cycle 1 VERDICT PASS (qa/verdicts/t051-windows-supervisor-install.md, Cycle checked: 1). ISS-380 verified/closed. Scoped acceptance only; activation, live install and recovery remain HOLD.

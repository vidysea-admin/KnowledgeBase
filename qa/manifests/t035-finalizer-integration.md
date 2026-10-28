# T-035 shared finalizer integration (original duration, private EOF, OBS restore)

**Handshake status:** checked-PASS
**Status:** checked-PASS
**Fix cycle:** 1
**Task:** T-035 (with T-034/T-011 shared finalizer). Scoped integration unit; parent T-035 is not claimed.
**Contracts:** qa/contracts/goal-t035.md C4 (OBS restore after stop, launch failure and recovery), C5/C8 (derivative/private intervals before providers); qa/contracts/goal-t034.md C4-C7.
**Base:** a9fac545. Candidate: the single lane commit on lane/w16-t034cap. Environment: node v24.19.0 (codex bundled runtime), cwd packages/meeting-bot, lane /c/Users/product/Desktop/KnowledgeBase-lanes/w16-t034cap (branch lane/w16-t034cap, base a9fac545), node_modules junctioned to the main tree. Machine heavily loaded (~18 lanes). Test-only fixes in this cycle; no production source changed.

## Finding: the integration is already present at base; this unit adds no production change
- Original duration and private EOF: capture/record-finalize.ts binds the original (workspace/original-capture.ts), probes the ORIGINAL clock for private captures, refuses unknown duration, rechecks original hash and consent receipt. runRecord and runFinalize (record-commands.ts) normalize remux-only and forward the explicit lean flag plus retained original path; workspace/finalize-workspace-recording.ts forwards both.
- OBS restore: runFinalize --stop-obs calls restoreLeanVideoInObs after StopRecord (record-commands.ts), alerting via notifyObsRestoreFailed; obs-windows stop()/launch failure restore. Implementation lives in packages/meeting-bot/src/lean-video-obs.ts, which is OUTSIDE this lane's capture/** scope and was not edited.

## Evidence (actual)
- `node --test --import tsx src/lean-video-obs.test.ts`: 25 pass / 0 fail (fake OBS client; includes runRecord OBS branch end to end and runFinalize --stop-obs restore).
- Unit t034-original-private-eof tests (5 pass, real FFmpeg on retained corpus) and record-commands.test.ts (20 pass) cover the finalizer side.

## Resolved in cycle 1 (was: open item requiring a path outside this lane)
packages/meeting-bot/src/lean-finalize-alert.test.ts: 5 of 6 cases fail at base for the same legacy reason (no explicit tenant, no consent receipt, media outside raw/webinars). A working fix was prototyped (same seeding as record-commands.test.ts, 5/6 then 1 remaining: the "notifier without notifyOverTarget" case at line ~70 builds its own root and needs the same seeding) and REVERTED because the path is outside packages/meeting-bot/src/capture/**. Needs a lane with src/ root leased.
Not verified: 60-minute live size, real OBS, provider, contracts/verify_contracts.py.

## Fix cycle 1 (checker HOLD on lean-finalize-alert.test.ts)
src/lean-finalize-alert.test.ts (authorized by coordinator, same lane): root(sessionId) now places media in raw/webinars and seeds a consent receipt for tenant "lane"; both finalize calls pass tenantId "lane"; the notifyOverTarget-less case seeds sess-old. No assertion changed. `node --test --import tsx src/lean-finalize-alert.test.ts`: 6 pass / 0 fail (was 1 pass / 5 fail).
Pins (SHA256, packages/meeting-bot/src/): lean-finalize-alert.test.ts cef0acffa8fb30855629376f2ea6198649c2cc9ac0ffb87e1541a7e3a60daff9; lean-video-obs.ts 02c18b7ae5e13deffac856ddfe0aed22a326a5d63d0d0bc07db8da0dc2f51c01; capture/record-finalize.ts 8ac3798f063c0bb9a06405d10cb274b33dd169cda9d59bf99b610e31e531e927; capture/record-commands.ts 531bda060e6b723cc6adbe14abef900dbc390e33c3cda3e4a0b33b55c0dc76e0; capture/workspace/finalize-workspace-recording.ts 2fe637efd733edb617cf2c9778283f2e67b9c441008d128ae6c6a55d51514e79

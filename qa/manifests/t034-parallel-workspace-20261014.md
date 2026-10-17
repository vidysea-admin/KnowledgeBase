# T-034 parallel capture workspaces

**Handshake status:** in_progress
**Status:** in_progress
**Fix cycle:** 0
**Priority tier:** 3 — next unblocked roadmap task, explicit D-170 task allocation.
**Task:** T-034. This is a scoped implementation unit; full parent completion is not claimed.
**Authority:** D-170 and ROOT's exclusive source lease. Maker: docker_ci_trigger_review; independent checker: docker_dependency_review/checker_t034.
**Packet:** qa/packets/t034-parallel-workspace-20261014.md
**Contract:** qa/contracts/goal-t034.md, SHA256 A819BCCD04B70BD96E4BED9F1FD0BD0C568E62FA1307A1EB8EAA435E69761D4D.

## Built scope

Explicit `--capture-slot` isolates tenant-bound browser profile, recording output, receiver credentials and controller state across separately prepared slot profiles. Login, record and finalize resolve identical slot paths; selection refuses unsafe identifiers, redirects, file ancestors, occupied slots and OBS slot use. Login claims the existing capture lock atomically and releases only its own unchanged lock after child exit/error. No signed-in profiles or credentials are copied.

Generated slot session IDs include tenant/slot identity and a per-invocation nonce, preserving immutable receipt identities on later captures. All capture invocations reserve the global downstream session key before capture and keep ownership through finalization/processing; explicit duplicate IDs across tenants/slots and Windows path aliases refuse. Verified recovery uses a separate latch and can reclaim only the exact dead owner; live/unknown/foreign owners remain refused. Static checker findings about partial login writes/setup cleanup and shared default downstream identities were addressed before submission.

The recorder emits producer `mediaStartedAt` epoch milliseconds at `MediaRecorder.start`, separate from the receiver's receipt `t`. Slot readiness records explicit `assumed:false` admission plus producer start, tagged browser or fixture, using the same generation as the durable consent receipt. Actual acceptance independently requires exact durable generation/media origin; unknown/historical/declined origin and assumed admission cannot qualify. Per-platform receipts support explicitly observed capabilities; profile presence, fixture flow and unaccepted evidence do not qualify. No actual readiness receipt or signed-in identity is claimed.

The sole command-file writer also applied the independently owned T-011 consent/privacy hooks and T-035 opt-in lean normalization hooks. Their source/semantic/privacy/media evidence belongs to their owners; integration bytes are part of this candidate.

The finalizer wrapper passes the actual slot receipt directory and returns the verified public video to downstream processing. Production never substitutes raw media for a missing public result; void results are supported only by the explicit fixture injection.

Authenticated operator review is implemented in the new capture-readiness API/host bridge and review UI. HostingService's current `roles:manage` transaction plus hosting/send-now scopes supplies tenant/key authority; an AsyncLocalStorage context rejects direct host mutation calls. A private physical OS-ACL-checked registry stores a signed immutable reviewed browser sample, accepted actor/time and current capability pointer. Later genuine observations reuse the same host/tenant/slot/platform capability without new stamps. A capture failure or explicit audited revocation invalidates it; review requires a fresh observation strictly after the last failure. Fixtures, hashes, directories and environment booleans never qualify. No actual host approval was issued.

## Current evidence

Focused tests authored but NOT RUN: source frozen for sole broker docker_checker after the T-011 shared generation/privacy freeze. Planned 67 Node checks plus four UI checks, including one retained recorder TODO; actual runner counts will be authoritative. Authority issuance tests use synthetic temporary workspaces and mocked Windows ACL subprocesses; no actual host approval or ACL proof is claimed. Complete 24-file source snapshot, tracked patch, 24 owned and 18 dependency SHA256 pins are in qa/packets/t034-parallel-workspace-20261014/, source-pins.json SHA256 83D8BEF52C08D0FB23AE6F0E95A463477F9FE002AA773AE6ACE72DA7FD73935A. No browser, actual meeting, OBS, ffmpeg, provider, database or full suite launched by this maker. Parent criteria 2, 3 and 6 remain NOT VERIFIED; full T-034 remains in progress.

Central web compiler receipt qa/goal-2026-10-14/web-types-current-freeze.json exited 2: five owned readiness fallback-state type errors. Maker corrected only `const current:View` to retain optional error/outcome typing while preserving auth-session masking. Corrected UI SHA256 30530D429A80C7BBC8A0F83073A66B207435A300FDEE4AB7C447DF7438A61FD1; compiler rerun pending sole broker. T-011's actual API-compiler parser-index narrowing was repinned; no semantic/generation change claimed.

## Changed files

- packages/meeting-bot/src/capture/workspace/tab-session-workspace.ts (new)
- packages/meeting-bot/src/capture/workspace/tab-session-workspace.test.ts (new)
- packages/meeting-bot/src/capture/workspace/capture-slot-readiness.ts (new)
- packages/meeting-bot/src/capture/workspace/capture-slot-readiness.test.ts (new)
- packages/meeting-bot/src/capture/workspace/capture-slot-acceptance.ts and .test.ts (new)
- packages/meeting-bot/src/capture/workspace/capture-authority-acl.ts and .ps1 (new)
- packages/meeting-bot/src/capture/workspace/finalize-workspace-recording.ts and .test.ts (new)
- packages/meeting-bot/src/capture/workspace/caller-failure-readiness.test.ts (new)
- packages/meeting-bot/src/capture/workspace/record-stop-regression.test.ts (existing four stop regressions extracted, with controlled environment/sender/encoder)
- packages/meeting-bot/src/capture/record-commands.ts
- packages/meeting-bot/src/capture/record-commands.test.ts
- packages/meeting-bot/py/tab-capture/recorder.js
- packages/meeting-bot/py/tab-capture/recorder.test.mjs (start payload assertion only)
- packages/meeting-bot/py/tab-capture/recorder-origin.test.mjs (new)
- apps/api/src/capture-readiness/{types,router,host-connector,router.test}.ts (new)
- apps/web/src/pages/meeting-bot/readiness/{api.ts,CaptureReadinessControls.tsx,CaptureReadinessControls.test.tsx} (new)
- This manifest and its packet.

## Remaining gates

- Focused affected-stage/caller/immediate-consumer evidence, unchanged candidate hashes and independent matching-cycle verdict.
- Real 60-minute Zoho/YouTube capture with no OBS, two simultaneous real tabs and independent media sampling.
- Actual immediate downstream media/provider/staging consumption and usable real OBS fallback proof.
- Umesh's approved meeting link under D-146; host/browser availability outside hei-sweep restrictions.
- First authorized controlled host capture, actual private Windows ACL setup/proof, human API review and real scheduler acceptance; agents have not issued or called approval endpoints.

No contracts, decisions, trackers, governance, dependencies or other owners' source files changed by this maker.

## 2026-10-15 read-only revalidation

All 24 owned live files and all 24 saved snapshots still match source-pins.json 83D8BEF52C08D0FB23AE6F0E95A463477F9FE002AA773AE6ACE72DA7FD73935A. Two shared dependency pins are stale: record-finalize.ts is now 2A65DFC82940EC5EE461E089C1852158AC0DBAE3AB46E5ED070A196A281237B8; lean-video-ffmpeg.ts is now 79B11336471E503B3E028AE4D865759C569A73B3782CD78858F39561E089CABC. Repinning awaits shared-owner freeze/review.

Independent checker identified a static security composition gap: original media duration 12.0 with a private suffix 9..12 can normalize to an allowed 12.202667 derivative before finalization. Probing only that derivative loses the original private-EOF identity, so coverage/masking can treat its tail as public. No actual encoded leak or new runtime reproduction is claimed. Coordinated live/recovery original-duration/EOF provenance and a meaningful paired boundary regression are required before READY. ROOT, runtime, T011 and the new sole CPU broker docker_governance_review were notified. U24 source/test freeze remains active; no maker source edits, tests, browser, provider, Git or approval actions occurred. Existing 67 Node + 4 UI request remains held; no fresh execution receipt exists.

## Wave-2026-10-16 lane w16-t034cap — in-scope completion (cycle 0 re-submission)

**Handshake status:** ready-for-check for the packages/meeting-bot/src/capture/** portion ONLY. Base a9fac545; candidate = the single lane commit on lane/w16-t034cap. Environment: node v24.19.0 (codex bundled runtime), cwd packages/meeting-bot, lane /c/Users/product/Desktop/KnowledgeBase-lanes/w16-t034cap (branch lane/w16-t034cap, base a9fac545), node_modules junctioned to the main tree. Machine heavily loaded (~18 lanes). Test-only fixes in this cycle; no production source changed.
Scope note: the lane may change only packages/meeting-bot/src/capture/**. The capture-slot source (workspace/tab-session-workspace.ts, capture-slot-readiness.ts, capture-slot-acceptance.ts, capture-authority-acl.*, record-commands.ts --capture-slot) was already complete in the checkpoint; this cycle only ran it. NOT touched and NOT run: apps/api/src/capture-readiness/**, apps/web/.../readiness/** (web test is vitest), packages/meeting-bot/py/tab-capture/recorder*.js and tests. The Status line above is left as written; the checker must treat those three paths as unverified by this lane.

Evidence (actual, sequential): `node --test --import tsx` on workspace/tab-session-workspace.test.ts, capture-slot-readiness.test.ts, capture-slot-acceptance.test.ts, finalize-workspace-recording.test.ts, caller-failure-readiness.test.ts: 20 pass / 0 fail (fake extension child over loopback, mocked spawn/ACL subprocess; no Chrome/OBS/FFmpeg). record-commands.test.ts: 20/20 after the test fixes recorded in qa/manifests/t034-original-private-eof.md (cycle 1). Original-duration/private-EOF static gap noted in the 2026-10-15 revalidation is addressed by unit t034-original-private-eof. Parent criteria 2, 3, 6 remain NOT VERIFIED.

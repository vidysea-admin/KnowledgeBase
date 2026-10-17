# Verdict: t035-finalizer-integration (cycle 0, new manifest)

VERDICT: PASS (cycle 1, see appended section; cycle 0 was HOLD)
Cycle checked: 1
Reviewed SHA: 70236c0ff17c1c71ea86d4d36fb345e100dbd6a1 (cycle 0 reviewed ddfd942e1a4299c3de47911deedd551569c6e134)
Base: a9fac545 (no production change in the candidate; verified by `git diff a9fac545 ddfd942e`).
Checker: independent, fresh context, 2026-10-16.

## What is verified
- "Already present at base" claim VERIFIED for the finalizer side. record-finalize.ts binds the original and uses the original clock for private captures (lines 171-181). It refuses unknown duration, rechecks the original hash and consent receipt (lines 190-191), and prepareRecordFinalizerInput receives the original-derived duration and the `lean` flag. record-commands.ts line 285 calls `restoreLeanVideoInObs` after StopRecord with `notifyObsRestoreFailed`, and runRecord/runFinalize forward `lean` and the original path.
- Independent runs: lean-video-obs.test.ts 25/25 (exit 0, 76 s); finalize-original-eof.test.mjs 5/5 with real FFmpeg on the SHA-verified corpus; record-commands.test.ts 20/20. The record-finalize.ts private-original mutation was killed by 3 of 5 EOF cases (see qa/verdicts/t034-original-private-eof.md). Mutation restored and HEAD-hash verified.

## Blocking finding (HOLD reason)
The immediate T-035 consumer test for the over-target alert, packages/meeting-bot/src/lean-finalize-alert.test.ts, is RED at the candidate: independently run gives 6 tests, 1 pass, 5 fail, exit 1. All errors are "Explicit capture tenant required" (legacy test without tenant, consent receipt or in-slot media). This is a stale test, not a production bug: production correctly refuses. The maker disclosed it and reverted its prototype because the path is outside capture/**.
This test is the contract coverage for goal-t035 C5 ("over-target outcomes remain visible", notifier wiring), which is an immediate consumer of the finalizer this unit claims to integrate. A PASS with that consumer failing would be a claim without evidence.
Concrete fix, outside this lane's leased path: in src/lean-finalize-alert.test.ts apply the same seeding as record-commands.test.ts lines 149-160 (tenantId "lane", `writeRecordConsent(createRecordConsent(...))` for the session, fixture media under raw/webinars). Also seed the "notifier without notifyOverTarget" case (about line 70), which builds its own root. Then re-run: expect 6/6.

## Not verified
60-minute live size (C2), real OBS restoration (C4 host proof), real provider (C8), contracts/verify_contracts.py passes only by vacuity (exit 0). Parent T-035 is not claimed and not passed.

## Re-check path
Resubmit as cycle 1 with lean-finalize-alert.test.ts fixed under a lane that leases packages/meeting-bot/src/. Expect the checker to re-run lean-finalize-alert.test.ts plus lean-video-obs.test.ts only. The existing EOF mutation evidence stands for this base.
ISSUES-WRITTEN: none (the failing consumer test is the unit's own disclosed open item).

---

# Cycle 1 re-check (appended; supersedes the cycle 0 HOLD above)

VERDICT: PASS
Cycle checked: 1
Reviewed SHA: 70236c0ff17c1c71ea86d4d36fb345e100dbd6a1
Checker: independent, 2026-10-16. Scoped integration unit only; parent T-035 not passed.

- Diff f4d15424..70236c0f touches lean-finalize-alert.test.ts and the manifest only. The test change is seeding only: media moved to raw/webinars, a tenant "lane" consent receipt per session (sess-lean, sess-old), and `tenantId: "lane"` on both finalize calls. No assert line is added, removed or weakened. Production source is unchanged.
- lean-finalize-alert.test.ts: 6/6 pass, exit 0 (was 1/6 at f4d15424).
- Mutation: replaced `mbPerHour !== undefined && !isWithinLeanTarget(mbPerHour)` with `false` in record-finalize.ts (applied, per-mutation backup, timeout 600, trap, restore). Result 4 pass / 2 FAIL (the 2.7 GB/h alert case and the exactly-400 MB/h boundary case), exit 1. Restored: cmp OK, git hash-object equals HEAD blob (7ae96e92...).
- Pins in the refreshed manifest match live bytes: lean-finalize-alert.test.ts cef0acff..., lean-video-obs.ts 02c18b7a..., record-finalize.ts 8ac3798f..., record-commands.ts 531bda06..., finalize-workspace-recording.ts 2fe637ef... (all 5 verified).
- Cycle 0 evidence stands: lean-video-obs 25/25 and EOF suite 5/5 on the same production bytes.
- Not verified: 60-minute live size, real OBS, provider. verify_contracts.py passes only by vacuity.
ISSUES-WRITTEN: none.

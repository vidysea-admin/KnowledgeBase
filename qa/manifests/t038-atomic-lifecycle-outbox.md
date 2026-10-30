# t038-atomic-lifecycle-outbox

**Task:** T-038 scoped canonical producer repair; full parent remains HOLD
**Priority tier:** 3 — root-authorized feature integration
**Status:** checked-PASS — closed out 2026-10-26 by maker resume, citing qa/verdicts/t038-atomic-lifecycle-outbox.md
**Handshake status:** checked-PASS — closed out 2026-10-26 by maker resume, citing qa/verdicts/t038-atomic-lifecycle-outbox.md
**Fix cycle:** 1
**Maker:** /root/docker_context_review
**Checker:** /root/docker_dependency_review/checker_t038
**Contract:** qa/contracts/t038-atomic-lifecycle-outbox.md (checker-owned, SHA256 98562B1EDE466AD4932B41DDD6D633C1ACE8003956F452194C23800DE4F8C168)

## Authorization and scope

Root/runtime granted exactly three source/test files for atomic transition plus alert outbox persistence, separate from U24. Writer finished before the global input freeze. No shared schema, configuration, source expansion, Git mutation or external action occurred. Round-cap review found zero prior PASSes on this canonical producer/outbox; the one prior t038-durable-alert-retries PASS covers the separate sink and expressly excludes the producer.

Auth/tenancy/data writes: YES. Existing owned lane checks, exact tenant filtering, bounded finite snapshots, staging and channel limits remain.

## Change and evidence

Previously the artifact/terminal/discovery state was durable before the corresponding notification snapshot. A crash between saves could lose a transient event. The producer now stages the sanitized snapshot in the same state image, saves once, then enqueues. Discovery acquisition stages both feeds before its single save. The runner narrows its artifact-path catch so persistence errors propagate.

The unchanged original regression holds 51 started events, transitions the overflowing row to ready, ages it beyond lookback and reconstructs the real durable state for replay. One new test injects a crash after the first actual durable write and before enqueue for capture-started, capture-done, discovery-degraded and discovery-recovered, then verifies replay and acknowledgement after reconstruction. Tests use synthetic media/transport; no real capture or delivery is claimed.

Attributed broker execution: **11/11 PASS**, exit 0, elapsed 6605 ms, no timeout, zero drift across 47 pinned inputs. Exact receipt qa/evidence/goal-t038-lifecycle-current-20261015T013043Z.receipt.json SHA256 E94E8C40F1F4574524827773D776898E081322D3EF24126B332C6A02D77E46EE; stdout confirms zero cancelled/skipped/todo. Command: `node --test --test-concurrency=1 --test-timeout=30000 --import tsx scripts/webinar/scheduler/lifecycle-alerts.test.mjs scripts/webinar/scheduler/alert-kinds.test.mjs`.

This executes the helper and actual durable sink/tenant reader/API consumer with injected transport. The receipt does not pin or execute the changed canonical runner; a separate current-file hash read confirms runner0D368 unchanged. Requested meaningful next runner regressions pipeline.test.mjs, dispatch.test.mjs and index-proof-chain.test.mjs are pending the sole broker, without repeating the eleven green cases. Current full authored scope is 47 tests; 36 remain unexecuted. No maker execution occurred. Contract verification and independent verdict remain pending. Ready-for-check asks the checker to assess this bounded evidence and missing runner coverage; no close-out/PASS is claimed.

Reusable frozen validator evidence now supplied in the packet: actual exit-0 `python contracts/verify_contracts.py`, no frozen contracts/PASS by vacuity; current validator/registry hashes match. Attributed global API/web types and both builds are green across 1951 unchanged inputs, distinct from scheduler/host acceptance. Independent verdict and canonical runner regression remain pending.

Packet: qa/packets/t038-atomic-lifecycle-outbox.md. The full-parent C3–C6 live overlap, usable downstream, delivery, independent hosts and seven actual days remain HOLD.

## Cycle 1 — resumed consumer proof and deterministic shutdown fixture

Root explicitly resumed the missing fifteen consumer checks. Immutable receipt `qa/goal-vectorless-2026-10-15/verification-t038-owed15-20261015T0723.json` records exit 1, 14/15, elapsed 63130.3362 ms and no timeout/drift. The failing line 99 asserts queued/service-stopped/attempts0. The original fixture races an immediate cadence abort against its intended recording-disposition abort. Exact original file is preserved at `qa/evidence/t038-shutdown-before.fixture.txt`, SHA256 3B565BB2F805F4C7E1A554D9ABF5366421031547DBDFE2EC845AF4E85CE7F07C, equal to the failed receipt's test pin.

Only `scripts/webinar/scheduler/pipeline.test.mjs` changes in this resumed correction. Cadence waits for the log callback to observe recording, abort and resolve a deferred. New assertions require that boundary to have actually occurred and the returned operations to equal the persisted operations. Original zero-launch and queued/service-stopped/attempts0 expectations remain intact. No product logic changed. Final test SHA256 6E88142E85898D2FB1F5BB1AAA0B4362DBBC987317C23BBA1F40F5749E1B975A.

Union-ledger issue ISS-SCHEDULERRESUME-001 records the original full fifteen-case command verbatim; it stays open pending its full replay and independent checking. Full parent remains HOLD. Current named-case and fifteen-case broker checks await capture/index-proof consumer freeze. The unchanged eleven helper tests are not repeated absent dependency evidence requiring it. Earlier cycle-0 maker/checker work remains historical, including unknown timing/token usage; it is not reset to zero. Resumed initial inspection lacked a monotonic checkpoint, so comparable complete maker active seconds and actual token usage are unknown/null; checker must use the canonical BOOTSTRAP_REVIEW helper and retain earlier unknown reviewer overhead. Observed corrective-phase UTC checkpoint 2026-10-15T07:52:41.2256962Z, source/ledger freeze 07:53:34.4396230Z, exact old snapshot confirmation 07:54:16.1975696Z; these wall checkpoints are not fabricated active-time metrics.

Current partial evidence: actual alternate safe-loader batch receipt qa/goal-vectorless-2026-10-15/verification-t038-consumer-fix-20261015T0807.json has fifteen scheduler named PASS and one extra consumer collection failure, exit1,17500.1406ms. It is not a whole-batch PASS and does not literally replay ISS-SCHEDULERRESUME-001's tsx argv (0/1 literal command currently). Candidate remains in_progress pending required original-runtime evidence and independent review; no further edits or tests launched by maker.

## Cycle 1 current READY evidence

Mandatory literal original reproduction is now executed GREEN: receipt qa/goal-vectorless-2026-10-15/verification-t038-literal-floor-20261015T0811.json SHA2566CBFB1BFF702801B1695FA265D64CCBDF1C46C0039F1ED1467117EB40D6F1ADB, actual UTC07:58:51.35Z–07:59:02.76Z,11407.9428ms, exit0,15/15, no failed/cancelled/skipped/todo and no pinned-input drift. ISS-SCHEDULERRESUME-001:1/1 recorded reproduction command replayed green; ledger stays open until checker disposition. Source candidate pin-set SHA269105c4fba47a66ae9f513bb4a3a24ae2e062ccdf47236abfa2a957cea773f4 is SHA256, not a Git commit. Test readback still6E88142E85898D2FB1F5BB1AAA0B4362DBBC987317C23BBA1F40F5749E1B975A. This resolves the original runtime replay omission; prior failed/alternate receipts remain immutable history. No fifteen-case repeat is requested.

Ready-for-check cycle1 asks independent review of deterministic fixture delta, immediate abort/dispatch boundary and attributable current15 evidence; original11 accepted helper criteria remain historical checked scope with matching helper/test bytes, not a new exact-runtime reuse claim. Full parent remains HOLD. Root dispatches checker after canonical assessment using qa/evidence/t038-cycle1-review-budget.json: prior actualunknown charged conservatively180s6000, root-authorized cumulative360s12000 and next180s6000. Ratios remain UNVERIFIED. Maker actualtoken usage/comparableactive denominator unknown/null; no fabricated accounting.

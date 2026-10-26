# t038-atomic-lifecycle-outbox - independent verdict (cycle 1, resume-reconcile 2026-10-26)

VERDICT: PASS
Cycle checked: 1
SCOREBOARD: 4/4 criteria met (C1-C4), 0/0 invariants
TIER: L (lifecycle-alerts.mjs:103-119 durable save ordering plus replay concurrency; tenant filter lines 49-51 unchanged, no auth change, no production DB write, so single checker)
Policy-Version: proportional-verification/2026-10-19.17 (manifest has no pin; current block version used)
Base: ed542fd0 (parent of 0f3d9bb4, where the unit's files landed on this repo); the manifest's 5c4cbade is not an object in this repo
Judged bytes: current tree, git blobs equal HEAD for all four scoped files (git hash-object == rev-parse HEAD:path). Manifest pins 269105c4/608bb9f5 are stale and were not used.
ISSUES-WRITTEN: none (ISS-SCHEDULERRESUME-001 flipped open -> fixed in qa/issues.SCHEDULERRESUME.jsonl; it moves to verified only on a later re-check)
CAPABILITY-COVERAGE: 4/4 falsification rows reproduced (3 floor + 1 runner-clause probe)
LIVE-BROWSER: not-applicable (no UI paths changed)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)

## Check plan
Logic changed, so affected tests plus one falsification per criterion. No UI, provider, browser, database or live channel work (contract forbids it). Sources read in full this check: lifecycle-alerts.mjs, lifecycle-alerts.test.mjs, alert-kinds.test.mjs, pipeline.test.mjs, run-pipeline.mjs 95-245.

## Evidence I produced (all in qa/evidence/t038-atomic-lifecycle-outbox-c1-20261026/)
- Helper + sink/tenant/API: `node --test --test-concurrency=1 --import tsx lifecycle-alerts.test.mjs alert-kinds.test.mjs` -> 11/11 pass, exit 0, 0 fail/cancel/skip/todo (run-a.txt).
- Runner consumers (the 15 that prior HOLD said never started): pipeline + dispatch + index-proof-chain -> 15/15, exit 0 (run-b.txt). ISS-SCHEDULERRESUME-001's recorded argv replayed verbatim (`--test-timeout=30000`): 15/15, exit 0, 5077 ms (literal-b.txt).
- `python contracts/verify_contracts.py` -> exit 0, "no frozen contracts yet -- PASS by vacuity". Verifier sha256 1240059f... equals the manifest's pin.
- Concurrent-load note: nothing timing-sensitive failed; no rerun was needed.

## Criteria
- C1 PASS. update() at lifecycle-alerts.mjs:103-109 prepares the sanitized snapshot into the state image, saves once, then dispatches and enqueues; acquireDiscovery:110-119 stages both feeds before one save. Standing crash test covers all four cases (capture-started, capture-done, discovery-degraded, discovery-recovered), green. Runner: run-pipeline.mjs:154-155 keeps only confined() in the try; update() is outside it. My probe (copy only) makes log() throw during the artifact-start update and shows the failure reaches the operation reason (green), so persistence errors are not swallowed.
  Falsification F1: save() moved ahead of prepare() -> crash test red at `carrier.schedulerAlertOutbox.map` (outbox absent from durable image). F1b: update() moved inside the path catch (run-pipeline.mjs:154) -> probe red, reason became "Child exited without a completed index marker" instead of the persistence error.
- C2 PASS. Original 50-pending + 51st transient saturation test green; started and done both survive ready, aging past lookback, reconstruction and replay. Bounds: pending 50 and replay 25 covered by standing tests; outbox bound of eight probed (copy): refuses with "backlog full" log, throws, no save, no notification, no sink call, existing eight kept.
  Falsification F2: tick() outbox replay loop emptied -> saturation test red at the assertion `['capture-started','capture-done']` (actual []).
- C3 PASS. Runner uses alerts.update / alerts.acquireDiscovery (run-pipeline.mjs:121-123, 208); 15/15 runner consumers green on current bytes. alert-kinds tests run the real sink, tenant-filtered host reader and API projection with injected transport: finite kinds, ordinary/failure ceilings, digest dedupe, non-career staging, foreign tenant sees 0 rows. Foreign tenant and `../bad` ids never stage (probe). assertOwned() precedes every durable mutation and the ack filter (lines 64, 69, 104, 111, 123).
  Falsification F3: ack `every` -> `some` -> "failed channel stays durable" red (outbox length 0, expected 1), so a partly failed channel result would drop the replay obligation.
- C4 PASS. Final bytes rechecked (sha256 prefixes: run-pipeline c725cce0, lifecycle-alerts 749c8ada, lifecycle test d0caf840, pipeline.test a89009b6). Everything above is independent; the maker/broker receipts (11/11, 15/15) are consistent with it but not relied on. Validator run with its hash recorded.

## Notes (non-blocking, none is a FAIL)
- Defence in depth: removing only the operationInput tenant check would survive the suite because prepare() repeats it (lines 49-51). Redundant by design; no single-layer test exists. Low observation, not filed.
- update() mutates in-memory state before prepare() can throw on a full outbox; the throw is the truthful refusal and nothing is saved. Unchanged semantics.
- The contract file's working-tree sha256 (6b1200c9...) differs from the manifest pin (98562B1E...), consistent with a line-ending difference between machines; content read directly this check.
- 4c: the unit landed inside wave commit 0f3d9bb4 (20 files) and the later split d4f3c5c8 moved run-pipeline pieces, so the unit's own hunks cannot be isolated from git. Scoped files only were judged; no deletion of a standing test was found (11 helper + 15 runner tests all present and green).
- Full goal-t038 remains HOLD (live overlap, downstream delivery, Windows/Ubuntu hosts, seven days). This PASS closes only this atomic outbox unit.

EXPLANATION: The missing C3 runner evidence now exists and is green on the current bytes (15/15, plus the ledger's literal argv), and every criterion has a green-before / red-after falsification in a throwaway copy. The earlier HOLD was missing evidence, not a defect; the source drift it cited is moot because this check judged the current tree.
Metrics: start=2026-10-26T16:20:35Z end=2026-10-26T16:29:30Z wall_min=9 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=4 cycle=1 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=535 mutants=1 defects_unit=0 defects_6c=0

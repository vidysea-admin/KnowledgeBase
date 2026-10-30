# Verdict — t043-vectorless-proof-consumer

VERDICT: PASS
Cycle checked: 0
SCOREBOARD: 9/9 criteria met (C1–C7 of the existing contract, C8–C9 added by this check), 0/0 invariants (none defined)
TIER: L (tenancy/data-write readiness boundary; changed non-test file packages/meeting-bot/src/workspace/index-proof-consumer.ts:21-26 readiness conjunct and :34 shared source/database branch). Single coordinator, see PROCESS NOTE.
Policy-Version: the manifest has no pin; judged under the current block proportional-verification/2026-10-19.17 as the dispatch directed.
Base: not resolvable (manifest base 5c4cbade is not in this repository after the fast-forward). Judged on current tree bytes: the three unit files are tracked and unmodified at HEAD dae90045 (introduced in 0f3d9bb4); the 61-line consumer, 42-line fixture and 89-line test were read in full.
Contract: qa/contracts/t043-index-proof-v3-consumer.md. The manifest named a v4 revision for the checker to own; I appended C8 and C9 (routine amendment, adds criteria, weakens none; authority D-173). No whole-parent T-043 claim.

## Check plan
Logic changed in a tenancy-bound consumer: affected tests, 1 falsification per changed criterion (C8, C9) in isolated copies, a diff-scope read, and a differential probe for hostile rows the unit's own tests do not assert. No UI, data artifact, prompt or live provider.

## Evidence (all produced in this check; commands in qa/checkpoints/t043-vectorless-proof-consumer.md)
- Pins: consumer, test, fixture and scripts/webinar/index-proof.mjs hashes equal the manifest pins (CRLF-normalised). scripts/webinar/sync-session.mjs differs from its pin because later commits from other lanes changed it; the fixture still finds and runs the exact proof block (case 7 green depends on it), so the producer-to-consumer path was judged on current bytes.
- Re-run on the current tree: consumer suite 9/9, identity suite 4/4, exit 0, about 1 s each. The broker receipt in the manifest was not relied on.
- C1: tests 1, 2, 6 run the real sync proof block through vm with the real prepared helper and retention writer, then the real record-finalize.validateIndexProof. Test 1 asserts the legacy producer emits version 3 and test 6 asserts version 4, so nothing relabels a version.
- C2/C3/C4 (and C9): probe-v4 (4/4) rewrites turns, gate and proof hashes together on both artifacts and still refuses foreign tenant, foreign session, empty speaker, blank text, negative start, reversed timing, null start, empty id and duplicate id; refuses databases `lkb`, `lkb_other`, undefined and empty; keeps testData staging-only when caller and proof agree on another database; refuses artifact swap, session source mismatch and session index status not done. The valid control is accepted. The same probe on the genuine legacy v3 producer also passes 4/4 (probe-v3-legacy).
- C5: consumer uses `unknown` guards, fixed file names, bounded read-only snapshots and the final unchanged-bytes re-read (index-proof-consumer.ts:41-43); no any, outbound call or write. record-finalize.ts:317-318 is a pure delegation. Read on the current bytes; the unit did not change those hunks.
- C6: legacy v2 acceptance and the count/string-generation refusals stand (consumer test 3, identity test 4). No downgrade-attack or provenance-authenticity claim is made and the manifest states the limit.
- C7: handshake is ready-for-check at Fix cycle 0 under the matching slug.
- C8 (exact v4 readiness): index-proof-consumer.ts:21-26. Test 7 passes the real v4 output. Test 8 refuses missing or other mode, lexical missing or pending, provenance missing or failed, semanticSupport `passed` or absent, and version 3 or 2 rewrites of a v4 proof.
- C9 (v4 inherits every binding): index-proof-consumer.ts:34 `proof.version === 3 || proof.version === 4`; tests 8, 9 and the probe.

## Falsification (floor: 1 per changed criterion; isolated copies; named check green in the copy first)
- C8: removed the `provenance !== 'passed'` conjunct. Copy 9/9 green before; after, exactly the v4 attack-table test went red on the `{}` patch (provenance undefined), the assertion named for it.
- C9: changed the branch guard to version 3 only, so v4 skips source, database, session, row and gate checks. Green before; after, the v4 attack table went red on the forged sourceHash and the stale-validation/foreign-session test went red.
The bound tree was never edited; mutants lived only in scratch copies.

## Diff scope (4c)
The manifest base commit is unavailable, so no base diff exists. At HEAD the unit's three files and the sibling index-proof-identity.test.mjs (4 cases) are present. I found no removed export in the consumer, fixture or tests from the current bytes, and this check edited no product file.

## Non-blocking notes
- ISS-381 (low): after the fixture default became vectorless, index-proof-identity.test.mjs and consumer test case 2 exercise hostile rows, gates, speech-only input and testData against v4 only, so v3 regression pinning for those is gone. The manifest line "genuine v3 attack corpus remains in the standing suite" is therefore inexact. Behaviour holds (probe-v3-legacy 4/4); this is coverage and wording, not a FAIL.
- PROCESS NOTE: the manifest carries no `Dual check`, `dual-trigger` or `dual-waiver` line and no Policy-Version. I ran one coordinator because the source/database/session/row/gate logic is reused unchanged and the only added gate is the v4 readiness conjunct (about 6 lines), and the earlier v3 consumer unit passed on a single verdict. That is not the strict .10-7 waiver (no prior dual verdict). If the human wants strict policy, a second blind coordinator is needed; I found no concrete behaviour change in the v3 security path that requires it.
- Not claimed: live capture, Mongo persistence, authenticated proof provenance and parent T-043 citation acceptance remain open. This PASS covers only the scoped consumer.

CAPABILITY-COVERAGE: 2/2 falsification rows reproduced (C8, C9); manifest has no capability table
LIVE-BROWSER: not-applicable (no UI paths)
ISSUES-WRITTEN: ISS-381
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
Metrics: start=2026-10-26T16:21:48Z end=2026-10-26T16:29:00Z wall_min=7 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=2 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=420 mutants=0 defects_unit=0 defects_6c=0

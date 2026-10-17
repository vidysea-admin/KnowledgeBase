# Independent checker verdict — goal-t007-privacy-fixtures-w16

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: d3e1b872282b59298a36fde5cd10cdd6a54b1e98
Base SHA: a9fac545
Task: T-007 (privacy / data-write class, full ceremony). Scope: the three test-fixture files in the candidate diff plus the claims that the fixes for ISS-T007VISIBILITY-001 and ISS-T007REVIEWSOURCE-001 are already at base.
Checker: independent, fresh context. Started 2026-10-16T14:32:58Z, ended 2026-10-16T14:43:17Z (evidence clock). Maker usage is unknown, so the token/time ratio is UNVERIFIED (bootstrap). review_budget.py assess was not run, so no efficiency-success claim is made.

## Identity
- Lane HEAD is d3e1b872, whose parent is a9fac545. Before and after the checks, no tracked file was modified.
- `git diff a9fac545 d3e1b872` touches 4 paths: the 3 test files and this unit's manifest. Production source is byte-identical between base and candidate: review-source.ts 0C028641, read-snapshot.ts 1B97FF09, knowledge.ts 72B2E6BB (git blob SHA-256).
- Fixture lineage: the base fixture (blob 16f85917) already differed from the F104 pinned in the cycle-3 review-source receipts. The candidate fixture is blob d9af2f52 (CRLF c5470a1a). It does not equal F104 either, so any cycle-3 receipt pinning F104 is stale and must be re-derived.

## Q1: Do the fixture changes weaken tests?
No. The consented-source change does not hide a native-publication bug for sources without consent.
- `native-evidence/message-publication.ts:47` refuses publication unless `source.consent?.given === true`. Production WhatsApp ingest always records `given: true` (`whatsapp/store.ts:136`).
- At base, the two tests failed on that gate with `whatsapp_native_publication_unavailable`. The knowledge test also failed on the in-transaction session check at line 40. The failures came from the deliberate fail-closed gate, not from any assertion that unconsented sources must be refused. No assertion was removed.
- The repaired knowledge test now reaches real publication. It asserts that the published text appears in trustedTree, and that it disappears again from claim, turn, citation and tree once consent is withdrawn. That is stronger than base.
- The tree_index fake upsert ignores its filter (CAS and tenant). That is acceptable here because the test does not claim CAS coverage.
- Coverage note (not a regression; filed in EXPLANATION): mutation M2 loosened the gate to `=== false`. It SURVIVED all 63 tests in message-publication, whatsapp-authority, quarantine-native, knowledge, review-source and store. No test asserts that a WhatsApp source with no consent record cannot be natively published.

## Q2: Does the $ne narrowing change semantics for consumers?
- The only production `$ne` reaching reviewMongoFixture is `store.ts:32`, `"consent.given": {$ne:false}`. It is a sole-`$ne` predicate, so it is unchanged.
- Mixed `{$in,$ne}` now falls through to the documented unsupported-equality path, as the cycle-3 F104 intent required. Mutation M1 reverted the narrowing and killed review-source.test "source/raw/effective changes..." with the message "mixed operators must retain the previous unsupported equality behavior". This confirms the maker's third fix.
- Consumer run (`run-consumers.txt`, exit 1, 48/50) covered router, detection, consent-race, validation, whatsapp-authority and workbench, all green except two workbench tests:
  - `knowledge-outputs/workbench.test.ts:237` "actual T007 approval capability...": `whatsapp_native_publication_unavailable`. This is the same stale class of fixture without consent, at line 240 (`sources: [chat.source]`). It uses wireMongoFixture and only `reviewInput` from test-fixtures, so it is unaffected by this diff and fails identically at base. It is NOT repaired by this unit.
  - workbench "actual TOC unreviewed sample...": ENOENT on `apps/api/data/toc-migrated`. This is an environment gap in the sparse checkout.
- consent-race-mongo was not run (it needs real Mongo).

## Q3: Base fix claims, replayed
- ISS-T007VISIBILITY-001: I ran `visibility-checker.test.ts` verbatim (blob 5648fcfe, unchanged since 5c4cbade): **2/2 refused, control 1/1** (`run-vis.txt`, exit 0, 30/30 including knowledge.test).
  - Discrimination check (M4): I reintroduced the original defect expression described in the ledger, `changed=(!direct && children.length !== node.children.length)`. The result was 0/2, control 1/1. The fix is real.
  - Caveat: M4 reconstructs the original expression from the ledger text. The original source bytes (0104EF35) were not available.
- ISS-T007REVIEWSOURCE-001: I ran `review-source-checker-snapshot.test.ts` (root-authorized adapter F600541F, committed blob verified): **2/2 refused, both head-6 triggers fired, control 1/1**.
  - I also ran the verbatim original corpus (committed blob 30D3D3B6 verified). It gives 0/2 + 1/1: both attacks reject with `Error: Knowledge snapshot unavailable`, because the original fake has no `client`.
  - That is a fail-closed capability refusal, which the ledger and the prior verdict explicitly do not count. The adapter changes only client and option forwarding, so 2/2 via F600 is the measurement.

## Commands (cwd apps/api, bundled node v24.19.0, `timeout 600 node --test --test-force-exit --import tsx --test-concurrency=1`)
| Evidence (qa/evidence/goal-t007/checker-w16/) | Files | Result |
| --- | --- | --- |
| run-vis.txt | visibility-checker + knowledge.test | exit0, 30/30 |
| run-rs.txt | snapshot + original corpus + review-source.test + store.test | exit1, 25/27 (only the 2 original-corpus capability refusals fail) |
| run-consumers.txt | router, detection, consent-race, validation, whatsapp-authority, workbench | exit1, 48/50 (workbench, as above) |
| mut-m1 | revert $ne narrowing | killed (1 fail) |
| mut-m2 | consent gate loosened | SURVIVED 63/63 |
| mut-m3 | knowledge.ts:46 drops `consent===false` | survived 27/27 (redundant check at store.ts:49) |
| mut-m4 | original taint defect | killed 2/2, control passes |

Every mutation used a per-mutation byte backup, a timeout, and a trap on EXIT/INT/TERM/ERR. Each was restored with a matching cmp, and `git hash-object` matched HEAD for test-fixtures.ts (7fa56c6c), message-publication.ts (36e39941) and knowledge.ts (1645e26c).

## Ledger
- ISS-T007VISIBILITY-001: may be flipped to fixed. The fix is at base a9fac545 and was measured at d3e1b872 as 2/2 refused and 1/1 control, and the corpus discriminates.
- ISS-T007REVIEWSOURCE-001: may be flipped to fixed. It measures 2/2 refused and 1/1 control via the authorized F600 snapshot adapter. The verbatim 30D3D3 run is 0/2 counted, for a capability-refusal reason only (named, not omitted).
- Still open and not touched by this unit:
  - web28 (apps/web, outside the lane).
  - The cycle-3 ready-for-check submission of goal-t007-review-source. Its manifest is still `in_progress`, cycle 3, and its F104 pins are stale.
  - goal-t007-visibility. Its manifest is `in_progress`, cycle 1, with no verdict.
  - ISS-WA-REVIEW-WIRE-006 (separate readers, still open).
- Not established: real replica-set/MVCC behaviour, consent-race-mongo.

ISSUES-WRITTEN: none
EXPLANATION: PASS for the test-only unit, which is correct, non-weakening and consumer-safe. Notes (no new issues filed):
1. Add a negative test asserting that a WhatsApp source with no consent record refuses native publication and rolls back approval (M2 survived). Fix: in `review-source.test.ts` or `message-publication.test.ts`, approve with the source's `consent` deleted and assert rejection plus no claim or tree_index write.
2. `knowledge-outputs/workbench.test.ts:240` has the same stale fixture without consent. Fix: `sources: [{ ...chat.source, consent: { given: true, recordedBy: "owner" } }]`.
3. Review store (`$ne:false`) tolerates a missing consent record while publication requires `true`. Legacy sources without consent can therefore be queued but never approved. This is fail-closed and only a product note.

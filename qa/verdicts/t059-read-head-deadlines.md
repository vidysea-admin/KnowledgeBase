# Independent verdict — t059-read-head-deadlines (T-059 scoped S3/S5/S7/S10/S12/S13/S15)

VERDICT: HOLD
Cycle checked: 0
Reviewed SHA: 9e55b6428c5f000e1bc25b24bd0a52ed11473b54
Base compared: 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a (manifest "Base HEAD")
Checker: independent, fresh context, lane `lane/w17-t058check`

**HOLD, not FAIL: the source I reviewed does what the manifest says. The maker's evidence does not pin the unit's headline guarantee (a mutation of it survives all 22 workflow tests), and the manifest was never moved to ready-for-check. Whole T-059 stays HOLD regardless.**

## Why HOLD (each item is a missing-evidence gap)
1. **Surviving mutation on the central claim.** The claim is "storage deadlines retain ownership and never invoke recovery writes" (manifest, packet, workflow.ts comment at the catch). Mutation: delete `if (error instanceof StorageTimeout) throw error;` in the main `catch` of `retest` (workflow.ts, the 6-space-indented line just above "Only the current lease can record failure/release"). Result: `workflow.test.ts` still 22/22, exit 0. Cause: the four new fault tests assert stage, lock presence, call counts and eventual child/Ask counts, but none asserts that no `failure`/`failureHistory` entry or extra revision was written by the timed-out attempt. Under the mutant a timed-out `sourceRows`/`indexedRows` read records a failure and bumps the revision (my probe: failureHistory length 2 vs expected 1), which later success erases, so the tests cannot see it.
   My own probe (not part of the candidate) passes on the real code and fails on the mutant, so the source is correct and the mutant is observably different, not equivalent.
   **Repair request (fix cycle 1, test-only):** in `source and index read deadlines keep the lease...` record `failureHistory?.length` and `revision` before the timed-out retest and assert both unchanged except the lease acquisition (+1 revision); in `terminal CAS deadline...` (commitBeforeDeadline=false branch) assert before expiry that `timedOut.flywheel.failure === undefined`, `failureHistory` unchanged and revision equals the pre-CAS revision. Re-run the same mutation and show it killed by name.
2. **Handshake state.** `qa/manifests/t059-read-head-deadlines.md` says `Status: building`, `Handshake status: building`, and states broker receipts are "pending". It is not at ready-for-check. The maker's focused-test, contract and typecheck receipts do not exist in the repo. (I ran the focused tests myself, below, but the maker still owes a coherent packet.)
3. **Identity drift.** Packet pins workflow.ts 487ebc2b... and workflow.test.ts 94563bff...; bytes at 9e55b642 are different (workflow.ts blob 78e6f457, test blob in git). The committed file also contains another unit's changes (`readIndex`, `IndexReceiptContext`, vectorless receipt mode in receipts.ts/types.ts/test-fixture.ts, 5 canonical-lexical tests). The maker must re-pin the final bytes at ready-for-check. I reviewed the committed bytes.

## Source review (git diff 5c4cbade 9e55b642, T-059 delta only)
- workflow.ts `StorageTimeout extends StageTimeout`; `bounded(call, storage=true)` used on evaluation/gap/sourceRows/indexedRows reads (loss, load, receipt, readIndex, existing-child read, child readback) and on the terminal `replaceGap` only (`save(..., acceptedChild=true)` after the immutable child exists). All other writes remain unbounded, as declared.
- `verifyIndex`/freshness: a StorageTimeout in the `try` is rethrown (no paid rebuild); other failures still rebuild.
- Main `catch`: StorageTimeout rethrown before any recovery `load`/`save`. Lease retained. The timed-out CAS keeps its original revision predicate, so a late commit cannot overwrite a newer head (verified by test and by reading `save`).
- Consumer: router.ts maps FlywheelError to sanitized 503; router.test.ts 3/3.
- No tenancy/auth change: tenant argument to every bounded read is unchanged; no new input path.

## Independent evidence (run by the checker at 9e55b642; outputs in the checker scratchpad `w17-t058/`)
| Check | Result |
|---|---|
| `node --test --import tsx src/evaluation-flywheel/workflow.test.ts` (apps/api) | exit 0, 22/22 (includes 4 new fault tests and the ISS-T059REPLAY-001 historical-replay floor) |
| `.../router.test.ts` | exit 0, 3/3 |
| `.../composition.test.ts` | exit 0, 2/2 (wrote its own apps/api/qa evidence dir; removed, not committed) |
| `python contracts/verify_contracts.py` | exit 0, vacuous |
| Mutation M1 (above), per-mutation byte backup, timeout 600, trap, HEAD-fidelity | **SURVIVED** (22/22, exit 0). Restored; LF-normalized hash 78e6f4579ce8... equals the HEAD blob. |
| Probe on real code (sourceRows hang after an indexed checkpoint) | pass: no failure record, only lease acquisition revision |
| Probe on M1 mutant | fail: "no recovery failure record" actual 2 expected 1 |

ISS-T059REPLAY-001 is not this unit's target; its recorded floor test passed inside workflow.test.ts, no change made to that finding.

## Not verified
Typecheck/build (not run; maker says no type changes), native Mongo/restart, live HTTP/provider, provider cancellation, whole-operation deadlines and other writes (explicitly out of scope and unbounded). `@lkb/*` imports resolved to the main tree (e7af7354) through node_modules junctions.

## Ledger
No ledger rows may be flipped on this verdict. Parent T-059 unchanged (HOLD).
ISSUES-WRITTEN: none (the test gap is a repair request on this unit, not a new issue)

## Accounting
Checker tokens and active time: unknown (no host telemetry); no maker denominator, ratio unverified. No shared suites run.


---

## Cycle 1 verdict (appended on merge; the cycle 0 HOLD above is preserved unchanged)

# Independent verdict — t059-read-head-deadlines (T-059 scoped S3/S5/S7/S10/S12/S13/S15)

VERDICT: PASS
Cycle checked: 1
Reviewed SHA: e61f7b1be1649e43306c6b2503aa2c0b382a044d
Base compared: 9e55b6428c5f000e1bc25b24bd0a52ed11473b54
Prior verdict: cycle 0 HOLD, commit 49643545fec8f29c2677d26400bebc98f0111066 (lane/w17-t058check), reviewed SHA 9e55b642.

**PASS is scoped to the storage-read and terminal-head-promotion deadlines in workflow.ts. Whole T-059 (L1-L5, live, human, native Mongo) stays HOLD.**

## Diff
`git diff 9e55b642 e61f7b1b`: workflow.test.ts (+11/-1) and the manifest only. workflow.ts is byte-identical to 9e55b642 (LF-normalized blob 78e6f457). Manifest now `ready-for-check`, `Fix cycle: 1`.

## Cycle 0 HOLD items
1. Surviving mutation: repaired. Assertions added in two tests, checked for exactness:
   - read-deadline test: `pre` is captured after the first (Ask-refusal) failure and before the hang. `failure` deepEqual pre, `failureHistory` length equal pre, `revision === pre.revision + 1` (strict equality, lease acquisition only). Runs for both `sourceRows` and `indexedRows`.
   - terminal-CAS test: `casRevision` is captured from the real CAS predicate. `failure === undefined`, `failureHistory` length 0, `revision === (commitBeforeDeadline ? casRevision + 1 : casRevision)`. Strict equality, no range or truthiness checks.
2. Handshake: manifest corrected to ready-for-check, cycle 1.
3. Identity: manifest now pins actual bytes and states the committed workflow.ts carries another unit's readIndex/vectorless changes.

## Independent evidence (checker, at e61f7b1b, timeout 600, exit codes to files)
| Check | Result |
|---|---|
| workflow.test.ts (apps/api) | exit 0, 22/22 |
| router.test.ts | exit 0, 3/3 |
| composition.test.ts | exit 0, 2/2 (its apps/api/qa output removed, not committed) |
| `tsc --noEmit -p apps/api/tsconfig.json` | exit 0, no output |
| Mutation M1 (same as cycle 0: delete the main-catch `if (error instanceof StorageTimeout) throw error;`), per-mutation byte backup, trap, timeout, HEAD-fidelity | KILLED by exactly "source and index read deadlines keep the lease..." and "terminal CAS deadline preserves committed completion..." (20 pass, 2 fail, exit 1: "no recovery failure record"). Restored; LF hash 78e6f4579ce8 = HEAD blob; git diff clean. |
| Own probe on mutant | fail (failureHistory actual 2, expected 1) |
| Own probe on real code | pass |

Cycle 0 evidence for contracts/verify_contracts.py (vacuous) and the source review stands because workflow.ts is unchanged.

## Not verified / remaining
Native Mongo, restart, live HTTP/provider, provider cancellation, whole-operation deadlines and all other writes (explicitly out of scope, unbounded), broker receipts. `@lkb/*` resolved through node_modules junctions to the main tree. Typecheck covers apps/api only.

Ledger: no row is tied to this unit; nothing to flip. Maker may close out the manifest to checked-PASS for this scoped slice only.
ISSUES-WRITTEN: none

## Accounting
Checker tokens and active time unknown (no host telemetry); no maker denominator, ratio unverified.

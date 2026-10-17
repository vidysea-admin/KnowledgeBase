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

# Verdict: wire006b-failclosed

VERDICT: FAIL
Status: FAIL
Cycle checked: 0
Reviewed SHA: e9a0cd2037c323719e20602121b577fc12cfbbd2
Base SHA: 306228cb2c3de6b9d96164d327f539188cc1a032
Unit: ISS-W17WIRE006-001 and ISS-W17WIRE006-003 (both medium, tenancy/security class).
ISSUES-WRITTEN: none. The checker did not write to the ledger.
Ledger flip: NO. Both rows stay open. They become verified only after a cycle-1 PASS (see "Ledger" below).

## Why FAIL: one proven violation, and it is bookkeeping only
The code fixes are correct. The failure is in the commit's ledger edit.

**The problem.** `qa/issues.W17WIRE006.jsonl` lines 3-4 **append second rows for ids that already exist**: ISS-W17WIRE006-001 is already on line 1, and -003 is new to this lane. The repository's ledger reader refuses duplicate ids. `scripts/lib/ledger-rows.mjs:54` throws `Duplicate ledger id`.

**Proof.** I ran `node scripts/tracker-audit.mjs --gate g1,g4,g5`, which is the step `lint-loc.mjs` runs:
- At e9a0cd20 it exits **1**: "Duplicate ledger id ISS-W17WIRE006-001 ... :1 and ... :3".
- At 306228cb it exits **0**.

Evidence is in `checker/tracker-audit.w17-wire006b.log` and `checker/tracker-audit.w17-wire006.log`. `readLedgerRows` on its own throws the same error (`checker/ledger-rows.out`). CI runs this gate through `pnpm lint:structure` (ci.yml:95 -> `lint-loc.mjs --all`).

**Fix for cycle 1.** Edit row 1 (-001) in place: set severity to medium and status to fixed-pending-check. Write -003 as a single row. Delete the appended duplicates. Then re-run tracker-audit and confirm exit 0.

## Code review (passes)
1. **Router constructions** (git grep over apps, packages and scripts):
   - composition/integrations/routes.ts:80 takes `deps.transcriptReview` from production.ts:306 -> transcripts.ts:47-48. That binds the real `createKnowledgeVisibility(input.db).sessionVisible`, not an allow-all.
   - The only other constructions are authorization.test.ts:30 and :74, and persist.testkit.ts:40.
   - tsc --noEmit over apps/api exits 0 (36 s), with the field now required.
2. **Deleted function:** no importer remains in apps/, packages/ or scripts/. The only remaining references are in qa/evidence/t040-grounded-product-composition/checker-caller.test.ts and its .txt copy. That is a historical receipt, not run by any suite (not in `pnpm -r test` or `test:lint`), and it can no longer be replayed. **Low note**: this contradicts the manifest's "only importer" line.
3. **Allow-all in the testkit:** persist.testkit.ts is imported only by authorization, persist, refresh and service `.test.ts` files. The esbuild entry points are index.ts and source-intake/jobs/entry.ts (build.mjs:67), and nothing that is not a test imports the testkit. It cannot reach production.
4. **Mutations** (`checker/mut.sh`, `mut.out`): each used a per-mutation backup, a subshell trap on EXIT/INT/TERM/ERR, `timeout 600`, a marker assertion before the test, and a `cmp` restore.
   - M1 (restore fail-open: delete the typeof check and re-add `deps.authorizeSession &&`): KILLED, authorization 2 pass / 1 fail.
   - M2 (re-add the `createMongoGroundedContentDeps` export): KILLED, reader 6/1.
   - `git -c core.autocrlf=true hash-object` matches HEAD for both files.
   - Note: the runtime `typeof` check is redundant. Without it, calling `undefined` throws a TypeError inside the try, which still returns 503. It is harmless defence in depth.
5. **Tests** (cwd apps/api, node v24.19.0, `timeout 600`, one at a time):

   | test | exit | result |
   |---|---|---|
   | authorization | 0 | 3/3 |
   | persist | 0 | 18/18 |
   | read-side-quarantine-trusted | 0 | 9/9 |
   | tsc | 0 | clean |
   | reader, with `--test-force-exit` | 1 | 7/7 tests pass, then the file fails on a libuv teardown assert (`UV_HANDLE_CLOSING`, src\win\async.c:94); reproduced twice |
   | reader, without `--test-force-exit` | 0 | 7/7 |

   The libuv crash is the same at base 306228cb (`checker/base-reader.forceexit.log`). It comes from the runtime environment and was not introduced by this candidate.

## Ledger: integration conflict and final statuses
`git merge-tree` of lane/w17-integrate (d661df76, ledger close-out 1038058c) with e9a0cd20 merges **textually clean** (`checker/merge-tree.out`). It is still semantically broken: the merged file holds -001 twice and -003 twice, so tracker-audit and CI would crash.

The integrator must keep exactly one row per id:
- **-001:** severity medium (the integrator's in-place regrade). Status stays open until a cycle-1 PASS, then becomes `verified`.
- **-003:** severity medium, a single row. Status open, then `verified` after a cycle-1 PASS.
- **-002:** low, open. Unchanged.

## Not verified
- The full `pnpm lint:structure` run. Only its tracker-audit step was run.
- The service, refresh and grounded-postprocessing tests named in the manifest. The brief scoped the runs to four files plus tsc.

## Budget record (never waived)
- The maker's usage is unknown, so this ran as BOOTSTRAP_REVIEW with the ratio unverified.
- The checker's active time was about 389 s. Its tokens are unknown, with a debit of 60k allocated.
- `review_budget.py assess` exited 2, NEEDS_EXTRA_REVIEW, exceeded active_s and tokens (`checker/metrics.finalization.result.json`). This is recorded for ORCH.
- Evidence is in `qa/evidence/w17-wire006b/checker/`, which is untracked. Only this verdict is committed.

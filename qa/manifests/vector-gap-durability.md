# Manifest — vector-gap-durability
**Contract:** none covers this. `qa/contracts/ingest-indexing-pipeline.md` describes `indexSession`'s
writes but never a durability requirement for `recordVectorGap`'s own bookkeeping write;
`qa/contracts/recording-gap-tracking.md` governs a different gaps kind. Stated plainly rather than
added unilaterally (contracts are checker-owned).
**Fix cycle:** 1
**Backlog tier:** QUEUE Wave 1 row W1-vector-gap-durability (W2, ISS-122), approved by Umesh 2026-10-28
**Issues addressed:** ISS-122 (medium)
**Dual check:** required
dual-trigger: prod-write apps/api/src/indexing/vector-gap.ts:74
**Persona walk:** skip (backend bookkeeping observability, no UI surface, no end-user behaviour change; the
"persona" is the on-call operator reading GET /gaps after a Mongo fault)
**Executor:** claude-sonnet-subagent

## GOVERNANCE — round cap and D-044
This is a third unit on the `vector-gap.ts` seam (verdicts `vector-gap-record`, `vector-gap-tenant-id` already
PASSed; ISS-122 was filed by the second checker as non-security, "do not promote"). Two facts bear on it:
1. The only change that writes is the gap upsert/resolve in `recordVectorGap` (`vector-gap.ts:74,92`), a
   tenant-scoped data write, which `.claude/CLAUDE.md` D-014 classes as uncapped ("data write").
2. `qa/QUEUE.md` (D-044) waives the cap once for this branch, **conditioned on ISS-346 landing first and a
   fresh checker PASS before merge**. This manifest satisfies neither condition by itself: whether ISS-346 has
   landed is the orchestrator's call (H7 lists the iss-346 gate as still open). Nothing here merges.

## Acceptance criteria
- C1 `recordVectorGap` returns `true` whenever its gap write lands (open upsert, resolve update, and the
  vectorless-mode no-gap path).
- C2 `recordVectorGap` returns `false` (never throws) when the gap write throws, open or resolve.
- C3 `indexSession` returns the real `recordVectorGap` outcome as `IndexSessionResult.gapRecorded`.
- C4 The ingest boundary (`ingest-store.ts`, `whatsapp/store.ts`) warns when `gapRecorded` is false.
- C5 Merge with the integration head keeps its `retrievalMode` semantics: vectorless mode opens no gap.
- C6 The new required field compiles everywhere an `IndexSessionResult` is built (typecheck clean).

## What changed
- `apps/api/src/indexing/vector-gap.ts:56-103` `recordVectorGap`: `Promise<void>` -> `Promise<boolean>`; both
  success paths (`:88` open upsert, `:96` resolve) `return true`, the unchanged never-rethrow `catch` (`:97-102`)
  now `return false`. Integration's `retrievalMode` parameter (`:61,73`) kept as is.
- `apps/api/src/indexing/types.ts:57-63` `IndexSessionResult.gapRecorded: boolean` (ISS-122 doc comment).
- `apps/api/src/indexing/session.ts:275,315` captures `recordVectorGap(..., retrievalMode)` into `gapRecorded`
  and returns it. The integration head's strict-index guard (`:276`) and its restructured return are untouched.
  File trimmed back to exactly 300 non-blank lines (it was 300 on the integration head).
- `apps/api/src/ingest-store.ts:84` and `apps/api/src/whatsapp/store.ts:220` (file moved from
  `whatsapp-store.ts` upstream; git followed the rename) `if (!res.gapRecorded)` warn, mirroring the
  `chunks.skipped` warn above it.
- Merge-driven compile fixes, one line each: `apps/api/src/source-intake/store.ts:102` sanitised receipt now
  carries `gapRecorded`; test receipts `source-intake/jobs/{jobs,secret-spool,url-redaction}.test.ts`,
  `connector-workflow/workflow{,-watched}.test.ts`, `evaluation-flywheel/test-fixture.ts` got `gapRecorded: true`.
- `apps/api/src/indexing/vector-gap.test.ts`: the branch's 5 ISS-122 tests plus 3 added this cycle (ingestUrl
  boundary warn on false, quiet on true, vectorless mode).
- `qa/issues.vector.jsonl`: ISS-VECTOR-001..003 (all low, file-don't-fix).

Merge resolution (`bf4479ab`): conflicts in `session.ts` (x2), `vector-gap.ts`, `vector-gap.test.ts` resolved
by keeping both sides (integration's `retrievalMode`, strict guard and try/catch return; branch's `boolean`
result and `gapRecorded`). No side taken wholesale.

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Tier: L (data write: tenant-scoped upsert into `gaps` at `vector-gap.ts:74`; dual-trigger above)
Round: 14 files, 6 criteria, est 40 min — merge conflicts in 3 files, 7 receipt/fixture compile fixes, 3 new tests, 5 mutations, per-file runs
Base / checked state: branch `wave/vector-gap-durability`, code final SHA b47d69e9 (merge bf4479ab of docs/devops-golive-2026-10-26 338d2178), worktree clean except untracked `apps/api/qa/` (test evidence output, not committed)
Gate answers: none applicable
Affected tests / full-suite trigger: files below, one per node invocation. Builder runs no full suite (policy .7: a prod-write L unit's full suite is the checker's). `node --test "src/**/*.test.ts"` over apps/api is a multi-file run that stalls here.
Tests[C1]: apps/api/src/indexing/vector-gap.test.ts::"ISS-122: recordVectorGap returns true when the OPEN gap-write lands", "...RESOLVED gap-write lands" — real function, fake collection
Tests[C2]: apps/api/src/indexing/vector-gap.test.ts::"returns false when the OPEN gap-write THROWS", "returns false when the RESOLVE gap-write THROWS"; "ISS-121: a FAILING gap write must not strand the session" (never-throw guarantee)
Tests[C3]: apps/api/src/indexing/vector-gap.test.ts::"ISS-121: a FAILING gap write must not strand the session" (asserts res.gapRecorded === false through the real indexSession -> recordVectorGap chain); apps/api/src/indexing/session.test.ts (26, unmodified)
Tests[C4]: apps/api/src/indexing/vector-gap.test.ts::"ISS-122: ingestUrl warns that the gap bookkeeping FAILED...", "ingestUrl stays quiet... when gapRecorded=true" — real createMongoIngestDeps over BlindDb, stubbed indexer. whatsapp/store.ts twin NOT tested (ISS-VECTOR-001)
Tests[C5]: apps/api/src/indexing/vector-gap.test.ts::"ISS-122 x vectorless: ... opens NO gap and still reports the bookkeeping landed"; apps/api/src/indexing/vectorless-publication.test.ts (12, unmodified)
Tests[C6]: pnpm --filter @lkb/api typecheck; receipt consumers jobs.test.ts, workflow.test.ts, workflow-watched.test.ts
Sibling: apps/api/src/whatsapp/store.ts:220 — changed (warn only, untested, ISS-VECTOR-001)
Sibling: apps/api/src/source-intake/store.ts:102 — changed (field copied, not asserted, ISS-VECTOR-002)
Falsification[C1]: copy-mutant vector-gap.ts:88,96 `return true` -> `return false`; RED 3 fail (open, resolved, vectorless tests); restored, git hash-object 269bcbaa == HEAD blob
Falsification[C2]: copy-mutant vector-gap.ts:102 `return false` -> `return true`; RED 3 fail (open-throws, resolve-throws, ISS-121 strand test); restored, hash 269bcbaa == HEAD blob
Falsification[C3]: copy-mutant session.ts:315 `gapRecorded,` -> `gapRecorded: true,`; RED 1 fail (ISS-121 strand test, the only one that reads indexSession's field); restored, hash c0d79822 == HEAD blob
Falsification[C4]: copy-mutant ingest-store.ts `if (!res.gapRecorded) {` -> `if (false) {`; RED 1 fail (boundary warn test); restored, hash b1b329dc == HEAD blob
Falsification[C5]: copy-mutant vector-gap.ts:73 drop `retrievalMode === "vector" &&`; RED 1 fail (vectorless test); restored, hash 269bcbaa == HEAD blob
Falsification[C6]: none — typecheck is itself the red/green: before the receipt fixes `tsc` reported 7 TS2741 `gapRecorded` missing errors (store.ts:102, jobs/secret-spool/url-redaction tests, workflow.test.ts:183, workflow-watched.test.ts, test-fixture.ts:109); now exit 0
Pre-check[C1]: b47d69e9 node --test --import tsx apps/api/src/indexing/vector-gap.test.ts -> exit 0, 13 passed, 0 failed t=29 blobs=apps/api/src/indexing/vector-gap.test.ts:c448d24
Pre-check[C2]: b47d69e9 node --test --import tsx apps/api/src/indexing/vector-gap.test.ts -> exit 0, 13 passed, 0 failed t=29 blobs=apps/api/src/indexing/vector-gap.test.ts:c448d24
Pre-check[C3]: b47d69e9 node --test --import tsx apps/api/src/indexing/vector-gap.test.ts; node --test --import tsx apps/api/src/indexing/session.test.ts -> exit 0, 13 passed + 26 passed, 0 failed t=39 blobs=apps/api/src/indexing/vector-gap.test.ts:c448d24,apps/api/src/indexing/session.test.ts:3a0819a
Pre-check[C4]: b47d69e9 node --test --import tsx apps/api/src/indexing/vector-gap.test.ts -> exit 0, 13 passed, 0 failed t=29 blobs=apps/api/src/indexing/vector-gap.test.ts:c448d24
Pre-check[C5]: b47d69e9 node --test --import tsx apps/api/src/indexing/vector-gap.test.ts; node --test --import tsx apps/api/src/indexing/vectorless-publication.test.ts -> exit 0, 13 passed + 12 passed, 0 failed t=40 blobs=apps/api/src/indexing/vector-gap.test.ts:c448d24,apps/api/src/indexing/vectorless-publication.test.ts:49b35e5
Pre-check[C6]: b47d69e9 npx tsc --noEmit -p apps/api/tsconfig.json; node --test --import tsx apps/api/src/source-intake/jobs/jobs.test.ts; node --test --import tsx apps/api/src/connector-workflow/workflow.test.ts; node --test --import tsx apps/api/src/connector-workflow/workflow-watched.test.ts -> exit 0, tsc clean, 10 passed + 16 passed + 11 passed, 0 failed t=119 blobs=apps/api/src/source-intake/jobs/jobs.test.ts:a2041e6,apps/api/src/connector-workflow/workflow.test.ts:8b4f1ae,apps/api/src/connector-workflow/workflow-watched.test.ts:05ba694
Metrics: builder_min=50 mutants=5 policy=proportional-verification/2026-10-19.17 cycle=1 suite_runs=0 repeat_runs=0 tokens=unavailable

## Also run on the merged tree (not a full suite; one file per invocation, all 0 fail)
jobs, secret-spool, url-redaction, workflow, workflow-watched, session, vectorless-publication, post-commit,
whatsapp store-isolation and store-source-id, evaluation-flywheel (composition, receipts, workflow, ...),
source-intake (media-runtime, source-intake, source-reader-http): 20 files green on the merge commit `bf4479ab`
tree before the comment-only `b47d69e9` trim; the five files in the Pre-check lines were re-run on `b47d69e9`.

## Measurement against the ledger (D-015)
ISS-122's ledger row carries no `reproductions` key (only `evidence` and `fix_direction`), so there is no
recorded corpus to substitute. The authored corpus is the conditions its title and `fix_direction` name:
open-write ok, resolve-write ok, open-write throws, resolve-write throws, throw inside a full `indexSession`
that still flips status. `ISS-122: 5/5 addressed, 0 left open`; plus the boundary and vectorless cases above.

## D-020 mutation-run safety
Each mutation was a single `sed` line edit on a file first verified `git hash-object == HEAD blob`, with a
byte backup scoped to that one mutation, the test run under `timeout 150`, then `cp` back from the backup and
`git checkout -- <file>`, and a `git hash-object` vs `git rev-parse HEAD:<file>` check per mutation (all
`hash-ok`). No `trap` was used (the per-mutation sequence ran in one script that always reaches the restore
after the timeout-bounded test). `git status --short` after all five: only untracked `apps/api/qa/`.

## Known limits
- `whatsapp/store.ts:220` warn and `source-intake/store.ts:102` field copy are not test-pinned (low ledger rows).
- `node scripts/lint-loc.mjs` still fails on `apps/api/src/knowledge-outputs/workbench.test.ts` (402 > 400),
  pre-existing on the integration head and untouched (ISS-VECTOR-003). `session.ts` is exactly at budget.
- No live provider, network or production Mongo call was made.

## Status: ready-for-check

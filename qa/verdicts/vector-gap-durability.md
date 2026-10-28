# Verdict — vector-gap-durability (coordinator A, blind dual check)

**Date:** 2026-10-28
**Contract:** none covers this unit (per manifest); judged against the manifest's C1-C6
**Manifest:** qa/manifests/vector-gap-durability.md
**Cycle checked:** 1
**Mode:** A (unit check), coordinator A of a dual check. Writes no ledger rows, changes no manifest status.
**Policy-Version:** proportional-verification/2026-10-19.17
**Checked at commit:** `ea82ccf5` (code final `b47d69e9`); tree clean except untracked `apps/api/qa/` (test evidence output)

```
VERDICT: PASS
SCOREBOARD: 6/6 criteria met
FAILURES: none
ISSUES-WRITTEN: none (dual check: proposals below, ledger rows left to the merge step)
```

## What I re-ran myself (bound tree, one file per node invocation, `timeout`)

| Check | Result |
|---|---|
| `vector-gap.test.ts` | 13 pass / 0 fail |
| `session.test.ts` | 26 pass / 0 fail |
| `vectorless-publication.test.ts` | 12 pass / 0 fail |
| `source-intake/jobs/jobs.test.ts` | 10 pass / 0 fail |
| `connector-workflow/workflow.test.ts` | 16 pass / 0 fail |
| `connector-workflow/workflow-watched.test.ts` | 11 pass / 0 fail |
| `npx tsc --noEmit -p apps/api/tsconfig.json` | exit 0 (C6) |

Maker's Pre-check lines matched on identity (same SHA `b47d69e9` code, same test blob `vector-gap.test.ts:c448d24`) and my own re-runs agree; the file counts are the same as the manifest's.

## Per-criterion evidence

- C1: `vector-gap.ts` returns `true` after the open upsert (`:88`), after the resolve update (`:96`), and falls into the resolve path in vectorless mode. Tests "returns true when the OPEN / RESOLVED gap-write lands" and the vectorless test pass.
- C2: catch (`:97-103`) still never rethrows and now returns `false`. Tests "returns false when the OPEN / RESOLVE gap-write THROWS" pass; ISS-121 strand test still passes.
- C3: `session.ts:272` captures the real `recordVectorGap` result, `:312` returns it. ISS-121 test asserts `res.gapRecorded === false` through the real `indexSession -> recordVectorGap` chain.
- C4: `ingest-store.ts:84` and `whatsapp/store.ts:220` both carry the warn (read, identical, `res`/`sessionId` in scope). Behaviour pinned for `ingest-store.ts` only (see PROPOSED-ISSUE 1).
- C5: `retrievalMode === "vector" &&` guard retained at `vector-gap.ts:73`; vectorless test and the 12 `vectorless-publication` tests pass.
- C6: tsc exit 0; receipt/fixture sites (`source-intake/store.ts:103`, 3 source-intake tests, 2 connector-workflow tests, `evaluation-flywheel/test-fixture.ts:109`) all carry the field. `git grep IndexSessionResult` shows no untyped constructor left.

## Falsification (copy of the tree in my scratchpad, per-mutation byte backup, `timeout 200`, restore verified by `git hash-object` == `git rev-parse HEAD:<file>`; bound tree untouched)

| Mutant | Result | Hash after restore |
|---|---|---|
| M1 `vector-gap.ts` resolve `return true` -> `false` (C1) | RED 2 (RESOLVED-lands, vectorless) | 269bcbaa == HEAD |
| M7 `vector-gap.ts` open `return true` -> `false` (C1) | RED 1 (OPEN-lands) | 269bcbaa == HEAD |
| M2 `vector-gap.ts` catch `return false` -> `true` (C2) | RED 3 (open-throws, resolve-throws, ISS-121) | 269bcbaa == HEAD |
| M3 `session.ts` return `gapRecorded` -> `gapRecorded: true` (C3) | RED 1 (ISS-121 strand test) | aa6bd07b == HEAD |
| M4 `ingest-store.ts` `if (!res.gapRecorded)` -> `if (false)` (C4) | RED 1 (ingestUrl boundary warn) | b1b329dc == HEAD |
| M5 `vector-gap.ts` drop `retrievalMode === "vector" &&` (C5) | RED 1 (vectorless) | 269bcbaa == HEAD |
| M6 `whatsapp/store.ts` `if (!res.gapRecorded)` -> `if (false)` (C4, twin) | SURVIVED: 6/6 `store-source-id.test.ts` pass | 934714ec == HEAD |

Mutants M1, M7, M2, M3, M4, M5 all killed; M6 survives, as the maker disclosed (ISS-VECTOR-001).

## Adversarial hunt (auth / tenancy / data-write paths touched)

- The only write is the unchanged tenant-scoped `gaps` upsert/update through `scopedCollection(...)(tenantId)`; the diff changes only return values. The ISS-118 "gap write is tenant-confined on both filter and body" and ISS-121 "two tenants, different ids" tests still pass.
- `gapRecorded` is a bare boolean; no tenant, id or error text is added to the receipt, and the warn lines carry `sessionId` only (same data as the sibling ISS-116 warn). No new data leak.
- The catch still never rethrows: no new way to strand a session (ISS-121 invariant held, M2 proves the test notices a lie).
- Merge resolution: `retrievalMode` strict-index guard and vectorless semantics kept; 12 vectorless-publication tests pass.
- No bypass found on the write path.

## Governance notes (for the orchestrator, not blocking this verdict)

- D-044 waives the round cap only on condition that ISS-346 lands first and a fresh checker PASS exists before merge. This PASS is one half of the dual check; whether ISS-346 has landed is not something this check can establish.
- The seam already has 2+ PASSes, and the new findings are non-security, so they are file-don't-fix under D-014.

## PROPOSED-ISSUES (low, file-don't-fix; coordinator A writes no ledger rows)

PROPOSED-ISSUE 1 (low, test-gap): `whatsapp/store.ts:220` `ingestGroup` gapRecorded=false warn is unpinned (mutant M6 survives all `whatsapp/store-source-id.test.ts`). It is half of C4. Duplicates maker row ISS-VECTOR-001; agree with its fix_direction.
PROPOSED-ISSUE 2 (low, test-gap): `source-intake/store.ts:103` `safeIntakeIndexReceipt` copies `gapRecorded` with no assertion that the field survives. Duplicates ISS-VECTOR-002.
PROPOSED-ISSUE 3 (low, robustness): receipts replayed from persisted state that predate this field would have `gapRecorded` undefined, and `!res.gapRecorded` would then emit a false "bookkeeping FAILED" warn. I found no persisted-receipt replay into the two boundaries in this diff (both call a live indexer), so this is theoretical.
Observation only: `ISS-VECTOR-003` (lint-loc 402 > 400 in `knowledge-outputs/workbench.test.ts`) is pre-existing on the integration head and untouched by this diff.

Metrics: check_min=20 mutants=7 policy=proportional-verification/2026-10-19.17 cycle=1 suite_runs=0 repeat_runs=0 tokens=unavailable

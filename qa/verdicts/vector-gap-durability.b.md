# Verdict — vector-gap-durability (coordinator B, blind dual check)

**Contract:** none covers this (manifest says so; verified, `ingest-indexing-pipeline.md` has no gap-write durability line)
**Manifest:** qa/manifests/vector-gap-durability.md
**Cycle checked:** 1
**Date:** 2026-10-28
**Checker:** Mode A, fresh context, coordinator B; policy proportional-verification/2026-10-19.17
**Checked state:** HEAD ea82ccf5 (code final b47d69e9); base 338d2178 verified as ancestor of HEAD
**TIER:** L (data write: tenant-scoped upsert into `gaps`, vector-gap.ts:74; dual-trigger cited in manifest)

## VERDICT: PASS

SCOREBOARD: 6/6 criteria evidenced. ISSUES-WRITTEN: none (dual check: findings are PROPOSED-ISSUE lines only).

## Check plan
Logic changed + data-write path -> affected tests, falsification in a copy, typecheck, tenancy/bypass read of the diff. No UI, no persona walk, no live/provider call.

## Independent evidence (all run by me; copy = `git archive HEAD` of the worktree, node_modules junctions, removed afterwards by rmdir on the junctions only)

| Command | Result |
|---|---|
| `tsc --noEmit -p apps/api/tsconfig.json` (bound worktree, read-only) | TSC_EXIT=0 (C6) |
| node --test vector-gap.test.ts (copy) | 13/13 pass |
| node --test session.test.ts | 26/26 |
| node --test vectorless-publication.test.ts | 12/12 |
| node --test source-intake/jobs/{jobs 10, secret-spool 6, url-redaction 3}.test.ts | all pass |
| node --test connector-workflow/{workflow 16, workflow-watched 11}.test.ts | all pass |
| node --test indexing/post-commit.test.ts | 2/2 |

One file per invocation, each under `timeout`. Maker Pre-check blob ids and test counts matched (13, 26, 12, 10, 16, 11).

## Diff-scope read (step 4c)
Product diff read in full: vector-gap.ts, types.ts, session.ts, ingest-store.ts, whatsapp/store.ts, source-intake/store.ts. All 15 files are inside the manifest's What-changed list; no out-of-scope file. `scopedCollection`/tenant filter and body in `recordVectorGap` are byte-unchanged (only `return true` x2, `return false`, signature, doc comment). The catch still never rethrows, so ISS-121's strand guarantee is intact. `gapRecorded` is a boolean copied into the sanitised intake receipt (no secret/free-text surface added). No consumer gates on `gapRecorded` (grep: only the two warn sites and the receipt copy), so a false value cannot start failing an ingest.

## Criteria
- C1 PASS. Open upsert, resolve update and vectorless no-gap path all return `true`; tests assert strict `=== true`.
- C2 PASS. Throw on open and on resolve returns `false`, no throw; ISS-121 strand test still green.
- C3 PASS. `session.ts:272/315` threads the real value; ISS-121 test asserts `res.gapRecorded === false` through the real `indexSession`.
- C4 PASS. `ingest-store.ts:84` warns on false, quiet on true; both directions tested over the real `createMongoIngestDeps`. `whatsapp/store.ts:220` twin is read-correct but untested (PROPOSED-ISSUE 1, already filed as ISS-VECTOR-001 by maker).
- C5 PASS. Vectorless mode with a skipped chunk write takes the non-upsert resolve branch, opens no gap, returns `true`.
- C6 PASS. tsc exit 0 on the bound tree; all receipt/fixture builders compile.

## Falsification (my own mutants, in the copy, per-mutation byte backup, restored and verified by `git hash-object` == `git rev-parse HEAD:<file>`)
| Mutant | Criterion | Result | Restored hash |
|---|---|---|---|
| M1 resolve path drops `return true` (returns undefined) | C1 | RED 2 fail (RESOLVED-lands, vectorless) | 269bcbaa == HEAD |
| M2 catch `return false` -> `throw err` | C2 | RED 3 fail (open-throws, resolve-throws, ISS-121 strand) | 269bcbaa == HEAD |
| M3 session.ts `gapRecorded` hard-coded `true` | C3 | RED 1 fail (ISS-121 strand) | aa6bd07b == HEAD |
| M4 ingest-store warn inverted `if (res.gapRecorded)` | C4 | RED 2 fail (warn + quiet tests) | b1b329dc == HEAD |
| M5 drop `retrievalMode === "vector" &&` | C5 | RED 1 fail (vectorless) | 269bcbaa == HEAD |

Mutants differ from the maker's (M1, M2, M4 are distinct edits); every one killed. Bound worktree `git status` after: only untracked `apps/api/qa/`.

## Adversarial hunt (auth / tenancy / data-write)
- Tenant confinement of the gap write unchanged; `assertUpdateBodyConfined` tenant test still green. Cross-tenant id collision test (ISS-121) green.
- A write fault cannot now be turned into a thrown error or a stranded session (M2 killed).
- A hostile or odd receipt cannot spoof `gapRecorded` into a tenant leak: it is a boolean the boundary only reads for a `console.warn`.
- Remaining gap: other `BoundIndexer` callers (none found warning) ignore the field; non-blocking, see PROPOSED-ISSUE 2.

## D-015
No `reproductions` key on ISS-122, so no recorded corpus to re-run; the maker's authored corpus covers the conditions named by the title and `fix_direction`, and I re-ran it (13/13).

## Governance
D-014: this is a data-write unit, uncapped. D-044 cap waiver is conditioned on ISS-346 landing first and a fresh PASS before merge: this verdict is one of the two blind coordinators and does not itself satisfy the merge condition; whether ISS-346 landed is the orchestrator's call. Nothing was merged or pushed by me.

## PROPOSED-ISSUE lines (not written to any ledger)
- PROPOSED-ISSUE low test-gap: `whatsapp/store.ts:220` `if (!res.gapRecorded)` boundary warn is unpinned; inverting or deleting it keeps the suite green (same as maker's ISS-VECTOR-001; confirm, do not duplicate).
- PROPOSED-ISSUE low design: only `ingestUrl` and `ingestGroup` surface `gapRecorded === false`; other `BoundIndexer` consumers (source-intake receipt, connector-workflow, refresh-executor) carry it but never warn or fail. File-don't-fix unless an on-call need appears.

Metrics: start=2026-10-28T16:05:00+05:30 end=2026-10-28T16:31:00+05:30 wall_min=26 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=5 cycle=1 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=1560 mutants=5 defects_unit=0 defects_6c=0 check_min=26

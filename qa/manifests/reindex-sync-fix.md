# Manifest — reindex-sync-fix
**Contract:** none specific; criteria C1-C6 below, taken from the unit brief (D-207 in docs/DECISIONS.md; Umesh's answers in qa/gates/kb-speed-wa-h3-2026-10-29.md; the D-204 text in qa/gates/d-entry-prod-optin-sync.md). No qa/contracts file; the maker never edits qa/contracts/.
**Goal task:** none
**Date:** 2026-10-29
**Status:** ready-for-check
**Handshake status:** ready-for-check
**Fix cycle:** 0
**Dual check:** required
dual-trigger: prod-write scripts/webinar/sync-session.mjs:90
**Persona walk:** skip (no screen, flow or user type; operator CLI only)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Executor rationale:** one CLI/data unit behind an existing production opt-in; no external executor was worthy.

Authority: D-207. Base be9c8608. Code commits e81f2cbf, f28b5873 and 8f52d32d (this manifest commit follows and touches only qa/). The real reindex of lkb_prod is NOT run by this unit; the coordinator runs it after PASS. Nothing here touched lkb_prod or lkb.

## Acceptance criteria
- **C1 (migrated shape)** `loadWebinarSession` accepts the migrated source shape (source.json without `title`) for a `provided` document whose session.json matches (`_id`, `tenantId`, `sourceId`, non-blank title, valid `YYYY-MM-DD` date). Title, date, org and status come from session.json; a title is never invented. Invalid, silent, captured, mismatched or session-less sources are still refused ("invalid/silent webinar source"). A title-bearing source behaves exactly as before.
- **C2 (index-only path)** `sync-session.mjs <id> --index-existing --tenant <t>` indexes a session whose rows already exist in the target DB: needs no local directory, verifies session, source and turns exist (tenant-scoped), refuses a testData source outside lkb_staging, never creates or replaces session/source/turn rows, and runs the same production indexer (`buildIndexer`) as the sync path, with a completeness gate.
- **C3 (one guard)** Both modes go through the SAME D-204 three-part opt-in (`allowProduction` + `--i-know-this-is-production` + `MONGODB_DB=lkb_prod` with `MONGO_WORK_DB=lkb_prod`). `isProtectedWorkDbName` is not weakened; the refusal matrix is unchanged; with any part missing there is no PRODUCTION line and no connection.
- **C4 (diagnosable failure)** A failed index persists WHY: `sessions.<id>.indexFailure = {at, via, reason, generation, state, phase}` (reason redacted of mongodb URLs, whitespace-collapsed, capped at 1000 chars); `indexAttempt` keeps its closed shape; a later success unsets it.
- **C5 (dry runs and tests)** `--dry-run --index` passes for both source shapes; `--index-existing --dry-run` prints its plan and connects to nothing; synthetic fixtures for both shapes; a run against a throwaway local Mongo covers the existing-rows path.
- **C6 (docs)** docs/GO-LIVE-UBUNTU.md lists the exact per-session commands (dry run, then real) for the 3 sessions, the prerequisites and where to read `indexFailure`.

## What changed
- scripts/webinar/session-rows.mjs: `providedSessionRow` (private, narrow) feeds the title-less path of `loadWebinarSession` (returns `legacyProvided`); new exports `assertIndexComplete`, `recordIndexFailure`, `clearIndexFailure`, `indexExistingRows`, `productionIndexer` (the shared `buildIndexer` plus native-archive wiring, moved from sync-session.mjs for the 300-line budget) and `indexExistingInDb`.
- scripts/webinar/sync-session.mjs: the D-204 guard text is hoisted UNCHANGED into `guardDatabase(testData)` (the one `allowProduction: true`, the one `isProtectedWorkDbName(` call) and called from both modes; `--index-existing`/`--tenant` args; early index-existing block (dry run connects to nothing); migrated sources skip the proof-based retention bookkeeping (they have no validation.json) and are gated by `assertIndexComplete` instead; the catch block persists the failure reason.
- Tests: scripts/webinar/session-rows.test.mjs (11 tests, one against a real throwaway mongod), scripts/webinar/db-guard-paths.test.mjs (24 tests, includes the unchanged D-204 ones).
- docs/GO-LIVE-UBUNTU.md: cutover section rewritten for the 3 sessions (Funding Dreams is NOT part of it and untouched).
- Not touched: scripts/lib/transcript-provenance.mjs (`isProtectedWorkDbName`, `requireScriptDatabase`), apps/api generation.ts / schema (see deviation), data/ and turns.json, lkb_prod.

## Deviations and findings to report
- **indexFailure instead of an indexAttempt field.** `indexAttempt` is a closed generated schema (schema/sessions.schema.json) outside D-207's Changes-authorized list, so the reason is stored on a sibling `indexFailure` field (the sessions schema allows extra top-level fields). A schema change would need its own decision.
- **BLOCKER for the real reindex: both TOC sessions have inverted turn timings.** A dry run on the real data stops at "invalid turn timing, write refused": UCAS t114 tStart 1883 > tEnd 1868; Visa t141 tEnd 213 < tStart 2008 (same defect the strict indexer rejects as "invalid transcript ownership/identity/time"; probable cause of their earlier "failed at preflight"). The loader never swaps or clamps. A human-approved repair of turns.json (and the prod rows) is needed first. Suggestion, not applied: Visa t141.tEnd and t142.tStart to 2013 (likely a dropped digit; the source md has "Thank you, Kshitij" at 2014); UCAS is ambiguous (t113 1815-1883, t114 1883-1868, t115 1868-1881; md has [31:09] at 1869). With repaired copies in a scratch dir both load and pass strict grounding (UCAS 230 turns, Visa 291).
- **Turn-row replacement risk.** `sync-session --index` on the TOC pair replaces the existing prod turn rows (generation swap on a standalone Mongo, no transactions; rows with an older syncGen are deleted) and re-sets org, participants, platform, status from the files. Compare turn ids first; `--index-existing --tenant toc` is the non-destructive alternative if the prod rows are intact (documented).
- Zoom p2 (tenant vidysea): cause of its earlier failure is unknown; `indexFailure` will record it on the first run.
- Pre-existing failure, not from this unit: scripts/webinar/session-inputs.test.mjs "captured media cannot bypass validation..." fails identically on the main checkout (private-recording consent proof).
- D-015 ledger evidence: N/A. No ledger issue in qa/issues*.jsonl names this fix (grepped), so there is no recorded reproduction corpus to re-run.

## Review findings folded in
senior-software-engineer agent (fresh context, read-only) on e81f2cbf..f28b5873: **Approve**. Guard moved verbatim, no second opt-in, `scripts/lib` untouched; `--index-existing` dry-run exits before the guard and the guard runs before any connect; `providedSessionRow` cannot admit a silent or captured source; `indexExistingRows` is tenant-scoped, creates/replaces no row. Two low findings, both fixed in 8f52d32d: (1) `clearIndexFailure` inside the try could flip a completed index to failed -> now `.catch(() => undefined)` at both call sites; (2) redaction covered only mongodb URLs -> also Bearer tokens, `sk-`/`pk-`/`key-`/`AIza` keys and `key=`/`token=`/`secret=`/`password=` (test added). Its test-gap note (no test that `--index-existing` refuses without connecting for MONGO_WORK_DB=lkb or lkb_prod without the flag) is already covered by the 9-case refusal matrix in db-guard-paths.test.mjs, which asserts zero connection attempts.

data-engineer agent (fresh context, read-only): **Warning**, no Block; opt-in intact, `indexFailure` is not rejected by any schema or serializer found (Sessions type has an index signature). Folded in 8f52d32d: `assertIndexComplete` now also requires `completion.strict === true` and `turnCount === expected` (rows present on the existing path, `rawTurns.length` on the sync path), so an `--index-existing` over a mixed old+new row set is refused; runbook now says to record the turn count and take a mongodump first, and that after a FAILED `--index` the repair is a clean re-run of the same `--index`, not `--index-existing`. Not changed: `retrievalMode === undefined` still passes (identical to the proof path, which only pins a mode when the caller passes one); if the indexer commits but the gate then throws (e.g. summary degraded) the row is already `status.index=done` while the script exits non-zero and records `indexFailure`, which is visible, not silent; the UI and other packages were not checked for strict session parsers.

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Round: tier H, 6 criteria, single builder, est 150 min (includes a context reset), fresh-context reviews as required by lifecycle routing
Tier: H (prod-write: the production opt-in path)
Base / checked state: base be9c8608; code commits e81f2cbf, f28b5873 and 8f52d32d; the manifest commit follows and touches only qa/.
Affected tests: session-rows.test.mjs, db-guard-paths.test.mjs, turn-timing.test.mjs, graph-finalize.test.mjs, graph-retry.test.mjs, validate-session.test.mjs, run-pipeline.test.mjs, run-pipeline-markers.test.mjs (one file per invocation under a timeout), `pnpm lint:structure`, `node scripts/snapshot.mjs --check`.
Not run / limits: no lkb_prod, no lkb, no live provider or LLM (the real-Mongo test injects a throwing `complete`); the throwaway mongod test skips if the binary is absent; the sync-path (not index-existing) failure persistence is pinned by a source-level assertion only, because a post-connect sync failure needs a live indexer.
Tests[C1]: scripts/webinar/session-rows.test.mjs::"D-207: the migrated source shape (no title) loads, taking title/date/org/status from session.json, never inventing a title" + "D-207 falsification: a title-less source is still refused unless session.json states a matching title (and is a provided document)" (10 refused cases) + "D-207: a title-bearing source is unchanged" — these load the migrated shape, enumerate the refused invalid/silent shapes and pin the unchanged titled shape
Tests[C2]: scripts/webinar/session-rows.test.mjs::"D-207: assertIndexComplete accepts a complete result and names every reason an incomplete one is refused" + "D-207: indexExistingRows indexes only rows that already exist and refuses (no indexer call) when any is missing" + "D-207: --index-existing on a real (throwaway) Mongo: ..."
Tests[C3]: scripts/webinar/db-guard-paths.test.mjs::"D-207: the D-204 refusal matrix is unchanged for --index-existing (each missing part refuses, NO production line, NO connection) and all three parts pass the guard" + "D-207 source: both paths call the one guardDatabase()..." + the unchanged D-204 tests in the same file
Tests[C4]: scripts/webinar/session-rows.test.mjs::"D-207: recordIndexFailure persists why (redacted, bounded)..." + "D-207: indexExistingRows records the failure reason on throw and on an incomplete result, clears it on success" + the real-Mongo test (reason persisted, indexAttempt closed shape, turns untouched)
Tests[C5]: scripts/webinar/db-guard-paths.test.mjs::"D-207: --dry-run --index passes for BOTH source shapes ..." + "D-207 falsification: a title-less source with no matching session.json is still refused by the dry run" + "D-207: --index-existing --dry-run prints the plan, needs no local directory, connects to nothing" + "D-207: --index-existing needs a valid --tenant and refuses --emit-files"
Tests[C6]: docs only; the commands are the ones exercised by the dry-run tests above (checked by reading docs/GO-LIVE-UBUNTU.md "Cutover: reindex the 3 FAILED sessions") — documentation only; the commands it lists are the ones the dry-run and refusal-matrix tests exercise
Pre-check[C1]: 8f52d32d node --test --import tsx scripts/webinar/session-rows.test.mjs -> exit 0, 11 passed, 0 failed t=1
Pre-check[C2]: 8f52d32d node --test --import tsx scripts/webinar/session-rows.test.mjs -> exit 0, 11 passed, 0 failed (includes the throwaway-mongod test) t=1
Pre-check[C3]: 8f52d32d node --test --import tsx scripts/webinar/db-guard-paths.test.mjs -> exit 0, 24 passed, 0 failed t=1
Pre-check[C4]: 8f52d32d node --test --import tsx scripts/webinar/session-rows.test.mjs -> exit 0, 11 passed, 0 failed t=1
Pre-check[C5]: 8f52d32d node --test --import tsx scripts/webinar/db-guard-paths.test.mjs -> exit 0, 24 passed, 0 failed t=1
Pre-check[C6]: 8f52d32d pnpm lint:structure -> `lint:structure: OK (10 stages, 0 failed)`; node scripts/snapshot.mjs --check -> `OK: docs/SNAPSHOT.md matches a fresh regeneration (183 lines, budget 200)`; turn-timing 7/7, graph-finalize 5/5, graph-retry 3/3, validate-session 26/26, run-pipeline 23/23, run-pipeline-markers 2/2 t=1
Metrics: builder_min=150 mutants=9 policy=proportional-verification/2026-10-19.17 cycle=0 suite_runs=0 repeat_runs=0 tokens=unavailable

## Red evidence (TDD)
Tests for the migrated shape, `indexExistingRows`, `recordIndexFailure` and the CLI modes were written before the code and failed (missing exports, "invalid/silent webinar source" on the title-less fixture, unknown flags) before they were made green.

## Falsifications (one or more per criterion)
Harness: node script, per-mutation byte backup, `timeout` 240 s per test run, restore in `finally`, then `git hash-object <file>` compared to `git rev-parse HEAD:<file>` after EVERY mutation (all `restored=true`; `git status` clean afterwards).

| Criterion | falsifying edit | observed |
|---|---|---|
| C1 | session-rows.mjs `providedSessionRow`: drop `row.tenantId === source.tenantId &&` | KILLED: "a title-less source is still refused unless session.json states a matching title" fails (10 pass, 1 fail) |
| C1 | `providedSessionRow`: drop the `source.captureMode !== "provided" ||` check | KILLED: same test fails (10 pass, 1 fail) |
| C2 | `indexExistingRows`: `if (!count) throw` -> `if (false) throw` (index a session with no turns) | KILLED: "indexes only rows that already exist and refuses..." fails |
| C2 | `indexExistingRows`: drop the testData/lkb_staging refusal | KILLED: same test fails |
| C3 | sync-session.mjs: replace `guardDatabase(undefined)` in the index-existing block with a direct env read (bypass the guard) | KILLED: the refusal-matrix test and the one-guard source test fail (22 pass, 2 fail) |
| C4 | `indexExistingRows`: drop the `recordIndexFailure(...)` call | KILLED: the failure-recorded test and the real-Mongo test fail (9 pass, 2 fail) |
| C4 | sync-session.mjs catch: `if (connected && INDEX) await recordIndexFailure` -> `if (false) ...` | first SURVIVED (24 pass, 0 fail): no test reached the sync-path call. Added a source-level assertion in db-guard-paths.test.mjs (commit 8f52d32d); re-run: KILLED (23 pass, 1 fail) |
| C2 | `assertIndexComplete`: drop the `expectedTurns` count comparison (added after the data review) | KILLED: the partial-index tests fail (9 pass, 2 fail) |
| C5, C6 | no code to mutate beyond the above (C5 is the dry-run/Mongo tests themselves; C6 is documentation) | n/a |

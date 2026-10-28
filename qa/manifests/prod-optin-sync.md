# Manifest — prod-optin-sync
**Contract:** none specific (D-204 in docs/DECISIONS.md; qa/gates/d-entry-prod-optin-sync.md; Changes-authorized: scripts/webinar/sync-session.mjs production opt-in only, its tests, docs/GO-LIVE-UBUNTU.md cutover command)
**Goal task:** none
**Date:** 2026-10-28
**Status:** checked-PASS (dual: qa/verdicts/prod-optin-sync.md f42a9bc8 + qa/verdicts/prod-optin-sync.b.md b7ebafb3, cycle 0)
**Fix cycle:** 0
Fix cycle: 0
**Dual check:** required
dual-trigger: prod-write scripts/webinar/sync-session.mjs:167
**Persona walk:** skip (no screen, flow or user type; a CLI guard change)
**Issues addressed:** none (no ledger row opened or closed)
**Executor:** claude-opus-subagent (maker build subagent)
**Executor rationale:** single-file guard change with a precise spec from D-204; edit in place on the existing script and its existing guard-test file.

## Criteria
- C1 With all three parts present (the script passes `allowProduction`, argv has `--i-know-this-is-production`, `MONGODB_DB=lkb_prod`; `MONGO_WORK_DB=lkb_prod`) sync-session takes the production path and proceeds to connect.
- C2 Flag missing -> the existing refusal ("MONGO_WORK_DB must name an isolated work database; production writes refused"), no production line, no Mongo connection.
- C3 `MONGODB_DB` unset, `lkb`, or wrong case -> the same existing refusal, no connection (a `MONGO_WORK_DB` that is not lkb_prod with MONGODB_DB=lkb_prod stays refused by the unchanged work-DB guard).
- C4 The caller part: the script passes `{ allowProduction: true }` to the shared `requireScriptDatabase` (reused, not reinvented); without it the shared guard refuses.
- C5 A non-production work DB behaves exactly as before, with or without the flag (no production line, normal connect attempt).
- C6 The production path logs exactly one `PRODUCTION WRITE ENABLED (D-204)` line.
- C7 `isProtectedWorkDbName` is not weakened (lkb_prod, lkb, global_university_db still protected) and no other script gains the opt-in.
- C8 docs/GO-LIVE-UBUNTU.md carries the cutover command for the two FAILED sessions, marked as a devops step, never run here.

## What changed (all edited in place)
- scripts/webinar/sync-session.mjs: import `PRODUCTION_FLAG`; new `productionOptIn` check at line 167 (flag in argv AND resolved `MONGO_WORK_DB` === `lkb_prod` AND trimmed `MONGODB_DB` === `lkb_prod`); when true, `requireScriptDatabase(process.env, argv, { allowProduction: true })` (the shared helper in scripts/lib/transcript-provenance.mjs, same call shape as mint-key.mjs:50) and one log line; the `else` branch is the previous guard block (same messages, same order), re-indented. Header comment documents the opt-in.
- scripts/webinar/db-guard-paths.test.mjs: 5 tests appended (the real script is spawned against a local TCP listener that never answers, so no database is ever touched).
- docs/GO-LIVE-UBUNTU.md: section "Cutover: reindex the two FAILED sessions in lkb_prod (D-204, devops step)" with dry-run and live commands (sessions 2026-04-21-visa-blueprint-part2-italy-france-nz and 2026-05-08-funding-dreams-loans-forex).
- Not touched: scripts/lib/transcript-provenance.mjs (`isProtectedWorkDbName`, `requireScriptDatabase`), mint-key.mjs, recover-index-attempt.mjs, backfill-document-consent.mjs, any other script. The shared helper also accepts `lkb`; sync-session is stricter by design and enters it only for exactly `lkb_prod` (D-204 text).
- Design note: a testData source is routed to lkb_staging by `resolveWorkDb` before the opt-in check, so it can never match `workDb === "lkb_prod"`; the test "a testData source never takes the production path" is a regression test only, not separately falsifiable.

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Round: 3 files, 8 criteria, est 45 min, single builder, one test file per node --test invocation, no checker dispatch by the builder
slow-plan: each spawned-script test costs 1-3 s of tsx start-up and the file has 18 tests; seven falsifications each re-run the whole file in a copy (about 40 s each), so the round is wall-clock heavy, not large
mutant-cap-raise: one falsification per criterion is mandatory; C2 and C3 each get their own single-part mutant, C6 and C7 one more each; no mutants beyond those seven
Tier: L (production-write capability on an existing script; dual-trigger: prod-write scripts/webinar/sync-session.mjs:167)
Base / checked state: base e99c9011; code commits edf30477, 72c34d7d, 2e4c33f3 on branch wave/prod-optin-sync (the manifest commit follows and touches only qa/).
Affected tests: scripts/webinar/db-guard-paths.test.mjs (18 = 13 existing + 5 new), scripts/lib/script-db-guard.test.mjs (14), scripts/lib/transcript-provenance.test.mjs (15), scripts/lib/turn-timing.test.mjs (7), scripts/webinar/graph/graph-finalize.test.mjs (5), scripts/webinar/vision/plan.test.mjs (5); the last five are unmodified.
Independent review: NOT run by the builder; the checker and the second (dual) checker own review.
Known limits: no live DB, no network, .env never read; the live cutover run is a separate human/devops step. Baseline reds unrelated to this diff: scripts/webinar/graph/graph-retry.test.mjs (2 fail, "TypeScript parameter property is not supported in strip-only mode", needs the tsx loader) and scripts/webinar/validate/validate-session.test.mjs (1 fail, ERR_MODULE_NOT_FOUND packages/ingest/src/source.js); neither exercises the guard block changed here.
Tests[C1]: scripts/webinar/db-guard-paths.test.mjs::"D-204: all three parts (script allowProduction, flag, MONGODB_DB=lkb_prod) take the production path, logged once, then connect"
Tests[C2]: scripts/webinar/db-guard-paths.test.mjs::"D-204: each single missing part keeps the existing refusal, with NO production line and NO Mongo connection" (cases "flag missing", "flag spelled as =true")
Tests[C3]: scripts/webinar/db-guard-paths.test.mjs::"D-204: each single missing part keeps the existing refusal, with NO production line and NO Mongo connection" (cases "MONGODB_DB unset", "MONGODB_DB=lkb", "wrong case", "MONGO_WORK_DB not lkb_prod", "global_university_db")
Tests[C4]: scripts/webinar/db-guard-paths.test.mjs::"D-204 source: the opt-in is the shared requireScriptDatabase with allowProduction, ahead of connect; isProtectedWorkDbName is untouched" plus the C1 behavioural test
Tests[C5]: scripts/webinar/db-guard-paths.test.mjs::"D-204: a non-production work DB is unchanged by the opt-in (no production line, with or without the flag)"
Tests[C6]: scripts/webinar/db-guard-paths.test.mjs::"D-204: all three parts ..." (asserts exactly one PRODUCTION WRITE ENABLED line)
Tests[C7]: scripts/webinar/db-guard-paths.test.mjs::"D-204 source: ..." (isProtectedWorkDbName list literal intact) plus the existing "the real script with MONGO_WORK_DB=lkb exits non-zero ..." and "resolveWorkDb returns only the configured DB ..." tests
Tests[C8]: none automated (docs); verify by reading docs/GO-LIVE-UBUNTU.md section "Cutover: reindex the two FAILED sessions in lkb_prod (D-204, devops step)"
Tests[R1]: scripts/lib/script-db-guard.test.mjs (14), scripts/lib/transcript-provenance.test.mjs (15), scripts/lib/turn-timing.test.mjs (7), scripts/webinar/graph/graph-finalize.test.mjs (5), scripts/webinar/vision/plan.test.mjs (5) - unmodified, green
Pre-check[C1]: 2e4c33f3 node --test scripts/webinar/db-guard-paths.test.mjs -> exit 0, 18 passed t=1 blobs=scripts/webinar/db-guard-paths.test.mjs:5f40f452,scripts/webinar/sync-session.mjs:c7e7a18a
Pre-check[C2]: 2e4c33f3 node --test scripts/webinar/db-guard-paths.test.mjs -> exit 0, 18 passed t=1 blobs=scripts/webinar/db-guard-paths.test.mjs:5f40f452
Pre-check[C3]: 2e4c33f3 node --test scripts/webinar/db-guard-paths.test.mjs -> exit 0, 18 passed t=1 blobs=scripts/webinar/db-guard-paths.test.mjs:5f40f452
Pre-check[C4]: 2e4c33f3 node --test scripts/webinar/db-guard-paths.test.mjs -> exit 0, 18 passed t=1 blobs=scripts/webinar/db-guard-paths.test.mjs:5f40f452
Pre-check[C5]: 2e4c33f3 node --test scripts/webinar/db-guard-paths.test.mjs -> exit 0, 18 passed t=1 blobs=scripts/webinar/db-guard-paths.test.mjs:5f40f452
Pre-check[C6]: 2e4c33f3 node --test scripts/webinar/db-guard-paths.test.mjs -> exit 0, 18 passed t=1 blobs=scripts/webinar/db-guard-paths.test.mjs:5f40f452
Pre-check[C7]: 2e4c33f3 node --test scripts/webinar/db-guard-paths.test.mjs -> exit 0, 18 passed t=1 blobs=scripts/webinar/db-guard-paths.test.mjs:5f40f452
Pre-check[C8]: 2e4c33f3 git diff e99c9011 2e4c33f3 --stat -- docs/GO-LIVE-UBUNTU.md -> exit 0, 1 file changed, 19 insertions(+) t=1
Pre-check[R1]: 2e4c33f3 node --test scripts/lib/script-db-guard.test.mjs; node --test scripts/lib/transcript-provenance.test.mjs; node --test scripts/lib/turn-timing.test.mjs; node --test scripts/webinar/graph/graph-finalize.test.mjs; node --test scripts/webinar/vision/plan.test.mjs -> exit 0, 14+15+7+5+5 passed t=5
Pre-check[T1]: 2e4c33f3 pnpm lint:structure -> exit 0, "lint:structure: OK (10 stages, 0 failed)" t=1
Pre-check[T2]: 2e4c33f3 node scripts/snapshot.mjs --check -> exit 0, "OK: docs/SNAPSHOT.md matches a fresh regeneration (172 lines, budget 200)" t=1
Metrics: builder_min=45 mutants=7 policy=proportional-verification/2026-10-19.17 cycle=0 suite_runs=0 repeat_runs=0 tokens=unavailable

## Red evidence (TDD)
Tests were written before the source edit. Against the base source (e99c9011 sync-session.mjs) `node --test scripts/webinar/db-guard-paths.test.mjs` gave tests 18 / pass 16 / fail 2: the two reds were "D-204: all three parts ... take the production path" and "D-204 source: the opt-in is the shared requireScriptDatabase with allowProduction ...". The refusal and unchanged-behaviour tests pass on the base because they pin today's behaviour. After the edit: 18 pass, 0 fail.

## Falsifications (one per criterion)
Run in a COPY (`git archive` of the committed tree into the scratchpad, node_modules junctions), never the bound worktree. A per-mutation byte backup (`cp -p`) was taken immediately before each single mutation and restored right after it by explicit code on every path (no EXIT trap); `timeout 300` on each run. After each restore `git hash-object <file>` equalled `git rev-parse HEAD:<file>` (fidelity OK for all 7). The copy was then removed (junctions unlinked first); the bound worktree was never edited by a mutation.

| Criterion | falsifying edit (in the copy) | observed (whole db-guard-paths file) |
|---|---|---|
| C1 | `productionOptIn = false && ...` | 17 pass / 1 fail: "all three parts ... take the production path" |
| C2 | drop `process.argv.includes(PRODUCTION_FLAG) &&` | 17 / 1: "each single missing part keeps the existing refusal" |
| C3 | drop `&& process.env.MONGODB_DB?.trim() === "lkb_prod"` | 17 / 1: "each single missing part keeps the existing refusal" |
| C4 | `{ allowProduction: true }` removed from the production call | 16 / 2: "all three parts ..." and "D-204 source ..." |
| C5 | `{ allowProduction: true }` added to the old (non-production) `requireScriptDatabase(guardEnv, ...)` | 16 / 2: "non-production work DB is unchanged" and "each single missing part ..." |
| C6 | duplicate `PRODUCTION WRITE ENABLED (D-204)` console.log | 17 / 1: "all three parts ..." (exactly-one assertion) |
| C7 | remove `"lkb_prod"` from the list in `isProtectedWorkDbName` (scripts/lib/transcript-provenance.mjs) | 12 / 6: includes "D-204 source", "each single missing part", "MONGO_WORK_DB=lkb exits non-zero ..." |

C8 is documentation: no mutation; checked by reading the section.

## How to verify
- `node --test scripts/webinar/db-guard-paths.test.mjs` (18) from the repo root, one file per run; then the Tests[R1] files one per run.
- `pnpm lint:structure` and `node scripts/snapshot.mjs --check` -> exit 0.
- `git diff e99c9011 2e4c33f3 --stat` touches only scripts/webinar/sync-session.mjs, scripts/webinar/db-guard-paths.test.mjs, docs/GO-LIVE-UBUNTU.md.
- Dual check: confirm by reading scripts/webinar/sync-session.mjs:160-180 that the `else` branch equals the base guard block and that the production branch needs flag + `lkb_prod` + `lkb_prod`.

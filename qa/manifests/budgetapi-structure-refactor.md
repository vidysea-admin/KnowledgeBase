# budgetapi-structure-refactor

**Handshake status:** checked-PASS
Fix cycle: 1
Tier: roadmap/CI blocker (ISS-CIFIX-001, lint:structure). Class: pure refactor, no behaviour change, no data write / auth / tenancy logic touched. Umesh chose refactor over raising budgets.
Lane: lane/budgetapi (from 364cb094).

## Scope (apps/api only; packages/ask untouched)
- `apps/api/src/ask/source-context.ts` 308 -> 300-or-less LOC: the passage slicing + lexical scorer block (Span, slices, QUERY_FUNCTION_WORDS, VERB_FORMS, term, passageTokenizer, passageLexicalScorer) moved VERBATIM to new `ask/passage-lexical.ts` and imported. `assertInScope` / `rowProblem` exclusion and scope-check order untouched.
- `apps/api/src` 37 -> 30 files: `ask-arms(.test).ts`, `ask-web-fallback(.test).ts` -> `ask/`; `gws-calendar.ts`, `gws-gmail(.test).ts` -> new `gws/`.
- `apps/api/src/routes` 32 -> 29 files: `compete.ts`, `compete-page.ts`, `compete.test.ts` -> new `routes/compete/`.
- Imports rewired (git mv, rename-detected): apps/api src + tests, scripts/{qa,watch,webinar} importers of gws-*; `docs/intent.md` pointer. Build entry (`src/index.ts`), Dockerfile, compose need no change (paths are not file-specific; build.mjs derives rel paths at build time). Historical DECISIONS/plan entries left (append-only / history).

## Criteria and evidence (node from toolchain)
- lint-loc: the 3 items gone; violations 12 -> 11 (the 11 left are all pre-existing, outside apps/api). lint-dirsize: 5 -> 3 (`apps/api/src`, `apps/api/src/routes` gone; remaining packages/index/src/pipeline, scripts, scripts/lib pre-existing). `lint-loc --all`: same 6 failed stages before and after (loc, dirsize, root, dupes, tracker, dependencies); dependency-cruiser the same 3 errors (esbuild resolve, ask-graph cycle x2), 1006 modules.
- tsc --noEmit -p apps/api: clean (no output).
- `node apps/api/scripts/build.mjs`: built apps\api\dist\server.js (421905 bytes).
- FULL apps/api suite (D2_FIXTURE_PYTHON = main .venv python): before (main tree HEAD) tests 784 / pass 783 / fail 1; after tests 784 / pass 783 / fail 1. The one failure is identical in both: activity-health/router.test.ts "actual producer -> Python first/reclaim/fences -> real production Mongo binding..." ("upload queue operation timeout", pre-existing, environment).
- Touched script importers: calendar-optout-id-space.test.ts 5/5, calendar-attendance.test.mjs 33/33, source-discovery.test.mjs 10/10.
- No test expectations changed (renames + import specifier edits only).

## Cycle 1 (fix of ISS-BUDGETAPI-001 and -002)
- ISS-BUDGETAPI-001: `packages/meeting-bot/src/calendar/state/schedule-state.test.ts:179` now imports `apps/api/src/gws/gws-calendar.ts`. Whole-repo re-grep (packages, scripts, workers, Python, docs, config) for every moved file found no other stale import or path string (remaining hits are comments/history). schedule-state.test.ts 18/18.
- ISS-BUDGETAPI-002: new test in `source-exclusion.test.ts` (foreign tenant + bad timing, foreign session + bad timing, foreign tenant + negative tStart): whole request refused. Order-swap mutant (assertInScope after rowProblem) FAILS it (11 tests, 10 pass, 1 fail); restored, hash == HEAD, test 11/11.
- tsc clean. Full apps/api: 785 tests, 784 pass, 1 fail (same pre-existing activity-health router failure).

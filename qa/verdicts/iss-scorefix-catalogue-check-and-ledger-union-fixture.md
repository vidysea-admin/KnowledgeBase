# Verdict — iss-scorefix-catalogue-check-and-ledger-union-fixture

VERDICT: PASS
Cycle checked: 0
Commit checked: af18248 (lane/scorefix, base 01635f6)

EXPLANATION:
- Diagnosis confirmed. c979bff renamed routes/ask.ts -> routes/ask/ask.ts; `router.post("/ask", requireScope("ask"), ...)` is at routes/ask/ask.ts:37 and is mounted via `app.use(createAskRouter(deps.ask))` in apps/api/src/server.ts:79. Evidence is a real mounted route, not dead code.
- Old vs new derived table (old scraper loaded from 01635f6 into a temp file, deleted): exactly one item changed, C1 MISSING -> REAL (final PARTIAL after the manual lowering). Live routes 33 -> 34; auto 37.7 -> 39.5; adjusted 27.2 -> 28.1 = exactly +0.5/57 (C1 PARTIAL). ask.ts is the only non-test .ts under a routes/ subfolder, so no other item could move.
- Looseness: the new test creates routes/ask/ask.test.ts with a fake route; `POST /ghost` is not scraped. Mutation (test-file exclusion removed) fails that test. Nested stubs.ts is not read as stubs. The recording reader still logs every file read, so the trust check covers the new files. Pre-existing, unchanged: the route regex matches any `.get("...")` in any non-test .ts under routes/, so a helper module could still count. Today there is none; not a regression, not filed.
- .goal, PROGRESS.md, docs: `git diff 01635f6 af18248 -- .goal PROGRESS.md docs` is empty. Manual-above-auto refusal: disabling it fails "a manual upgrade is refused, and the auto verdict stands" and the CLI "--check EXITS 2 on a manual UPGRADE" test.
- Fixture: copyWithRelativeImports follows only ./ and ../ specifiers; bare and node: imports are skipped; a missing target fails loudly with ENOENT. Limits: it cannot see variable dynamic imports or require, and a `../` import leaving the repo would resolve outside the temp dir. The entry script is fixed and in-repo, so this is theoretical (low, file-don't-fix). Assertion unchanged: the diff adds only the helper plus a closure sanity assert. Teeth: `if (first) throw` -> `if (false) throw` in scripts/lib/tracker-audit.mjs makes the test fail; restored, hash equals HEAD.
- Scope: five files (catalogue.mjs, two tests, manifest, lane ledger). No enforcement path touched. lint-dirsize OK. merge-tree against codex/machine-migration-2026-10-09: clean (main's one commit touches only a meeting-bot test).
- Runs: `catalogue-score.mjs --check` exit 0, "OK ... 28.1% of 57". catalogue.test 23/23, catalogue-cli 13/13, ledger-union 28/29 (G4 master clean fails, as expected and untouched).
- Mutations (per-mutation backup, hash-checked restore): recursion removed -> new test fails; test files included -> new test fails; refusal disabled -> two named tests fail.
- ISS-SCOREFIX-001 and -002 marked verified.

ISSUES-WRITTEN: none

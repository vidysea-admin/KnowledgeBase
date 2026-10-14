# Manifest: apitests
Status: ready-for-check
Fix cycle: 0
Lane: lane/apitests (base c3b67350)

## Cause (confirmed)
apps/api/src/ask/source-context.test.ts, "all 23 original + six additional dated sources...": its own inline loader read data/toc-migrated/ with the regex /^\d{4}-\d\d-\d\d-/. Main tree has 31 matching dirs: 29 + the untracked live-ingest dirs 2026-10-13-zoom-webinar-p1/-p2 (validation.json status failed, turns.json, no session.json / session_page.json). Clean lane worktree lacks them, so it passed there.

## Change
- apps/api/src/ask/source-context.test.ts only: inProgressLabel() with the exact semantics of lane/indextests 45076785 (neither session file + validation.json parsing to an object = in-progress, skipped and logged; exactly one file, unparseable or null validation, or no validation.json = stays in corpus, fails loudly). KB_REAL_DATA_DIR override (same name as indextests). No count change: still asserts 29 / 6 / 3424.
- New fixture test (temp dirs): in-progress excluded (failed, passed-awaiting-finalize); one-file, bad/null validation, no validation, stay in; undated ignored.

## Production path
Checked: the real /ask hydrator (apps/api/src/ask/source-context.ts) reads turns via Mongo db, with no directory scan of data/toc-migrated, so half-ingested dirs are not served by it. Not a product bug; test-loader only. (Whether ingest-to-DB loading of such dirs is guarded is out of scope here.)

## Evidence
- main data read-only: KB_REAL_DATA_DIR=C:\Users\product\Desktop\KnowledgeBase\data\toc-migrated; node --test --import tsx src/ask/source-context.test.ts -> pass 24 / fail 0 (previously 31 vs 29).
- Full apps/api suite (D2_FIXTURE_PYTHON set): ℹ tests 874 / pass 874 / fail 0.
- tsc --noEmit -p tsconfig.json: exit 0. lint-loc --all: lint:structure OK (10 stages, 0 failed).
- Real p1/p2 dirs untouched.

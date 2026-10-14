# Manifest: indextests
Status: ready-for-check
Fix cycle: 0
Lane: lane/indextests (base c3b67350)

## Changes
- packages/index/src/pipeline/notes/judge.test.ts: expected route map gains `vision: ["ollama","gemini"]` (added by ollamafirst, pinned by packages/ai/src/vision/chain.test.ts:114). deepEqual kept, not weakened.
- packages/index/src/tree/tree-real-data.test.ts: `isInProgress` (no session.json, no session_page.json, validation.json parses with status != "passed") -> skipped, reported in `inProgress`, logged by assertReadyCorpus. Passed-validation-with-missing-files, unparseable/null validation.json, and partial session files still land in `missing` (fail loudly). `KB_REAL_DATA_DIR` env overrides the data root. Two fixture tests (temp dirs) added; the old `{status:"failed"}` capture-exemption case was removed from the malformed list because that shape is now in-progress by definition (covered by the new test).

## Evidence
- `node --test --import tsx src/tree/tree-real-data.test.ts src/pipeline/notes/judge.test.ts` (packages/index): pass 19 / fail 0
- Full `node --test --import tsx "src/**/*.test.ts"` (packages/index): tests 675, pass 675, fail 0
- tsc --noEmit -p tsconfig.json: exit 0; `node scripts/lint-loc.mjs --all`: exit 0
- Read-only run vs MAIN data (KB_REAL_DATA_DIR=...\KnowledgeBase\data\toc-migrated): pass 8 / fail 1. p1 listed in-progress (validation status "failed"). p2 FAILS: its validation.json is status "passed" (73 turns) but it has no session.json/session_page.json yet, so per the required rule it is corruption-class. Likely finalize pending; re-run once p2 gets session files.

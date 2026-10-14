# Manifest: indextests
Status: ready-for-check
Fix cycle: 0
Lane: lane/indextests (base c3b67350)

## Changes
- packages/index/src/pipeline/notes/judge.test.ts: expected route map gains `vision: ["ollama","gemini"]` (added by ollamafirst, pinned by packages/ai/src/vision/chain.test.ts:114). deepEqual kept, not weakened.
- packages/index/src/tree/tree-real-data.test.ts (refined per coordinator): a dir with NEITHER session.json NOR session_page.json (and a parseable validation.json object) is IN-PROGRESS whatever its status: skipped, listed in `inProgress` as "<dir> (validation failed)" or "<dir> (validated, awaiting finalize)", logged. Exactly one session file, or an unparseable/empty one, still lands in `missing` (fails loudly). Valid capture-only dirs are still classified captureOnly first. `KB_REAL_DATA_DIR` env overrides the data root. Fixtures cover: neither+failed (skip), neither+passed (skip, awaiting finalize), only session.json (fail), only session_page.json (fail), empty/unparseable (fail), both present (load). Two assertions in the capture-exemption test relaxed (missing+inProgress == 1, never captureOnly/completed) since capture-shaped dirs with a non-capture extra are now awaiting finalize.

## Evidence
- judge.test.ts + tree-real-data.test.ts: `node --test --import tsx src/tree/tree-real-data.test.ts`: pass 10 / fail 0
- Full packages/index `node --test --import tsx "src/**/*.test.ts"`: tests 676, pass 676, fail 0
- tsc --noEmit -p tsconfig.json: exit 0; `node scripts/lint-loc.mjs --all`: exit 0
- Read-only run with KB_REAL_DATA_DIR=C:/Users/product/Desktop/KnowledgeBase/data/toc-migrated: pass 10 / fail 0; logged "in-progress ingests skipped (2): 2026-10-13-zoom-webinar-p1 (validation failed), 2026-10-13-zoom-webinar-p2 (validated, awaiting finalize)"

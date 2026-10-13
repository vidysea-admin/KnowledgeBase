# Manifest — sessionloc

**Label:** refactor, no behaviour change
**Contract:** none (pure code motion; no contract criterion touched)
**Goal task:** none (post-T-040 lint-loc repair)
**Date:** 2026-10-13
**Fix cycle:** 0
**Status:** ready-for-check

## Why
After the T-040 merge, `node scripts/lint-loc.mjs --all` failed: `apps/api/src/indexing/session.ts` was 306 lines against a 300-line budget.

## Change (code motion only)
- New `apps/api/src/indexing/evidence-tuples.ts`: `toEvidenceTuple`, `toCitedItems`, `toQaEntries` (moved verbatim, now exported).
- New `apps/api/src/indexing/chunk-write.ts`: `prepareChunkDocuments`, `writeSessionChunks` (moved verbatim).
- `session.ts` imports them and re-exports `prepareChunkDocuments` / `writeSessionChunks`, so every existing importer and the exported API are unchanged. Two now-unused type imports removed.
- No flag changes, no new behaviour, no test edits.
- session.ts: 306 -> 216 lines.

## Evidence
- apps/api full suite before (D2_FIXTURE_PYTHON=.venv python): ℹ tests 871 / pass 871 / fail 0. After: ℹ tests 871 / pass 871 / fail 0.
- packages/index: ℹ tests 669 / pass 669 / fail 0.
- tsc --noEmit: apps/api exit 0, packages/index exit 0.
- `node scripts/lint-loc.mjs --all`: `lint:structure: OK (10 stages, 0 failed)`, exit 0 (includes the indexing dirsize budget).

## For the checker
Verify the diff is pure motion (moved bodies identical) and that `export {...} from "./chunk-write.js"` preserves the public surface.

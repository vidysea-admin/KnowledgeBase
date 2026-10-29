# Manifest: data-stores-inventory

**Contract:** none (docs lane). Authorization: D-208 item 1 (`qa/gates/d-entry-208.md`), gate `qa/gates/single-db-2026-10-29.md`; target database per D-209 is the existing `lkb_prod`.
**Date:** 2026-10-29
**Fix cycle:** 0
**Status:** docs-lane-ready

## What changed
- `docs/DATA-STORES.md` (new): inventory of every place KB state is persisted. Sections: summary counts, the table (Mongo in `lkb_prod`, other Mongo databases, 34 file stores, 8 compose volumes, in-memory structures), vectorless RAG data, an ordered list of 23 move units with Changes-authorized paths, 14 open questions.
- This manifest.
- No code, schema, config or contract file changed. Nothing was written to Mongo.

## Evidence
- Read-only Mongo probe on the `MONGODB_URL` server (names, counts and one `$bsonSize` only; URL never printed): 148 databases; `lkb_prod` exists with 28 collections and 15 non-empty (sessions 24, sources 24, session_pages 23, turns 3276, chunks 1855, claims 1818, topics 111, jobs 1406, tree_index 1 of 124,312 bytes).
- `node scripts/lint-loc.mjs --all` (pnpm lint:structure): all 10 stages exit 0, including `dependencies` after `pnpm install --offline --frozen-lockfile` in this worktree.
- `node scripts/snapshot.mjs --check`: `OK: docs/SNAPSHOT.md matches a fresh regeneration (183 lines, budget 200)`.
- Line numbers in the doc are pinned to base `63bdc87e`.

## Notes
- Status is `docs-lane-ready`: only docs changed, so no checker verdict is requested by this unit. The coordinator owns any `merged-no-check` flip.
- Probe scripts lived in a private scratch directory and were deleted.

# Manifest — iss-dupesfix-duplicate-export-names
**Issues addressed:** ISS-DUPESFIX-001 (high; filed in qa/issues.dupesfix.jsonl)
**Lane:** lane/dupesfix (base 01635f6). Tier 2: restores a CI stage this week's parallel merges turned red.
**Scope:** pure rename of identifiers + their imports. No logic change, nothing shared, nothing merged.
**Status:** ready-for-check
**Fix cycle:** 0

## BEFORE / AFTER (`node scripts/lint-dupes.mjs`)
- Before: `lint-dupes: FAIL — 5 violation(s)` (Verdict x3, decide, Graph, Spec, hostOnly)
- After: `lint-dupes: OK (1070 unique export(s), 27 unique schema $id(s))`

## Rename table (older/long-established symbol left alone; renamed side was added 2026-10-10/11)
| old | new | file |
|---|---|---|
| Verdict (type) | TileVerdict | packages/core/src/domain/speaker-tile-scan.ts (+ importer speaker-tile-alignment.ts) |
| decide | decideTile | same two files |
| Verdict (interface) | RowVerdict | packages/ingest/src/retention-report/assess.ts (+ importer retention-report.ts) |
| Graph | ImportGraph | packages/ingest/src/retention-report.scan.ts (used only as importGraph's return type; kept exported since an exported function returns it) |
| Spec | LockSpec | packages/meeting-bot/src/calendar/join-rules-lock/join-rules-store-lock-explore.test.ts (test file; strict-record.ts Spec untouched) |
| hostOnly | alertWhoHostOnly | packages/meeting-bot/src/alert-who-command.ts (+ alert-who-command.test.ts) |
Kept as is: ask evaluator.ts Verdict (2026-09-03), db meeting-candidates.ts decide (09-04), index flatten-graph.ts Graph (09-04), ingest strict-record.ts Spec (10-10), send-now-command.ts hostOnly (10-10, send-now-command.test.ts untouched).

## hostOnly comparison: DIFFERENT behaviour, not merged
- alert-who (renamed): accepts unknown; `new URL()`; only `https:`; hostname must match `[a-z0-9.-]{1,253}` (URL parser already lowercases, drops port/userinfo); input over 4096 chars -> undefined.
- send-now (unchanged): string only; regex on any `scheme://`; strips userinfo up to last `@`; accepts any scheme (http, ftp...) and hosts with a port-less authority only by the charset test (host with `:port` fails the charset -> undefined); no length cap; lower-cases.
- Observation for the checker: for `http://zoom.us/x` alert-who yields undefined and send-now yields `zoom.us`; for `https://h:443/` alert-who yields `h`, send-now yields undefined. Both are printed to operators; whether they should converge is a product decision, left for a separate unit.

## Evidence (packages/<pkg>: `node --test --import tsx <files>`; totals before -> after)
- core speaker-tile-alignment{,.lag,.property,.sim}.test.ts: 34/34 pass -> 34/34 pass
- ingest retention-report{,.guards,.nowrite,.property,.safety}.test.ts: 31/31 -> 31/31
- meeting-bot alert-who-command.test.ts: 18/18 -> 18/18
- meeting-bot alert-who-production.test.ts (NOT edited): 4 tests, 2 pass, 2 fail -> 4 tests, 2 pass, 2 fail (known failures, unchanged)
- meeting-bot send-now-command.test.ts 10/10 -> 10/10; send-now.test.ts 28/28 -> 28/28
- join-rules-lock: store-lock-guards 16/16 -> 16/16; store-lock-explore 11/11 -> 11/11
- tsc --noEmit -p tsconfig.json: core exit 0, ingest exit 0, meeting-bot exit 0
- `node scripts/lint-dirsize.mjs`: `lint-dirsize: OK (123 dir(s) within budget)`
- `node scripts/lint-loc.mjs`: FAIL 1, packages/meeting-bot/py/sb_join.py:1142 (budget 300); pre-existing, file untouched; no touched file is flagged
- D-015: ISS-DUPESFIX-001: 1/1 (its recorded reproduction, `node scripts/lint-dupes.mjs`, now exits OK)
- Repo-wide grep (ts/tsx/mjs/js, excluding node_modules) found no other importer of any renamed symbol.

## NOT done
- No shared helper (dependency lint not applicable); no lint script or allow-list edited; alert-who-production.test.ts not touched; dependencies/other stages not run; no unrelated failure fixed (loc sb_join.py).
- Line endings: git warns LF->CRLF on touched files (autocrlf); diff is limited to the renamed lines.

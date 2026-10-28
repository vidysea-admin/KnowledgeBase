# Manifest — ISS-004-tree-index-fixtures
**Contract:** qa/contracts/knowledge-base-schema.md (C6, C7, C8) — reopened by sweep finding ISS-004
**Goal task:** T-001 (regressed by T-004; this restores it)
**Date:** 2026-09-03
**Fix cycle:** 1 of max 3
**Issues addressed:** ISS-004

## What changed
- `schema/fixtures/tree_index.valid.json` — new: a 4-level tenant→year→month→session tree node
  (matches `build_tree.py`'s node_id scheme; session leaf carries `evidence.sessionRef`)
- `schema/fixtures/tree_index.invalid.json` — new: `level: "galaxy"` (not in enum) and
  `children: "not-an-array"` — must be rejected (2 errors)
- No schema or code changes. `schema/tree_index.schema.json` (added in T-004) is now covered by
  the same valid/invalid discrimination check as the other 9 collections.

## How to verify (commands + expected)
- `cd D:\KnowledgeBase && python schema/validate.py` → expected: exit 0,
  "PASS: 10 collection schema(s) validated correctly." with a line
  "OK: tree_index — valid fixture passes, invalid fixture correctly rejected (2 error(s))"
- `ls schema/fixtures | wc -l` → expected: 20

## Actual outputs (from maker's own run)
```
$ python schema/validate.py
OK: claims — valid fixture passes, invalid fixture correctly rejected (1 error(s))
OK: decisions — valid fixture passes, invalid fixture correctly rejected (1 error(s))
OK: orgs — valid fixture passes, invalid fixture correctly rejected (1 error(s))
OK: session_pages — valid fixture passes, invalid fixture correctly rejected (1 error(s))
OK: sessions — valid fixture passes, invalid fixture correctly rejected (3 error(s))
OK: sources — valid fixture passes, invalid fixture correctly rejected (4 error(s))
OK: speakers — valid fixture passes, invalid fixture correctly rejected (2 error(s))
OK: topics — valid fixture passes, invalid fixture correctly rejected (1 error(s))
OK: tree_index — valid fixture passes, invalid fixture correctly rejected (2 error(s))
OK: turns — valid fixture passes, invalid fixture correctly rejected (3 error(s))

PASS: 10 collection schema(s) validated correctly.
exit: 0
```

## Status: checked-PASS
Verdict: qa/verdicts/ISS-004-tree-index-fixtures.md (Cycle checked: 1, commit 1ddadda) — 3/3 criteria; T-001 restored.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree

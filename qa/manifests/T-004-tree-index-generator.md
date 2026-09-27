# Manifest — T-004-tree-index-generator
**Contract:** qa/contracts/tree-index-generator.md
**Goal task:** T-004
**Date:** 2026-09-03
**Fix cycle:** 1 of max 3
**Issues addressed:** none

## What changed
- `schema/tree_index.schema.json` — new: recursive tree-node schema
  (`node_id, title, level, summary, children[]`, optional `evidence.sessionRef`)
- `tree_index/build_tree.py` — new: `build_tree(sessions, session_pages, summarize=None)` —
  pure function, groups sessions by tenant → year → month, one leaf per session, injectable
  `summarize` callable with fallback to `session_page.summary` (network-free by default)
- `tree_index/tree_search.py` — new: `tree_search(tree, node_ids)` — depth-first node-id
  lookup, no reasoning/LLM call inside it (that's the caller's job in T-005)
- `tree_index/test_build_tree.py` — new: 4 runnable tests (grouping/nesting, evidence on
  every session leaf, known/unknown lookup, summarize injection + fallback)

## How to verify (commands + expected)
- `cd D:\KnowledgeBase && python tree_index/test_build_tree.py` → expected: exit 0,
  "PASS: 4/4 test(s) passed."
- `grep -riE "embed|cosine" tree_index/build_tree.py tree_index/tree_search.py` → expected:
  no matches (criterion 3 — no vector-similarity code in this module)
- `python -c "import json, jsonschema; s=json.load(open('schema/tree_index.schema.json')); jsonschema.Draft202012Validator.check_schema(s)"`
  → expected: no exception (schema is a valid Draft 2020-12 schema)

## Actual outputs (from maker's own run)
```
$ python tree_index/test_build_tree.py
PASS: test_grouping_and_nesting
PASS: test_evidence_on_every_session_node
PASS: test_tree_search_known_and_unknown
PASS: test_summarize_injection_and_fallback

PASS: 4/4 test(s) passed.
exit: 0

$ grep -riE "embed|cosine" tree_index/build_tree.py tree_index/tree_search.py
(no output — clean)

$ python -c "...check_schema..."
tree_index.schema.json is a valid Draft2020-12 schema
```

## Status: checked-PASS
Verdict: qa/verdicts/T-004-tree-index-generator.md (commit 222314a) — 8/8 criteria met.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree

# Manifest — T-001-knowledge-base-schema
**Contract:** qa/contracts/knowledge-base-schema.md
**Goal task:** T-001
**Date:** 2026-09-03
**Fix cycle:** 1 of max 3
**Issues addressed:** none

## What changed
- `schema/sources.schema.json` — new: source ingestion record (kind, hash, consent, tenancy)
- `schema/sessions.schema.json` — new: session record with per-stage pipeline status
- `schema/turns.schema.json` — new: raw transcript turn (speaker ref, timestamps, text)
- `schema/speakers.schema.json` — new: alias-based speaker identity (H4) with mandatory evidence[]
- `schema/session_pages.schema.json` — new: synthesized per-session knowledge page, evidence[] required
- `schema/claims.schema.json` — new: atomic claim with status + evidence[] required
- `schema/topics.schema.json` — new: topic entity
- `schema/orgs.schema.json` — new: organization entity
- `schema/decisions.schema.json` — new: decision entity with evidence[] required
- `schema/fixtures/*.valid.json`, `*.invalid.json` — 18 files, one valid + one invalid fixture
  per collection
- `schema/validate.py` — new: loads every `*.schema.json`, validates its valid fixture (must
  pass) and invalid fixture (must fail); exits 0 only if all 9 collections behave correctly

## How to verify (commands + expected)
- `cd D:\KnowledgeBase && python schema/validate.py` → expected: exit 0, "PASS: 9 collection
  schema(s) validated correctly."
- `python -c "import json,glob; [json.load(open(f)) for f in glob.glob('schema/*.schema.json')]"`
  → expected: no exception (every schema file is valid JSON)

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
OK: turns — valid fixture passes, invalid fixture correctly rejected (3 error(s))

PASS: 9 collection schema(s) validated correctly.
```
Exit code: 0

## Status: checked-PASS
Verdict: qa/verdicts/T-001-knowledge-base-schema.md (commit 2ce65d1) — 8/8 criteria met.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree

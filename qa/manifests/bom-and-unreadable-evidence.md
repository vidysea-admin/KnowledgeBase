# Manifest — bom-and-unreadable-evidence

**Contract:** qa/contracts/ingest-indexing-pipeline.md (catalogue-progress-score is not itself a
contract-tracked feature, but this is the standing silent-failure rule the sweep applies to any
touched surface)
**Goal task:** none (ledger-driven unit)
**Date:** 2026-09-07
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** ISS-040

## Why

ISS-040 (filed by the checker while building an attack fixture for the catalogue scorer): a
malformed or BOM-prefixed `preflight.json` was silently skipped by
`scripts/lib/evidence.mjs`'s `try { pre = JSON.parse(...) } catch { continue; }`, so the scorer
quietly fell back to older evidence with no message at all. A UTF-8-BOM-prefixed file (exactly
what Windows PowerShell 5.1's `Out-File -Encoding utf8` produces) reproduced this: `JSON.parse`
throws on the BOM, the run is silently ignored. Fails safe today (the score can only be lower,
never inflated, from stale data) — that's why the checker filed it `low` not `high` — but a
newest legitimate live-verify run that is unreadable for any reason must never look, to a human
reading `docs/PROGRESS.md`, identical to "no such run exists."

## What changed

1. **`scripts/lib/evidence.mjs`, `loadCollectionCounts`**:
   - Strips a leading UTF-8 BOM (`﻿`) from the file's text before `JSON.parse` — the actual
     BOM case from ISS-040's evidence now parses successfully instead of throwing.
   - The `catch` no longer silently `continue`s: it now pushes `{ rel, reason: err.message }`
     onto a new `unreadable` array, still `continue`s past that one candidate (a genuinely
     unparseable file must not crash the whole run — the scorer should still use whatever *is*
     readable), but the failure is now named, not swallowed.
   - `unreadable` is returned from every code path (`dir` absent, `runs.length === 0`, and the
     normal return) so callers always get an array, never `undefined`.
2. **`scripts/catalogue-score.mjs`**: destructures `unreadable` from `loadCollectionCounts` and
   renders one `> **UNREADABLE EVIDENCE — ...**` warning line per unreadable candidate into
   `docs/PROGRESS.md`, in the same list as the existing trust warnings — so a human reading the
   generated doc sees it, not just someone who happens to grep stderr.
3. **`scripts/catalogue.test.mjs`**: two new tests —
   - a BOM-prefixed file with otherwise-valid JSON is parsed correctly and reported in neither
     `unreadable` (proves the fix, not just the symptom).
   - a genuinely malformed (non-BOM) JSON file is named in `unreadable` with a message matching
     `/JSON/i`, while a separate genuinely-good run in the same evidence dir still scores
     normally (proves failing safe: one bad candidate doesn't take down the whole evidence
     lookup, and doesn't get silently forgotten either).

## Evidence

Full suite green after the fix (21/21, `node --test scripts/catalogue.test.mjs`):
```
✔ a BOM-prefixed preflight.json is parsed, not skipped (ISS-040) (48.1001ms)
✔ a genuinely malformed preflight.json is reported, not silently skipped (ISS-040) (42.4224ms)
ℹ tests 21
ℹ pass 21
ℹ fail 0
```

**Mutation-tested with proof of application** (per this project's discipline — never trust a
green suite without proving the test actually exercises the fix):
1. Reverted the BOM-strip line back to `JSON.parse(readFileSync(abs, "utf8"))` (confirmed via
   `grep` that the file content actually changed before running anything).
2. Re-ran the suite: **20/21 pass, 1 fail** — exactly the new
   `"a BOM-prefixed preflight.json is parsed, not skipped"` test reddened
   (`TypeError: Cannot read properties of null (reading 'chunks')`, because with the mutation
   the BOM file is silently skipped again and `counts` reverts to `null`). No other test was
   affected — the mutation is isolated to exactly the behavior it should break.
3. Restored the real fix from a pre-mutation backup, re-ran: back to 21/21 green.

`node scripts/catalogue-score.mjs` re-run after the fix: `docs/PROGRESS.md` unchanged (20.2%
adjusted / 28.9% machine-derived, 57 features) — no diff, because the real `qa/evidence/`
directory has no unreadable candidates today; this unit only changes behavior for the failure
case ISS-040 named, not the current happy path.

## How to verify (checker)

1. Read `scripts/lib/evidence.mjs`'s `loadCollectionCounts` — confirm the BOM strip and the
   `unreadable` array exist and are returned on every path.
2. Run `node --test scripts/catalogue.test.mjs` — 21/21 green.
3. Reproduce the mutation test yourself: comment out or revert the BOM-strip line, re-run the
   suite, confirm exactly the two new ISS-040 tests (or at least the BOM one) redden, then
   restore.
4. Confirm `node scripts/catalogue-score.mjs` still runs clean and produces no diff to
   `docs/PROGRESS.md` (proves this unit didn't change today's score, only the failure-mode
   behavior).
5. Ledger: ISS-040 should move to `fixed` with `fixed_date` set, citing this manifest.

## Risk / rollback

Pure code change, reversible by `git revert`. No production data touched (this unit, unlike
`orphaned-scratch-tenant-cleanup`, is code-only).

**Status: checked-PASS**

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree

# Manifest — ISS-245: demo:live opener accountability (2026-09-21)

Status: checked-PASS (see qa/verdicts/iss-245-opener-accountability.md)
Fix cycle: 0

**Unit:** the approved two-file plan (gate iss-245-multifile-plan ANSWERED A 2026-09-21).

## What changed (the two approved files only)
1. `scripts/demo-live.mjs` — `openPages()` awaits every opener and returns `{path,url,error}`
   failures; the CLI exits non-zero printing the exact URL + error when any page fails; the
   checklist prints only after every opener succeeded; `openPages`/`printChecklist`/`PAGES` are
   exported and the CLI runs behind an import.meta.url entry guard (import-safe for tests).
   The 350ms stagger is preserved.
2. `scripts/lint.test.mjs` — 2 regression tests: the opener helper's contract (failure entries
   carry the exact URL + error; success shape observable) and the CLI wiring (failure exits
   BEFORE the checklist can print; no fire-and-forget opener pattern).

## Bonus fix landed in the same session (ISS-256, separate unit, committed 16af160 + 2856302)
While running the lint suite, 3 pre-existing catalogue-cli failures were diagnosed to a REAL
data-integrity finding: a tampered preflight.json (test sentinel 4242 in 12 zero-count
collections) was committed at a17c47b and is the evidence PROGRESS.md cites. Restored (12 keys
zeroed, reconciles 24/24 with summary.md), PROGRESS.md regenerated honestly: the catalogue
score drops from an inflated 44.7% to 28.1% adjusted / 39.5% machine-derived, and A5 drops
from a fake REAL. Filed as ISS-256 (high), fixed + verified.

## Evidence
- `pnpm test:lint`: 76 pass / 0 fail (2 new ISS-245 tests).
- `import('scripts/demo-live.mjs')` is side-effect-free (imports PAGES/openPages/printChecklist).
- `node scripts/demo-live.mjs --up` / demo:live path unchanged for the operator.
- catalogue-cli: 13/13 after the ISS-256 restore.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree

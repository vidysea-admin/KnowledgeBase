# Manifest — tracker-audit-g1-gate

**Contract:** qa/contracts/tracker-integrity.md, criteria C6 (gate exercised, not asserted) and C7
(budget)
**Goal task:** none (ledger-driven unit)
**Date:** 2026-09-07
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** ISS-053

## Why

ISS-053 (filed by the checker, remedy specified verbatim in its `checker_note`): G1 (row-set
parity + status agreement + arithmetic headline) is fully author-controlled and always clearable
in-commit, but `scripts/tracker-audit.mjs` was a standalone script (`pnpm audit:trackers`) never
wired into any gate — the exact drift it detects went unnoticed for weeks precisely because
nothing forced it to run. The checker was explicit that G2 (unverified fixes) and G3 (stale
sweep) must **never** become commit gates — both depend on someone else's later action (a
re-check landing, a sweep being run), and a gate that blocks on someone else acting is a gate
people learn to bypass. Only G1 qualifies.

## What changed

1. **`scripts/tracker-audit.mjs`**: added `--gate g1` (also `--gate=g1`), which runs the full
   `audit()` but restricts the reported/exit-code-driving findings to the `G1`-prefixed ones via
   a new `filterByGate(findings, gate)` helper. Without `--gate`, behavior is unchanged (all
   three gates reported, matching contract C6 exactly).
2. **`package.json`**: added `node scripts/tracker-audit.mjs --gate g1` to the `lint:structure`
   chain, between the SNAPSHOT freshness check and the dependency-cruiser pass.
3. **Structural refactor, forced by the repo's own `lint:dirsize` budget (30 files per
   directory, non-recursive per dir)**: writing a real test file for the new `--gate` logic
   would have pushed `scripts/` to 31 files. Rather than skip coverage or violate the budget,
   split `scripts/tracker-audit.mjs` the same way `scripts/catalogue-score.mjs` already splits
   from `scripts/lib/catalogue.mjs`: the three exported functions (`audit`, `parseGateArg`,
   `filterByGate`) now live in **`scripts/lib/tracker-audit.mjs`** (new), and
   `scripts/tracker-audit.mjs` is now a thin CLI entry point (29 lines) that imports from the
   lib module — same public CLI contract (`node scripts/tracker-audit.mjs [--json] [--gate g1]`,
   same exit codes, same `--json` output shape), zero behavior change for any existing caller.
   The new test file, **`scripts/lib/tracker-audit.test.mjs`**, sits in `scripts/lib/` (8 → 10
   files there, still well under budget) rather than `scripts/`.
4. **`scripts/lib/tracker-audit.test.mjs`** (new, 5 tests): `parseGateArg` reads both `--gate g1`
   and `--gate=g1` forms and returns `null` when absent; `audit()` against a fixture with both a
   G1 row-set mismatch and a G2 unverified-fix produces findings prefixed correctly for each;
   `filterByGate` with gate `"G1"` keeps only G1 findings and drops the G2 one (the actual
   ISS-053 regression this unit closes); `filterByGate` with no gate returns the list unchanged;
   a clean fixture passes both the full audit and the g1-gated audit.
5. **`package.json`**: `test:lint` script's file list updated from `scripts/tracker-audit.test.mjs`
   to `scripts/lib/tracker-audit.test.mjs` (the file's new home).

## Evidence

Full suite green (5/5, `node --test scripts/lib/tracker-audit.test.mjs`; 53/53 across the whole
`pnpm test:lint` chain including this file).

**Mutation-tested with proof of application, TWICE** (once before the file-move refactor was
even complete, to catch a real duplicated-logic gap; once after, to confirm the moved code still
exercises correctly):
1. First pass (pre-move): reverted `filterByGate`'s body to `return findings;` unconditionally
   (confirmed via `grep`/note the file content actually changed). Re-ran the suite: **exactly
   the `"--gate g1 filters out G2/G3 findings"` test reddened**
   (`AssertionError: no G2/G3 finding may leak through the g1 gate filter`). This caught a real
   design gap on the first attempt: the original draft had the test construct its own inline
   `all.filter((f) => f.startsWith(gate))` instead of calling a shared, exported function, so a
   bug in `main()`'s actual filtering logic would NOT have reddened any test — a false-green
   trap. Fixed by extracting `filterByGate` as its own exported function used by both `main()`
   and the test, closing the gap before it could ship.
2. Second pass (post-move, at the new `scripts/lib/tracker-audit.mjs` location): repeated the
   identical mutation on the moved file, confirmed the same single test reddens with the same
   assertion message, restored, re-ran: 5/5 green again. Confirms the refactor did not silently
   lose the fix or the coverage.

`node scripts/tracker-audit.mjs --gate g1` on the real repo: `tracker-audit: OK (gate G1)`, exit
0 — the real trackers have no G1 defect today (this unit adds a gate, it doesn't claim to have
found a new bug). `node scripts/tracker-audit.mjs` (no gate, full audit): still reports the
pre-existing G2 unverified-fixes and G3-adjacent findings unfiltered, confirming the ungated CLI
path is unchanged.

`pnpm lint:structure`: all clean, including the NEW `tracker-audit: OK (gate G1)` line now
appearing in its output — proof the gate is actually wired in, not just documented.
`pnpm test:lint`: 53/53. `node scripts/catalogue-score.mjs`: no diff to `docs/PROGRESS.md`
(20.2%/28.9%, 57 features) — this unit does not touch the catalogue scorer.

## How to verify (checker)

1. Read `scripts/lib/tracker-audit.mjs` — confirm `audit`, `parseGateArg`, `filterByGate` are
   exported there, and `scripts/tracker-audit.mjs` is now a thin wrapper importing from it.
2. Confirm `package.json`'s `lint:structure` script string includes
   `node scripts/tracker-audit.mjs --gate g1`.
3. Run `pnpm lint:structure` on the real repo — confirm it includes a `tracker-audit: OK (gate G1)`
   line and exits 0.
4. Run `node --test scripts/lib/tracker-audit.test.mjs` — 5/5 green.
5. Reproduce the mutation test: in `scripts/lib/tracker-audit.mjs`, revert `filterByGate`'s body
   to unconditionally `return findings;`, confirm via `git diff` the content changed, re-run the
   test file, confirm exactly the g1-filter test reddens, restore, confirm 5/5 green again.
6. Confirm `scripts/` still has ≤ 30 files (`ls scripts/*.mjs scripts/*.ps1 | wc -l` or similar) —
   this is the constraint that drove the refactor in the first place.
7. Ledger: ISS-053 should move to `fixed` with `fixed_date` set, citing this manifest.

## Risk / rollback

Pure code + config change, reversible by `git revert`. `qa/contracts/tracker-integrity.md`
criterion C7 explicitly permits this shape (only the CLI's own LOC budget and `lint:structure`
exit code are constrained, not a single-file requirement) — re-read to confirm before PASS.

**Status: checked-PASS**

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree

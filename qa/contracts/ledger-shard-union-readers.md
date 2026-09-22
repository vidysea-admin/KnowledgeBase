# Contract — ledger-shard-union-readers

**Status:** active
**Authored:** 2026-09-08 by /checker (Mode A, cycle 1) — the manifest asked for it; no contract existed.
**North star:** D-019 (`docs/DECISIONS.md`, Approved-by: Umesh) — *"Every reader … treats the union of
`qa/issues.jsonl` and `qa/issues.*.jsonl` as the ledger, so a per-lane file is a shard rather than a
private copy."*
**Source issues:** ISS-129 (high), ISS-130 (high, partial).

Written from the manifest and from D-019 itself, deliberately BEFORE grading, so the criteria are
what the rule requires rather than what the submission happens to contain.

## Acceptance criteria

- **[C1]** `scripts/lib/tracker-audit.mjs` resolves the ledger as a union: the canonical
  `qa/issues.jsonl` first, then every `qa/issues.<lane>.jsonl`, in a deterministic order.
- **[C2]** Gate **G2** (unverified-fix detection) audits that union, not the canonical file alone.
- **[C3]** Shard order is deterministic across runs, and a test **discriminates** it — i.e. removing
  the ordering step makes a test fail.
- **[C4]** The directory read narrows its `catch` to the one expected outcome (`ENOENT`, "no `qa/`")
  and **rethrows every other error**, and a test **discriminates** it — reverting the narrowing makes
  a test fail. This is the unit's own self-found defect; a fix for a silent failure that no test
  detects is the same silent failure one level up.
- **[C5]** Verified against the **real repository**, not fixtures only: with a lane shard present the
  union's row count, the lane row count, and the visibility of `ISS-C-UNRUN-WRITERS-005` (cited by
  D-020) are all demonstrated, and the shard is removed afterwards.
- **[C6]** No new file in `scripts/`, and the tests live in the file that owns the module under test.
  *(Clarified 2026-09-08, cycle 2 — see the amendment log.)* "Owns the module under test" means the
  module's own directory and its own test file; a further split is acceptable **only** when a
  measured lint budget forbids the single file, the split is stated with its measurement, and the
  seam is a real division of subject rather than a location of convenience. Placement invented from
  an unmeasured budget (ISS-140) remains a violation.
- **[C7]** The second reader, `.claude/hooks/mc-sessionstart.ps1`, is an enforcement path and is
  **left untouched**, with a well-formed HUMAN_GATE record naming the question, the exact change, and
  the options.

## Invariants

- **[I1]** No error-swallowing of the ISS-129 class is introduced **or left standing unreported** in
  the file this unit touches. The unit's stated purpose is that class; the file is its scope.
- **[I2]** Every command pasted in the manifest as evidence is reproducible by a third party at the
  submitted commit, and its **outcome** (not merely its first lines) is stated honestly.
- **[I3]** `.claude/hooks/*`, `docs/DECISIONS.md`, `contracts/`, and ARCHITECTURE.md §2 are unmodified
  by this unit.

## Out of scope / ignore

- The session-start hook fix itself (C7 gates it).
- Creating shards in the `a-speakers` / `b-golden-set` worktrees — bookkeeping, not code (ISS-130).
- A repo-wide reader-completeness guard: it cannot be written while one reader is legitimately
  unfixed behind a human gate. See the verdict's ruling.
- Pre-existing failures elsewhere in `pnpm lint:structure` that this unit did not cause — but see [I2]
  on how they are reported.

## Amendment log

- 2026-09-08 · initial (START) · authored by the checker at the maker's request in the cycle-1
  manifest · no prior contract existed for this unit.
- 2026-09-08 · routine (record edge case) · clarified [C6]'s "the file that owns the module under
  test" to permit a budget-forced split · cycle 1 wrote [C6] against the maker's D-017 rationale,
  which the same check then proved false (ISS-140). Cycle 2 hit the real constraint: the module's
  own test file is 285 non-blank lines against `loc.max` 300 and cannot absorb 112 more. The
  criterion is not weakened — the verdict for this cycle is FAIL on other grounds, so this
  clarification passes nothing — it only stops [C6] forbidding the correct fix for [ISS-140].
- 2026-09-22 · routine (fold routine feedback) · **content-compare integrity** (inbox 2026-09-08,
  merge incident): an integrity check that counts rows and scans duplicate ids cannot see the
  failure where a row SURVIVES under its id while its CONTENT is replaced — exactly what a
  line-oriented merge of an append-only counter-keyed JSONL produces when two lanes allocate from
  one counter (c1efa10: 10 findings gone, every shape gate green). Integrity gates for such
  artifacts must compare CONTENT against merged-in ancestors, not just shape at HEAD; same hazard
  named for docs/FEATURES.jsonl and docs/DECISIONS.md · qa/feedback-inbox.md, folded by Mode B
  sweep

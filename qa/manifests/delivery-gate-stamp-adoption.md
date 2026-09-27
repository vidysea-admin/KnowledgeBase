# Manifest — delivery-gate-stamp-adoption

**Contract:** `qa/contracts/delivery-gate.md` (status `proposed`).
**Goal task:** none (tier 2 — open high issue).
**Date:** 2026-09-09
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** **ISS-205** (high).
**Status:** ready-for-check (cycle 1)

## Why this is a new unit and not a fourth cycle

`delivery-gate-manifest-blindness` STALLED at cycle 3 with ISS-205 open. Both its checker and its
stall diagnosis said the same thing: this is a small regex change that belongs to *the next unit
touching the block*, not to a fourth cycle on a seam that had already had three. D-014's class-based
cap agrees — it sends a non-security seam past two rounds to a gate rather than round N+1.

## The defect, reproduced before anything was touched

```
input   "Cycle checked: `1`"   /   "3 files were affected"
reader returns : 3        that stamp exists in the file? False
```

`\s` **crosses newlines**. Combined with the code-span stripping added in the same cycle — which
erases a value held in a span and leaves a bare label — the reader adopted the *next* line's leading
digit and returned a cycle present nowhere in the file. A gate that invents a cycle number reads a
pending unit as closed, which is the silencing direction.

## What changed

| File | Change |
|---|---|
| `D:/ai_os/.claude/hooks/delivery-gate-stop.ps1` | one token: `Cycle checked:?\s*(\d+)` → `Cycle checked:?[^\S\r\n]*(\d+)` |
| `D:/ai_os/.claude/hooks/tests/hook-fixtures.ps1` | +2 fixtures, both sides of the discrimination |

`[^\S\r\n]` is whitespace-except-newline, so a stamp's value must sit on the stamp's own line.

## Applying the stall diagnosis's own lesson

That diagnosis found **three vacuous fixtures in three consecutive cycles**, all sharing one shape:
each asserted *the outcome expected* rather than *the distinction the fix makes*. It named two
preventives, and this unit is the first to be built under them:

1. **Both sides of the discrimination.** The two fixtures are the *same file*, read by the *same
   gate*, differing **only** in whether the digit sits on the stamp's line — one must read `-1` and
   go pending, the other must read `2` and go unclosed. Neither can pass for the other's reason.
2. **Mutants derived from the diff, not from the design.** The diff is one token, so the mutant is
   that token reverted. The previous cycle reported "6/6 killed" while the mutant that mattered was
   simply never written, because the author did not believe that boundary was load-bearing — and
   the author's belief about which lines matter is exactly the belief under test.

## How to verify

- `powershell -File D:/ai_os/.claude/hooks/tests/hook-fixtures.ps1` → `ALL PASS`, including both
  `ISS-205` checks.
- Safety property over the real corpus, in the hook's own runtime: for every verdict, the reader's
  value must never exceed a stamp present in the file.

## Actual outputs

```
$ powershell -File D:/ai_os/.claude/hooks/tests/hook-fixtures.ps1
  PASS  ISS-205 a digit on the NEXT line is not adopted as the cycle
  PASS  ISS-205 a digit ON the stamp line IS still read
  ALL PASS

$ safety property, shipped PowerShell, over qa/verdicts/*.md
  verdicts=118  higher(silences)=0  equal=112  lower(noisy)=6

$ discrimination probe (current vs fixed)
  value in a span, digit next line     current=3    fixed=-1
  bare label, digit next paragraph     current=7    fixed=-1
  normal stamp (must still read)       current=2    fixed=2
  paren form (must still read)         current=4    fixed=4
```

**Mutation table** — the first entry is derived from the diff; the rest are regression guards for
properties earlier cycles established. D-020: timeout, restore in a `finally`, SHA256-asserted.

| mutation | result |
|---|---|
| **DIFF: revert `[^\S\r\n]*` to `\s*` (the ISS-205 defect)** | **killed** |
| prior: drop inline code-span stripping | **killed** |
| prior: `Status` back to line-anchored only | **killed** |
| prior: `Fix cycle` back to line-anchored only | **killed** |
| prior: take the first `Cycle checked` | **killed** |
| prior: count any verdict as PASS-not-closed-out | **killed** |
| **no-op control** | **clean** |

## Live browser evidence

**Not UI-touching — no surface changed.** The changed paths are
`D:/ai_os/.claude/hooks/delivery-gate-stop.ps1` and
`D:/ai_os/.claude/hooks/tests/hook-fixtures.ps1`: two PowerShell files in a Claude Code hooks
directory. Neither matches any UI-surface pattern in D-024 (`*.tsx|jsx|vue|svelte|html|css`,
`apps/web/**`, `**/routes/**`, `**/pages/**`, `**/components/**`), and no page's data flows through
a Stop hook — it reads a transcript and manifest files and returns a JSON decision.

## Known gaps

1. **ISS-189 — this file's maker predicate is unauthorized at HEAD.** D-025 was its only authorizing
   entry and D-026 withdrew D-025's justification, so `4a71633` stands uncovered. **This unit adds a
   further change to that same file.** I judged shipping the fix better than leaving a
   manufacture-a-stamp defect live in a guard, but it deepens an existing exposure and I am not
   treating that as my call to close. Already covered by the open
   `qa/gates/enforcement-hooks-unauthorized-and-live-regressed.md` — deliberately **not** opening a
   tenth gate for it, since the sweep filed duplicate gates for one file as ISS-214.
2. **The safety property is still the same bound the cycle-3 checker refuted as unsound.** It cannot
   manufacture a stamp, so it remains a usable *upper* bound, but a prose stamp still scores `equal`.
   I am reporting it as corroboration, not as proof, and the real evidence for this unit is the
   discrimination probe and the diff-derived mutant.
3. **`Strip-Code`'s fenced-block branch is still exercised by no fixture** — carried from cycle 3.
4. **Six verdicts read lower than a stamp present in them** (noisy, safe). None is live.

## Note to the checker

Gap 1 is the one I want ruled on. I have just committed a second change to a file whose current
state has no authorizing entry, on the reasoning that a known defect in a live guard is worse than a
governance gap already filed and gated. If you judge that a unit may not touch an unauthorized
enforcement path at all until the Approver rules — even to fix it — say so and FAIL this, because
that is a rule I would rather have explicit than keep deciding case by case.

**Handshake status:** ready-for-check — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree

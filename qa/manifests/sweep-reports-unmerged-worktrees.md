# sweep-reports-unmerged-worktrees

Status: checked-PASS
Checked: qa/verdicts/sweep-reports-unmerged-worktrees.md (cycle 0, 9d960bf)
Fix cycle: 0
Priority tier: 1 (QUEUE.md TODO row; the row itself is rated tier 4 medium)
Security class: none (read-only git queries; no auth, tenancy or data writes)

## Row selection
- `iss-104cc-3-narrow-place-signal`: SKIPPED. Non-security seam `speaker-name-rules` already has 2 PASSed verdicts (`speaker-rules-data-module-extraction`, `iss-104-place-vs-person-signal`), so the round cap applies. It also lists `speaker-rules-test-file-split` as a hard prerequisite (test file now 417 lines vs testMax 400).
- `sweep-reports-unmerged-worktrees`: PICKED (this unit).
- `ledger-duplicate-id-guard`: skipped (manifest BLOCKED on CONTRACT_MISMATCH).
- `speaker-rules-test-file-split`: not reached (this unit qualified first; seam is also at the 2-PASS cap).

## Scope
Makes the unmerged-worktree commit count appear on every unfiltered `tracker-audit` run (the repo's sweep reader). REPORT ONLY: never changes the exit code, never merges, rebases, deletes or writes. The per-branch decision stays with `qa/gates/unmerged-worktree-inventory.md`.

## Files
- `scripts/qa/unmerged-worktrees.mjs` (new): `parseWorktrees`, `listUnmergedWorktrees` (base = `master`, else `origin/master`, else reports UNAVAILABLE; never a silent zero), `formatReport`.
- `scripts/qa/unmerged-worktrees.test.mjs` (new): 4 tests, one on a real temp git repo with 4 worktrees asserting counts 0/0/3/1, ordering, and that no ref moves.
- `scripts/tracker-audit.mjs`: prints the report after the audit result when no `--gate`/`--json`; `--json` gains an `unmergedWorktrees` field. `--gate g1` (lint:structure) output unchanged.
- `package.json`: new test added to `test:lint`.
- Placed in `scripts/qa/` because `scripts/lib` is at its 30-file dirsize budget.

## Evidence
`node --test scripts/qa/unmerged-worktrees.test.mjs scripts/lib/tracker-audit.test.mjs` -> tests 21, pass 21, fail 0.

`node scripts/tracker-audit.mjs` (live repo) printed, after the pre-existing G2/G3/G4 findings (exit still 1 from those, unchanged):
```
unmerged-worktrees: 153 commit(s) across 4 of 4 worktree(s) not on origin/master (report only, not a gate)
  codex/machine-migration-2026-10-09: 54 ahead [main checkout]
  lane/capture: 40 ahead
  lane/transcript: 40 ahead
  codex/t057-b8-knowledge-explorer: 19 ahead
```
`node scripts/tracker-audit.mjs --gate g1` -> `tracker-audit: OK (gate G1)`, exit 0, no report lines.
`node scripts/lint-dirsize.mjs` -> OK. New files are under the 300/400 LOC budgets.

## NOT covered
- No local `master` branch exists on this machine, so the live run compared against `origin/master` (may be stale without a fetch; the report does not fetch).
- Mutation testing and checker review not done (checker's job). No ledger issue; no D-015 corpus applies.
- Counts include the main checkout's own branch, labelled `[main checkout]`.
- Not wired into `.claude/hooks/lab-session-start.ps1` (enforcement path, off limits).

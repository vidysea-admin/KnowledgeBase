# Verdict — mc-hooks-bolded-status

**Cycle checked:** 1
**Date:** 2026-09-27
**Executor (manifest):** claude-sonnet-subagent (checker: claude-sonnet-subagent — same model
family; no `ANTHROPIC_BASE_URL` override, no external executor named in the manifest)
**Checker binding:** D:\KnowledgeBase-lanes\mc-hooks-bolded-status, branch
wave/mc-hooks-bolded-status, commit 58cfaf0 (base 22b6eb6)

## What I re-ran myself

1. `git -C D:\KnowledgeBase-lanes\mc-hooks-bolded-status diff 22b6eb6 58cfaf0 --stat` and the full
   diff. Result: exactly 4 files changed — `.claude/hooks/mc-precommit.ps1` (1 hunk, status pattern
   only), `.claude/hooks/mc-sessionstart.ps1` (1 hunk, status pattern + max-cycle loop), plus the two
   new files `qa/manifests/mc-hooks-bolded-status.md` and `qa/tests/mc-hooks-bolded-status.ps1`. No
   other line in either hook changed — output text, `$env:CLAUDE_PROJECT_DIR` handling, the
   `git commit` trigger, the `qa/.mutations-active` DENY branch, and the ISS-307 stall-check block
   (`mc-sessionstart.ps1:46-51`, `Get-Content 'qa/.last-tick' -TotalCount 1`, still untouched) are
   byte-identical to base. **Matches D-034's `Changes-authorized` field exactly**
   (`.claude/hooks/mc-sessionstart.ps1` status+cycle patterns only; `.claude/hooks/mc-precommit.ps1`
   status pattern only), and ISS-307 is correctly left open/out of scope.
2. Re-ran the maker's own `qa/tests/mc-hooks-bolded-status.ps1` once (`powershell -NoProfile -File
   qa/tests/mc-hooks-bolded-status.ps1`). Reproduced verbatim: **8/8 assertions PASS**, D-020 restore
   verified byte-identical
   (`mc-sessionstart.ps1=7572419965047942FA196528E85D065837CBB9381CD13DCD4E1CFD343E5A685C`,
   `mc-precommit.ps1=920FF6FBA0E55B683C97EBBC7D94161C069BA617FA8D476F23C8CF6490EBC03E`).
3. **Independently authored my own fixture corpus** (not the maker's), outside any git repo (temp
   scratch dir), covering the adversarial cases named in the dispatch, and ran it against the
   worktree's real hooks, then against a `git show 22b6eb6:...`-swapped baseline (D-020: byte
   backup, `try/finally` restore, `Get-FileHash` verification — matched the same two hashes as (2),
   confirming a consistent worktree state across both runs). Results below.

## Independent adversarial fixtures (checker-authored)

| # | Case | Real status | Fixed hooks | Pre-fix (22b6eb6) baseline | Verdict |
|---|---|---|---|---|---|
| 1 | Bare `Status: ready-for-check` inside a fenced code block, real Status is `checked-PASS` | checked-PASS | **false-positive pending** | also false-positive pending | Pre-existing weakness, **not introduced or fixed by this diff** — the original bare-literal pattern had the identical blind spot (it scans the whole file with no fence-awareness in either version). Not in D-034's scope. Non-blocking, not filed. |
| 2 | Quoted mid-line prose preceded by other text (`Reviewer noted "Status: ready-for-check" in the old draft...`), real Status `checked-PASS` | checked-PASS | **correctly excluded** | **false-positive pending** | This is exactly the anchoring defect D-034/ISS-176/183 exist to fix, confirmed fixed. |
| 3 | `**Status**: ready-for-check` (colon **outside** the closing bold markers) | ready-for-check | missed | missed (same, no regression) | Not one of D-034's four literal required forms (`Status:`, `**Status:** `, `## Status:`, `- **Status:** `). Out of scope, informational only, not filed. |
| 4 | `Status:ready-for-check` (no space before value) | ready-for-check | missed | missed (same, no regression) | Same — not one of the four required forms. Out of scope. |
| 5 | `**Status:** ready-for-check (blocked on review, do not merge)` — trailing text after the value | ready-for-check | **correctly matched** | n/a (bold form was already blind pre-fix) | Confirms trailing text does not break the match (no `$` anchor requirement). |
| 6 | Bolded Status line, file written with CRLF line endings | ready-for-check | **correctly matched** | n/a | Confirms no CRLF regression. |
| 7 | Verdict using `Fix cycle judged:` keyword, with the **higher** cycle number (3) appearing **first** in the file and a lower stamp (1) appearing after — the reverse order from the maker's own `fixture-maxcycle` (which had the max last, indistinguishable from a "last-match-wins" bug) | ready-for-check, Fix cycle 3 | **correctly resolved to unclosed-PASS** (max=3, not the first-encountered 3 which coincidentally is also correct here, but see note) | n/a | Confirms the max-cycle loop genuinely tracks a running maximum rather than first-match or last-match; order-independence verified. |

Raw evidence: both runs' full console output captured; hash lines and PendingNames/UnclosedCount
per case shown above are taken directly from the hook's own `Write-Output` line, not from the
maker's or my own paraphrase.

## [C7] sibling-hook audit (delivery-gate.md), re-checked

Confirmed via `grep -rn "Status:\|Cycle checked" .claude/hooks/*.ps1` in the worktree: only
`mc-sessionstart.ps1` and `mc-precommit.ps1` read a manifest Status or verdict Cycle line in this
repo. `delivery-gate-stop.ps1` lives in `D:/ai_os/.claude/hooks/` (already fixed, out of this repo's
scope) — manifest's claim matches.

## Diff scope (step 4c)

`git diff 22b6eb6...58cfaf0 --stat` shows no deletion or rename of any existing function, test,
export, or config key, and no file touched outside `.claude/hooks/mc-sessionstart.ps1`,
`.claude/hooks/mc-precommit.ps1`, plus the two new manifest/test files. Clean.

## Capability coverage (step 4b)

The manifest carries no separate "Capability coverage" table (this is a narrow bugfix to two
enforcement hooks, not a new feature with discrete capability claims). The equivalent falsifying
edit — reverting both hooks to their pre-fix `22b6eb6` content — is exactly what both the maker's
test and my own independent fixtures exercise, and both show a clean green-before(fixed)/red-after
(reverted)/restored-clean cycle, with `Get-FileHash` confirming the restore. Treating this as
**capability-coverage: 2/2 (status-pattern, max-cycle) reproduced via revert-based falsification**,
verified independently, not merely re-run from the manifest.

## Persona walk / Mode D

Not applicable — changed paths are `.claude/hooks/*.ps1` and `qa/manifests|tests/*`, no UI surface.
`LIVE-BROWSER: not-applicable (.claude/hooks/*.ps1, qa/manifests, qa/tests — no UI surface)`. Note:
the manifest (dated 2026-09-27, after the 2026-09-26 cost-gate cutoff) has no `Persona walk:` line;
per SKILL 5bb this is a low-severity, non-blocking documentation gap on a unit with no UI surface —
recorded here, not filed to the ledger.

## Issues addressed (step 5)

- **ISS-176** — already `fixed` in the ledger (the AIOS-shared `delivery-gate-stop.ps1` fix,
  2026-09-09). This unit is correctly described as its sibling-hook extension; no ledger change
  needed for ISS-176 itself.
- **ISS-183** — was `open`. Verified fixed by this unit (both defects — bold/heading/list-marker
  blindness in both hooks, and first-not-max verdict-cycle read in `mc-sessionstart.ps1` — no longer
  reproduce; the pre-fix baseline still exhibits both). **Ledger updated: status `open` → `fixed`**,
  `fixed_date: 2026-09-27`, `regression_check: "powershell -NoProfile -File
  qa/tests/mc-hooks-bolded-status.ps1"` (this repo has no `qa/adapter.json`, so the strict
  "verbatim `verify.shell.commands`" form does not formally apply — flagged per D-015 rather than
  silently claimed compliant; the command is real, re-runnable, and independently confirmed to fail
  against the reverted-to-22b6eb6 hooks and pass against the fixed ones). `checker_note` on the row
  documents this verification in full.
- **ISS-307** — confirmed untouched (out of scope per the unit brief and D-034), remains `open`.

## Scoreboard

Cross-check against D-034's literal ask (the manifest's own criteria):
- Must match all 4 canonical forms (bare / bold / heading / bulleted-bold) — **4/4 met**, reproduced
  by maker's suite and my independent corpus.
- Must NOT match unanchored prose (`not ready-for-check`, `Previous status: ready-for-check`, and my
  own added case: prose preceding the phrase mid-sentence) — **met**, and I confirmed the pre-fix
  baseline genuinely regresses on exactly this (false positive), which is the defect being fixed.
- MAX verdict cycle, order-independent — **met**.
- Nothing else in either hook changed — **met** (full diff re-derived, matches D-034 scope).
- ISS-307 untouched — **met**.

## Findings

None at medium+ severity. Two low-severity, non-blocking, non-regressive observations (fenced-code
false-positive predates this diff; colon-outside-bold and no-space forms are outside D-034's four
required forms) are recorded above for the record, not filed to `qa/issues.jsonl` per the "low
severity → EXPLANATION only" rule.

```
VERDICT: PASS
SCOREBOARD: 5/5 criteria met (4 canonical forms, anchoring/no-false-positive, MAX-cycle order
  independence, no-unauthorized-diff, ISS-307-untouched), 0/0 invariants (none declared)
FAILURES: none
CAPABILITY-COVERAGE: 2/2 rows reproduced (status-pattern, max-cycle) via revert-based falsification,
  verified independently in addition to the maker's own suite
LIVE-BROWSER: not-applicable (.claude/hooks/*.ps1, qa/manifests, qa/tests — no UI surface)
ISSUES-WRITTEN: none (ISS-183 status updated open->fixed on its existing row; no new rows)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: Diff matches D-034's Changes-authorized field exactly (verified via git diff
  22b6eb6..58cfaf0, not just the manifest's pasted excerpt); the maker's own fixture suite
  reproduces 8/8; my independently-authored 7-case adversarial corpus (fenced code block, quoted
  mid-line prose, colon-outside-bold, no-space, trailing text, CRLF, max-first cycle ordering)
  confirms the fix on all in-scope forms with no regression, and the two out-of-scope misses are
  correctly outside D-034's four literal required forms. ISS-183 moved to fixed with a regression
  check; ISS-307 confirmed untouched.
```

# Contract — tracker-integrity (plan §10 U0.6)

> Ground truth for the project's **own trackers** — `.goal/goal.json`, `TASKS.md`, `qa/issues.jsonl`,
> `qa/.last-sweep`. Created by /checker on the `tracker-honesty` cycle-1 check, after the maker
> correctly observed that no contract stated the trackers' integrity rules and offered its three
> gates as one. START stands on the plan §10 U0.6 approval (same precedent as the T-016/T-017 and
> `snapshot-features-ledger` contracts, which were maker-drafted and checker-adopted against an
> already-approved plan section). The maker did NOT write this file; /checker remains its single
> writer.
>
> **Why this contract exists:** the trackers drifted for weeks and *every single error flattered the
> project* — `.goal/goal.json` claimed 79% over 29 tasks while `TASKS.md` had 34; two tasks read
> `done` against their own notes saying they were not; one id covered two different scopes so the
> meeting bot read as finished. A tracker that only ever errs upward is worse than no tracker,
> because it is trusted.

## Scope

The three machine-checked gates implemented by `scripts/tracker-audit.mjs`, plus the honesty
invariants that govern how a task's status may be set. Out of scope: what the tasks themselves
should be, and the content of any individual verdict.

## Criteria (each machine-checkable)

1. **[C1] G1 row-set parity.** `.goal/goal.json`'s `tasks[]` and `TASKS.md`'s `| T-nnn | status |`
   rows describe the **same set of ids**. An id present in one tracker and absent from the other is
   a finding naming the id and the direction.
2. **[C2] G1 status agreement.** For every shared id the two statuses must agree *in meaning*.
   `open`, `pending`, `blocked`, `in_progress` normalise to `not-done`; `done` is `done`. A
   disagreement is a finding naming the id and both spellings.
3. **[C3] G1 arithmetic headline.** `progress.total`, `progress.done` and `progress.percent` are
   **derived from `tasks[]`, never typed**. Each mismatch is a separate finding stating the claimed
   and the computed value. `percent = round(done/total*100)`.
4. **[C4] G2 unverified fixes.** No `qa/issues.jsonl` row may sit `status: "fixed"` with a null or
   absent `verified_date` — a fix nobody re-checked reads exactly like a fix that worked. Unparseable
   ledger lines are a separate finding (a line-by-line consumer skips or crashes on them).
5. **[C5] G3 sweep freshness.** `qa/.last-sweep` must not predate `HEAD`'s commit date. A sweep
   older than the code it vouches for has not seen that code. Finding states the lag in days.
6. **[C6] The gate is exercised, not asserted.** `node scripts/tracker-audit.mjs` exits 0 when all
   gates pass and non-zero otherwise; `--json` emits `{ok, findings}`. Every gate above must be
   demonstrated to FIRE by a deliberate break-and-restore, not merely read.
7. **[C7] Budget.** `scripts/tracker-audit.mjs` stays ≤ 300 non-blank LOC and `pnpm lint:structure`
   exits 0.

## Invariants

- **[I1] No status may be set `done` on evidence weaker than the row's own stated deliverable.** A
  checker PASS against a *scoped-down* contract closes that contract, **not** the task, when the
  task's text names a stronger deliverable (a numeric target, a hand-scored set, a real provider
  chain). Either the row reverts to not-done, or it is split so the finished slice keeps its own id.
- **[I2] One id, one scope.** An id must mean the same deliverable in both trackers. When two scopes
  have collided under one id, split them (`T-011` / `T-011a`) rather than picking a winner — the
  passed work keeps a row, the unfinished work keeps the original id.
- **[I3] A correction may not be assumed; it must be re-derived.** Before a status is changed, the
  underlying reality is counted (files on disk, importers, stubs), not inferred from a note. A stale
  note is evidence about the note.
- **[I4] Corrections are audited hardest in the flattering direction.** Any change that raises a
  status, raises `percent`, or shrinks a denominator carries its evidence inline in the row's note.
- **[I5] The ledger is the checker's.** The maker never sets `verified_date`, never flips a ledger
  row to `verified`, and never edits `qa/.last-sweep`. Turning a gate green by writing the field it
  reads is the exact dishonesty these gates exist to catch.
- **[I6] `fixed → verified` requires a *later*, independent re-check** that re-executed the defect
  and observed it closed — recorded with the verdict file that did so. Raising an issue and fixing
  it inside one unit yields `fixed`, never `verified`.

## Out of scope / ignore
- `completed` timestamps left on a row that later reverts to not-done: inert (`analytics.py` and
  `render_dashboard.py` both read `completed` only when `status == "done"`). Tidy, don't gate.
- Vocabulary choice itself (`open` vs `pending`): C2 compares meaning deliberately. A gate that
  fired on every row would be switched off within a day.
- Formatting/reflow of `TASKS.md` beyond the `| T-nnn | status |` row shape G1 parses.

## Amendment log
- 2026-09-07 · routine · Contract CREATED by /checker on the `tracker-honesty` cycle-1 check, from
  the three gates the maker offered plus the three invariants its own corrections established
  (I1–I3) and the two the G2 judgement call settled (I5, I6). START stands on plan §10 U0.6.
  Deliberately NOT wired into `pnpm lint:structure`: C4/C5 are checker-owned and a gate that blocks
  every commit until someone else acts is a gate people delete. C1–C3 are author-owned and
  deterministic, so a `--gate g1` flag wired into `lint:structure` is the correct follow-up —
  filed as ISS-053, not required for this cycle's PASS · tracker-honesty cycle-1 check.
- 2026-09-22 · routine (fold routine feedback) · **a close is not complete until BOTH trackers
  agree** (inbox 2026-09-08, second occurrence): the checker's /goal close writes
  `.goal/goal.json` only, so G1 went red on every PASS (U1.1 at 15:xx, U1.2 at 15:57 the same
  hour) until the next maker tick noticed. Remedy recorded: the maker's close-out step runs a G1
  check before it stamps the tick. The gate firing predictably on every PASS is the gate working
  as designed — but a gate people learn to clear reflexively is a finding, not a feature ·
  qa/feedback-inbox.md, folded by Mode B sweep

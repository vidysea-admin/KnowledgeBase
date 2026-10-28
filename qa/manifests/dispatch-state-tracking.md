# Manifest — dispatch-state-tracking

**Contract:** none governs the maker-checker handshake mechanics. Checker: judge whether this
belongs under `qa/contracts/loop-safety.md` (which already carries the loop's C7/C8 obligations) or
needs its own. I did not create one — contracts are checker-owned.
**Goal task:** none (tier 2 — open high issue).
**Date:** 2026-09-09
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** **ISS-178** (high).

## Why

The handshake's only signal that a check is outstanding is the **absence** of
`qa/verdicts/<slug>.md`. That absence is byte-identical for two states needing opposite responses:

| state | correct response |
|---|---|
| never dispatched | dispatch it |
| checker died mid-check | re-dispatch, and **do not consume a fix cycle** |

ISS-178's evidence is two Mode A checkers that were live when a Claude process exited. Neither wrote
a verdict; `qa/.last-tick` recorded the dispatch in **prose only**; the session-start hook and sweep
check 1 both read a plain absence and silently re-aged a dead check as a "dispatch gap".

**It happened twice more today, to me.** One checker was killed by a process exit (I re-dispatched
it by luck, having noticed by hand). Then a cycle-1 verdict landed *between* my reconcile read and
my dispatch, so I sent a **duplicate** checker at a unit that already had one. Both are the same
missing signal.

## What changed

- `scripts/lib/dispatch-state.mjs` (new, 132 LOC) — `record` / `clear` / `stateOf` / `sweep`, plus
  the three parsers they need. Five states: `not-pending · complete · not-dispatched · in-flight ·
  checker-died`.
- `scripts/lib/dispatch-state.test.mjs` (new, 14 tests).

**The one design decision worth checking:** state is **derived**, never trusted from the marker. A
matching-cycle verdict always wins, so the module is correct against a checker that never deletes
its marker — an older skill version, a crash after the commit, a different actor. ISS-178's recorded
fix direction has the checker delete on commit; I deliberately did **not** make correctness depend
on that, because a mechanism that requires a second actor to change protocol first is how D-019's
union rule sat unimplemented for a day (see `tracker-audit.mjs`'s ISS-129 note). The marker only
narrows "no verdict yet" into in-flight vs died; it is never evidence a check passed.

`STALE_MS = 20 min`, longer than the slowest Mode A check measured on this repo (846 s, this
morning). Erring long is chosen: a false "died" costs a duplicate dispatch — the exact bug I hit
today — while a false "in-flight" loses the check permanently.

## Two bugs I found in my OWN parser by running it on the live corpus

Both were caught **before dispatch**, only because I ran it over all 114 real verdicts instead of
trusting the unit tests. This is the probe-on-a-known-positive lesson that I failed twice in three
days; this time I applied it.

1. **Counting prose.** The first draft allowed `^[\s\-*#>|`]*`, and read
   `delivery-gate-manifest-blindness` as **cycle 3 when its highest real stamp is 2**. The extra
   match was an indented, wrapped table cell **inside a fenced code block**, in a passage discussing
   this exact class of bug. Leading `\s*` is what admits it.
2. **Swallowing the next line's number.** `\s*` matches newlines, so a wrapped prose line ending
   `…(\`Cycle checked:` captured the digit from the line **below**. That is
   `calendar-auto-join.md:78`. `[ \t]*` rejects it.

The over-correction was equally real and equally measured: a strict column-0 anchor lost the stamp
in **five** genuine verdicts (`eval-baseline-control`, `evaluator-calibration`, `T-012-compete-screen`,
`transcription-empty-result-guard`, and it mis-read `write-guard-enforcement-gaps`). The corpus has
**five** stamp forms, not one. A parser blind to a real form is the same defect as one that counts
prose, pointed the other way — so both directions are now pinned by tests.

## How to verify (commands + expected)

- `node --test scripts/lib/dispatch-state.test.mjs` → 14 pass, 0 fail, 0 cancelled
- corpus check → 113 of 114 verdicts yield a stamp; the one that does not is
  `calendar-auto-join.md`, whose only `Cycle checked` occurrence is prose with the number on the
  next line. **That is a defect in that verdict, not in the parser**, and it is reported rather than
  papered over.
- live sweep → both currently-open manifests classify `complete` (each has a matching-cycle verdict
  awaiting its maker), not `not-dispatched`.

## Actual outputs (from maker's own run)

```
$ node --test scripts/lib/dispatch-state.test.mjs
ℹ tests 14   ℹ pass 14   ℹ fail 0   ℹ cancelled 0

$ corpus scan
verdicts: 114 | no parseable stamp: 1 [ 'calendar-auto-join.md' ]
   delivery-gate-manifest-blindness => 2     (was 3 under the first draft — the prose bug)
   write-guard-enforcement-gaps     => 3     (was 2 — the missed-form bug)
   hybrid-arms-binding              => 3

$ live sweep
   complete  delivery-gate-manifest-blindness cycle=2 verdict=2
   complete  speaker-verbatim-token-boundary  cycle=3 verdict=3
```

**Dogfooded:** this unit's own checker dispatch writes `qa/dispatch/dispatch-state-tracking.json`.
If that checker dies, this is the first unit in the repo whose death is visible on disk.

## Not done, stated rather than hidden

- **Nothing consumes this yet.** The session-start hook and the sweep are the two readers that need
  it, and both are **enforcement paths / checker-owned** — `mc-sessionstart.ps1` needs an
  `Approved-by` entry (the same gate ISS-129 and ISS-189 are already blocked on), and sweep check 1
  is the checker's protocol, not mine to edit. This unit ships the mechanism and one real caller
  (the maker's own dispatch); wiring the readers is a follow-on that the Approver gates.
- **`lint:structure` is RED at HEAD and not because of me.** `docs/SNAPSHOT.md` is stale by 74
  lines. Verified pre-existing by stashing both of my files and re-running the check — still stale.
  I did not regenerate it: it is a generated file fed by other sessions' work, and sweeping their
  content into my commit is not my call. Reported for the sweep.

## Live browser evidence

`Not UI-touching — no surface changed.` Changed paths are `scripts/lib/dispatch-state.mjs` and
`scripts/lib/dispatch-state.test.mjs`; `qa/ui-surfaces.json` lists `scripts/**` under
`genuinely_not_user_facing`, and neither file is imported by `apps/` or `packages/`.

## Status: checked-PASS

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree

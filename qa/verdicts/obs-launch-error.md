# Verdict — obs-launch-error

**Cycle checked:** 0
**Date:** 2026-09-27
**Checker:** fresh Claude Sonnet subagent (this session), read-only toward the artifact
**Bound root:** `D:\KnowledgeBase`
**Checked in:** worktree `D:\KnowledgeBase-lanes\obs-launch-error`, branch `wave/obs-launch-error`,
commit `45ccf9fb2c301ae3e86bef0bb6fecc53d09b7a79`. Not merged to master (working tree clean, `git
status` confirmed, no code left mutated in the bound worktree at any point).
**Contract:** `qa/contracts/meeting-bot-live-capture.md` (ADOPTED). This is an ISS-driven bugfix
unit, not a new-capability unit against a numbered `[C*]`; closest-touched criteria are C3/C9/C10
(recovery/failure-path robustness in `obs-windows.ts`/`obs-guard.ts`, tests-must-exist, no
regression).
**Issue addressed:** ISS-337 (high) — verified genuinely fixed; ledger row flipped `open → fixed`
with `regression_check` set.

## What I re-ran myself

1. `cd packages/meeting-bot && node --test --import tsx src/capture/obs-guard.test.ts` →
   **9 pass, 0 fail**. Matches the manifest's pasted output exactly (including the three ISS-337
   test names and timings within normal variance).
2. `cd packages/meeting-bot && node --test --import tsx "src/**/*.test.ts"` → **254 pass, 0 fail**
   (23.8s). Matches.
3. `cd packages/meeting-bot && npx tsc --noEmit -p tsconfig.json` → exit 0, no output. Matches.
4. `node scripts/lint-loc.mjs` (repo root) → still FAIL, **4** violations, same 4 files/lines as
   pasted, including `obs-windows.ts:359`. Matches. I also ran the FULL composite `pnpm run
   lint:structure` (the contract's C10 wording specifically asks for the composite, not a
   sub-check) — it fails at the same first step (`lint-loc`) with identical output, since the
   script is an `&&`-chain and lint-loc is first. No gap between what the manifest ran and what
   C10 requires.

No discrepancy in any of the four re-runs.

## Falsification (I did not trust the maker's mutation table — I reproduced both rows myself)

Per D-020, I did not mutate the bound worktree. I made a full copy of the worktree (excluding
`.git`) to a scratch dir outside the bound root, confirmed the named test ran **GREEN in the copy
first** (proving the copy is real, not a broken extraction), then mutated the copy only, under a
byte backup + `trap ... EXIT INT TERM ERR` restore + `timeout 150` + `cmp`-verified restore, for
each row. `git status` on the bound worktree stayed clean throughout.

- **Row 1** (delete `child.on("error", (err: Error) => onError?.(err));` in `obs-windows.ts`):
  GREEN before → RED after. 8 pass / 1 fail. The load-bearing assertion this row exists to prove
  did fire: **under this exact mutation, the fake-probe test `ISS-337(a)` stayed GREEN** (it
  supplies its own `onError` callback, so it cannot see the real listener being removed), and only
  the real-`spawn` test `ISS-337: the real launchObsNormally…` went red. This independently
  confirms the manifest's central claim that exporting `launchObsNormally` as a real-spawn test
  seam is load-bearing, not decorative — a fake-probe-only suite would have shipped this defect
  undetected. One nuance: the manifest describes the red failure as `AssertionError:
  errors.length === 1`; what I actually observed is the raw `Error: spawn … ENOENT` surfacing as
  an uncaught exception attributed to the running test (Node's `node:test` runner catches the
  unhandled `error` event mid-test and fails it on that). Same test, same row, arguably a more
  severe symptom than described (an unhandled-exception crash rather than a clean assertion) — not
  a discrepancy I'd fail the unit over, but worth recording precisely.
  Byte-restore confirmed identical to the original (`diff` clean) after every run.
- **Row 2** (delete `if (launchFailure()) return false;` in `connectWithBackoff`): GREEN before →
  RED after, 8 pass / 1 fail, `AssertionError: expected an early give-up, slept 10 times` — matches
  the manifest's pasted output exactly. Byte-restore confirmed identical.

**CAPABILITY-COVERAGE: 2/2 rows independently reproduced by me.**

## Additional falsification I ran on my own initiative (item 4 of the brief)

The manifest's "What changed" also claims the new `setImmediate` yield in `ensureObsReady` "gives
the event loop one turn so an error queued on the last attempt cannot lose the race against the
throw." That claim has **no row** in the capability-coverage table. I deleted that line
(`await new Promise((resolve) => setImmediate(resolve));`) in the same scratch copy and re-ran the
full test file: **all 9 tests still pass.** Tracing why: in the existing `ISS-337(a)` test,
`connectWebsocket()` rejects synchronously (no real I/O delay) and the fake `sleep` now genuinely
yields via a `setTimeout(…, 0)`, so the previously-scheduled `launchObs` failure callback (also a
`setTimeout(…, 0)`, scheduled first) always fires during the *first* sleep's yield — the loop's own
`if (launchFailure()) return false` catches it after exactly one sleep, before the code ever
reaches the post-loop `setImmediate`. The same ordering holds in production: real async spawn
`ENOENT` errors resolve in low milliseconds, dwarfed by the 3000ms real backoff delay, so the
in-loop check is what actually closes the race in practice. **The `setImmediate` is real but inert
for every scenario this unit's tests (or, as far as I can tell, real timing) exercise** — it is
defensive code for a race narrower than "a `setTimeout(...,0)`-shaped error," specifically the case
where the async failure arrives only *after* the entire 10×3s backoff has already been exhausted
without ever observing it, which no test proves can happen and which real ENOENT timing makes
implausible. I do not consider this a fix defect (it's harmless, not misleading) and it doesn't
touch either of the two ledger-recorded reproductions, so I'm not filing it as a FAILURES line —
noting it here as a documented, low-severity gap in the manifest's own "What changed" claims vs. its
capability-coverage table.

## D-015 — independently verified against ISS-337's own ledger row (not the manifest's quote of it)

I read ISS-337's row in `qa/issues.jsonl` myself (not the manifest's paraphrase). Its `fix_direction`
field literally reads: *"(a) point `cfg.obsExe` at a nonexistent path and confirm `ensureObsReady`
rejects with a named error instead of the process crashing; (b) confirm the existing OBS-reachable
happy path is unaffected."* The manifest's quote is verbatim-accurate. Both are covered:
(a) by `ISS-337(a)` (fake probes) **and** the real-spawn test; (b) by `ISS-337(b)` plus the 6
pre-existing `obs-guard` tests, unchanged and still green. No self-authored corpus was substituted
for the ledger's own reproductions — the two ARE the ledger's cases.

## Diff scope (step 4c)

`git diff 7a8835d..45ccf9f --stat`: `obs-windows.ts` (+15/-10 within existing functions),
`obs-guard.ts` (+33/-4), `obs-guard.test.ts` (+64/-1 new tests only), plus the manifest itself.
No file outside "What changed" touched; no existing function, export, test, or config key deleted
or renamed. `launchObsNormally` gained a parameter (optional, backward compatible) and an `export`
keyword; grepped the whole repo for other call sites — none exist besides the new test import, so
the signature widening is risk-free to other consumers.

## The declared LOC-budget regression (item 5 of the brief)

`obs-windows.ts` moved from 352 → 359 non-blank lines (C1 budget 300). `qa/gates/obs-windows-loc-split.md`
is still open with no `Answered:` line — this is the **second** unit in a row to widen this exact,
already-gated violation (the first produced ISS-340, high, precisely because that widening was
disclosed only in commit-message prose with no ledger row). Judgment: **I did not fail the unit
over this.** Unlike the case that produced ISS-340, this widening is disclosed twice — in the
manifest's own "Declared regression, not hidden" section and in an update the maker appended to
the gate file itself — and the decision genuinely belongs to Umesh (the anti-drift rule forbids the
maker from unilaterally splitting the file), not to this bugfix unit. What was still missing was a
**ledger row carrying the current number** (ISS-340 still says 352, not 359), which is exactly the
kind of gap Mode B's liveness/staleness checks are built to catch. I filed **ISS-343** (medium,
`meeting-bot-live-capture`) to carry the current 359 figure and cross-reference ISS-340 rather than
leave it to go stale a second time. I also confirmed the full `pnpm run lint:structure` composite
(not just the `lint-loc` sub-check) fails identically, satisfying C10's "run the full composite"
instruction — it just fails at the same first step either way.

## Live browser / persona (steps 5b/5bb)

Not applicable. Changed paths are `packages/meeting-bot/src/capture/{obs-windows.ts,obs-guard.ts,
obs-guard.test.ts}` — none match a UI-surface pattern, and no rendered page's data flows through
the OBS launch path. Persona walk manifest field: `skip (no UI surface)` — verified true from the
changed paths, not merely taken on trust.

## Ledger updates

- `ISS-337`: `status: open → fixed`, `fixed_date: 2026-09-27`,
  `regression_check: "cd packages/meeting-bot && node --test --import tsx src/capture/obs-guard.test.ts"`
  (verbatim manifest verify command). Not `verified` yet — that requires a later checker run
  confirming the regression check fails with the fix reverted, which I did do (my Row 1/Row 2
  falsifications above ARE that revert-and-confirm-red step for the two isolable behaviors), but
  per protocol I'm moving it to `fixed` on this PASS; a future sweep/unit re-check can promote to
  `verified`.
- `ISS-343` (new, medium, `meeting-bot-live-capture`): tracks the LOC-budget widening to 359 with
  no prior ledger row reflecting the current number; cross-references ISS-340 and
  `qa/gates/obs-windows-loc-split.md`.

## /goal wiring

No `.goal/goal.json` task matches slug `obs-launch-error` (manifest states "Goal task: none
(ledger-driven unit)" — confirmed by grep). Nothing to close.

```
VERDICT: PASS
SCOREBOARD: 4/4 verify commands reproduced identically, 2/2 ledger-recorded reproductions
  (ISS-337 a+b) independently covered, 2/2 capability-coverage rows independently falsified
FAILURES (if any):
- none at >80% confidence
CAPABILITY-COVERAGE: 2/2 rows reproduced (independently, by the checker, in a throwaway copy —
  never the bound worktree)
LIVE-BROWSER: not-applicable (changed paths: packages/meeting-bot/src/capture/obs-windows.ts,
  obs-guard.ts, obs-guard.test.ts — no UI-surface pattern matched)
ISSUES-WRITTEN: ISS-337 (open → fixed), ISS-343 (new, medium)
EXECUTOR: claude-opus-5 (maker, in-session) (checker: claude-sonnet-subagent)
EXPLANATION: A genuine, well-isolated fix for a real crash-on-cold-start defect (ISS-337). Both
  claimed capabilities were independently falsified by the checker (not just re-run from the
  maker's table) in a throwaway copy per D-020, with byte-backup/trap/timeout/cmp discipline; the
  bound worktree was never touched. The one unenumerated claim (the setImmediate race-guard) is
  real but inert under every test and realistic timing scenario — noted, not failed. The declared
  LOC-budget regression (352→359 on an already-open, unanswered gate) is a real, disclosed
  governance debt; I filed ISS-343 to keep the ledger's number current rather than block a sound
  fix on a file-structure decision that is explicitly Umesh's to make.
```

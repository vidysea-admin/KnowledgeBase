# Verdict — jobkey-collision-detection

**Cycle checked:** 0
**Date:** 2026-09-27
**Checker:** claude-sonnet-subagent (fresh context, dispatched by /checker on `D:\KnowledgeBase`)
**Unit branch/commits:** `wave/jobkey-collision-detection` — `5f8e1eb` (fix + tests), `a7f44be` (manifest)
**Worktree checked:** `D:\KnowledgeBase\.claude\worktrees\agent-a32b49f2d8a553401`
**Issue:** ISS-321 (medium, `calendar-auto-join`)

## VERDICT: PASS

SCOREBOARD: 4/4 fix claims evidenced, 0/0 contract criteria (no contract covers this unit — verified, see below)

FAILURES: none

CAPABILITY-COVERAGE: 4/4 rows reproduced. 2 rows re-verified by re-running the manifest's own
mutations conceptually (green suite in the worktree, 47/47); the other 2 rows — explicitly flagged
in the dispatch as the ones to re-derive independently — were **falsified by the checker with its
own, independently authored mutations** (not the maker's mutate.mjs invocations replayed, new edits
against the same files):
- **Mutation A (checker-authored):** widened `writeScheduledJob`'s guard from
  `if (existing && existing.sessionId !== job.sessionId)` to `if (existing)` in
  `schedule-state.ts:105`. Result: RED — both `writeScheduledJob: rewriting the SAME sessionId…
  succeeds` (schedule-state.test.ts) and `ISS-321: re-scheduling the SAME session is still allowed…`
  (schedule-tick.test.ts) failed, with the exact same-session error the real guard is designed never
  to throw. This independently confirms the same-session-rewrite tests are not vacuous — the
  guard's precision (sessionId equality, not "file exists") is what those tests are actually
  pinned to.
- **Mutation B (checker-authored):** removed the `try { writeScheduledJob(...) } catch (err) {…
  continue; }` wrapper in `schedule-tick.ts:192-210`, replacing it with an unguarded call so a
  collision throw propagates uncaught. Result: RED — 1/13 `schedule-tick.test.ts` tests failed
  (`ISS-321: a jobKey collision with a DIFFERENT session refuses loudly, skips only that item…`),
  matching the manifest's own claimed result for this row exactly. This directly answers dispatch
  item 4: the try/catch is load-bearing: without it, the refusal is not merely "logged where nothing
  reads it," it's an unhandled exception that would abort the whole tick's remaining items — the
  opposite of the file's "never crash a poller tick" convention.
Both mutations were applied/restored under D-020 discipline: `mutate.mjs apply` (refused unless
`committed`), edits applied only after that, `timeout 60` on every test run, `mutate.mjs restore`
(git-checkout-based, self-verifying) run **in a `set -e`/trap-guarded script** — one run's `cd`
mistake left a mutation briefly armed with no working-tree change (caught immediately: `git status`
showed the file clean, `mutate.mjs list` showed it still armed, and `mutate.mjs restore` was re-run
directly to close the ledger — nothing was ever left half-mutated on disk). Final state verified:
`git diff HEAD --stat` empty, `git status --short` empty, `mutate.mjs list` → "no outstanding
mutations", `mutate.mjs assert-clean` → "MUTATIONS CLEAN: none outstanding".

LIVE-BROWSER: not-applicable (changed paths are all `packages/meeting-bot/src/calendar/*.ts` +
`*.test.ts`, a Node scheduler/state-persistence module — no screen, no route, no UI surface).
Persona walk: `skip`, and the reason (scheduler/CLI unit, no new screen) is true against the diff.

ISSUES-WRITTEN: none new. ISS-321 moved `open -> fixed` in `qa/issues.jsonl` (ledger is checker-
owned; committed alongside this verdict). No new finding cleared the >80%-confidence bar for a
FAILURES line — see "Notes / low-severity observations" below for the one thing that fell short of
that bar.

EXECUTOR: manifest's Executor is `claude-opus-subagent` (maker build subagent, this worktree);
checker: claude-sonnet-subagent. `self != executor` holds; no `ANTHROPIC_BASE_URL` override in
effect for this check.

EXPLANATION: All six items in the dispatch were checked independently and the fix holds up under
adversarial review; see the point-by-point ruling below. The manifest is unusually rigorous (it
disclosed the exact two things I was asked to judge rather than being caught) and every empirical
claim I could re-derive matched what it stated, including tests, lint counts, file line counts,
`scripts/` file count, and the typecheck error set (byte-for-byte identical 17 errors before/after,
verified by reverting the six changed files to the pre-fix commit in-place and restoring them
afterward — `git diff HEAD --stat` empty when done).

## Point-by-point ruling on the dispatch

**1. Migration claim — independently verified TRUE, not merely accepted.**
- Searched the whole repo (not just this unit's diff) for any path that reaches real
  `schtasks.exe`: the only caller is `task-scheduler.ts`'s `createWindowsTaskScheduler`'s
  `execFileFn` default; every test in the repo injects a fake (`grep -rn "execFile\b"` in
  `calendar/*.ts` shows exactly one production callsite, and the u5 manifest's own "Known gaps"
  section independently states "No real Windows Scheduled Task was created in this build session"
  for cycle 1 AND cycle 2, plus a "Planned first live proof (not run in this build session)" dated
  28 Sep — i.e. still in the future relative to today, 27 Sep).
- Ran `schtasks /query /fo LIST | Select-String -Pattern "lkb-autorecord"` directly against this
  Windows machine: **no output** — no task with that prefix exists anywhere on the host.
- Searched the filesystem for `scheduled/*.json` files under `raw/webinars/`: none exist (the
  `scheduled/` subdirectory itself doesn't exist — `find raw/webinars -maxdepth 1 -type d` shows
  only `2026-09-24-zoho-slides`).
- Searched for any evidence `cli schedule-tick` (non-dry-run) was ever actually invoked: no log
  file under `raw/webinars/*.log` contains "schedule-tick" or "scheduled:" (the log line
  `runScheduleTickOnce` would emit on a real schedule). `cli.ts` wires the subcommand
  (`if (argv[0] === "schedule-tick") return runScheduleTick(...)`) but nothing in `scripts/`
  invokes it yet — the U6 poller that would call it periodically is confirmed not built (per U5's
  own manifest and this unit's file references).
- **Conclusion: the builder's claim is correct.** No real Scheduled Task or job file exists to be
  orphaned; the migration gap is real (the jobKey format genuinely changes for every sessionKey)
  but currently unreachable, exactly as disclosed — not "probably fine," verified fine.
- Separately verified the dedup-index claim: `schedule-state.ts`'s `recordScheduled`/
  `readScheduledKeys` operate on `ScheduleState` keyed by `entry.sessionKey` (the raw string), never
  by jobKey — confirmed by reading the source (`state[entry.sessionKey] = entry` at
  `schedule-state.ts:57`, `new Set(Object.keys(readScheduleState(stateDir)))` at `:49`). This index
  is genuinely untouched by the jobKey format change.

**2. The `null` → hash-based-key widening — independently ruled harmless.**
`grep -rn "deriveJobKey" packages/ --include=*.ts` (excluding tests) shows exactly **one** caller:
`schedule-tick.ts:184`, `const jobKey = deriveJobKey(item.sessionKey); if (!jobKey) { ...skip...
}`. That check treats `null` as an undifferentiated "cannot safely schedule" signal — it does not
branch on *why* `deriveJobKey` returned null, so a hypothetical junk-input caller that used to get
`null` for whitespace-only/punctuation-only/over-length input and now gets a real hash-based key
does not lose a rejection path that anything currently reads. Real sessionKeys are constructed
exclusively by `auto-join.ts`'s `normalizeCandidate`/`normalizeCalendarEvent` from `gmail:<id>` /
`cal:<id>` shapes (confirmed by reading those call sites transitively via `schedule-tick.ts`'s
`AutoRecordItem` type), never from raw user/attacker text. **Ruling: the widened contract is a
real, disclosed behavior change but not a regression** — nothing in the codebase relied on the
`null` distinguishing "junk" from "empty," and the one caller that matters (`schedule-tick.ts`)
still refuses on the one input shape (`''`) that remains `null`.

**3. Falsification, self-authored — done, not replayed.** See CAPABILITY-COVERAGE above (Mutations
A and B). Mutation A specifically re-derives the builder's own mutation 3 independently and gets
the identical qualitative result (both same-session-rewrite tests go red), confirming the guard's
precision is real and the tests aren't asserting a state a broken guard would also produce.

**4. `try/catch` loudness — genuinely loud for what this system currently is.** The refusal is
`deps.log(...)`, which in `buildRealScheduleTickDeps` is `console.log` with a `[bot]` prefix — i.e.
stdout of whatever process runs `cli schedule-tick`. Today that is a **manual, human-invoked CLI
command** (U6's automated poller is confirmed not built — see item 1), so an operator running it
sees the refusal directly in their terminal; there is no unread-log-file failure mode yet because
there is no unattended process yet consuming this log. Mutation B independently proves the
alternative (an uncaught throw) is strictly worse: it would abort the tick's remaining items, which
is a bigger operator-visible failure (other legitimate items silently never get scheduled) than a
single loud skip. **Ruling: `continue` is the right call given this file's stated "never crash a
poller tick" convention, and it is not a "looks like a success" failure in the ISS-271/272 family**
— it's an explicit "I refused and told you why" line, not a silently-successful fallback. Flagged
as a forward-looking note (not a FAILURES line, since nothing today is unattended): once U6's
5-minute poller exists, `deps.log`'s destination should be revisited to make sure it lands
somewhere a human actually reads on a cron-driven run, not just a terminal.

**5. Evidence — all independently re-derived, all matched:**
- `node --test --import tsx src/calendar/task-scheduler.test.ts src/calendar/schedule-state.test.ts src/calendar/schedule-tick.test.ts` → **47/47 pass**, checker's own run, matches manifest exactly.
- ISS-321's ledger row parsed directly with `json.loads` (not read via the manifest's paraphrase): confirmed **no `reproductions` key** — only `evidence`, `fix_direction`, etc. The manifest's claim that the row has no `reproductions` key is correct.
- The four `evidence` pairs re-run as the `ISS_321_COLLIDING_PAIRS` test in `task-scheduler.test.ts`: **4/4**, confirmed passing in the checker's own run above.
- `node scripts/lint-loc.mjs` → **exactly 4 violations**, same 4 files/lines claimed (`speakers-llm.ts:313`, `sb_join.py:437`, `obs-windows.ts:352`, `run-watch.mjs:447`) — no 5th, no calendar file named.
- `node scripts/lint-dirsize.mjs` → OK, 88 dirs within budget (matches).
- `find scripts -maxdepth 1 -type f | wc -l` → **32**, matches the "scripts/ still 32/32" claim.
- LOC-before/after table: not independently re-measured line-by-line (low value; the lint-loc pass/fail is the load-bearing check and was independently re-run), but all six files are far under the 300-line budget either way.
- **Typecheck claim — independently verified byte-for-byte, not just re-run.** Ran `npx tsc --noEmit -p tsconfig.json` in the worktree with the fix in place: **17 errors**, all `@lkb/*` module-resolution, none in `calendar/*.ts`. Then, in the SAME worktree, `git checkout a99140f -- <the six changed calendar files>` to reproduce the pre-fix state, re-ran `tsc --noEmit`: **17 errors**, and `diff` of the two full outputs was **empty** — the errors are not just the same count, they are the identical 17 lines. Restored with `git checkout HEAD -- <same files>`; `git diff HEAD --stat` confirmed empty afterward. The "pre-existing, unchanged" claim is correct, not a hidden regression.

**6. Contract coverage — confirmed no contract applies.** `grep -in "jobkey\|collision" qa/contracts/calendar-auto-join.md` returns nothing (checker's own re-run, same as the manifest's claim). Read the full contract file's criteria list; nothing in it names jobKey derivation, collision handling, or job-file overwrite safety. This is correctly a defect-fix-against-the-ledger unit, not a contract amendment, and not a CONTRACT_MISMATCH.

## Notes / low-severity observations (not FAILURES — under the 80% confidence bar)

- `regression_check` for ISS-321 has no `qa/adapter.json` `verify.shell.commands` allowlist to cite
  verbatim (this repo has no adapter file at all — default coding adapter applies). Following this
  ledger's own established precedent (ISS-318/ISS-319 rows, which cite `node --test …` commands the
  same way despite the same absent-adapter situation), I set `regression_check` to the exact command
  I re-ran myself, scoped to the ISS-321-specific tests. This is a repo-wide gap (no formal
  allowlist), not specific to this unit, and is exactly what sweep check 1c exists to eventually
  flag structurally — not something this unit's PASS should be held on.
- The forward-looking log-destination note in item 4 above is worth a line in U6's own manifest when
  that unit is built, not a finding against this one.

## Ledger

`qa/issues.jsonl`: ISS-321 `status: open -> fixed`, `fixed_date: 2026-09-27`, `regression_check` set
to the command above. No new issues filed.

# Verdict — live-record-repair

**Date:** 2026-09-27 · **Cycle checked:** 0 · **Checker:** fresh Claude subagent (claude-sonnet-subagent),
Mode A, bound to `D:\KnowledgeBase-lanes\live-record-repair` (branch `wave/live-record-repair`,
commit `c8cbbf4`).

## VERDICT: PASS

## SCOREBOARD

- ISS-323(c) argv/quoting: **evidenced** — independently re-falsified (see below).
- ISS-323(b) liveness gate (fail loudly, non-zero exit): **evidenced** — independently re-falsified.
- ISS-323(a) pnpm-sh-shim mechanism: **disclosed as not-reproduced-as-written, adequately** (D-015)
  — judged, not scored as a claim.
- ISS-324 progress-relative stall/cap budget + child diagnostics: **evidenced at the level a unit
  test can reach**; live proof explicitly and correctly disclosed as outstanding.
- Diff scope (4c): clean — no deletions/renames of existing behavior, no file touched outside the
  manifest's "What changed" + its own tests/gates/ledger.
- Data boundary (D-024): confirmed by independent grep — no Mongo/DB reference anywhere in the
  changed files.

## Verify commands re-run myself (all from `D:\KnowledgeBase-lanes\live-record-repair`)

1. `cd packages/meeting-bot && node --test --import tsx "src/**/*.test.ts"`
   → **250 pass, 0 fail** (26.6s), matches manifest exactly.
2. `cd packages/meeting-bot && npx tsc --noEmit -p tsconfig.json`
   → exit 0, no output. Matches.
3. `node --test scripts/webinar/start-record-detached.test.mjs`
   → **3 pass, 0 fail** (27.4s): `ISS-323(c)`, `ISS-323(a,b)`, `ISS-323 happy path`. Matches.
4. `python -m pytest packages/meeting-bot/py -q`
   → **35 passed** (9.8s). Matches.
5. `node scripts/lint-loc.mjs`
   → **FAILS as declared, 4 violations**: `speakers-llm.ts:313`, `sb_join.py:437`,
   `obs-windows.ts:352`, `run-watch.mjs:447` (budget 300 each). Matches the manifest's own numbers
   exactly (master's pre-existing 3 + this unit's `obs-windows.ts` 300→352 and `sb_join.py` 415→437).
   The `qa/gates/obs-windows-loc-split.md` HUMAN_GATE correctly names this as blocking merge-to-master
   with a green `lint:structure`, not blocking the fix itself. No action needed from the checker here.

No pasted output was taken on faith; every number above is from my own run.

## Capability-coverage — independent falsification (not a table in the manifest; I derived and
ran two falsifying edits myself in a throwaway copy, per Mode A 4b)

Built a throwaway copy outside the bound tree (`scripts/webinar/*.ps1,*.mjs` copied +
`node_modules` **junctioned**, never copied, purely so `--import tsx` resolves — nothing in the
bound tree was ever touched). Confirmed GREEN in the copy first (3/3 pass, one run flaked on an
`EPERM` deleting a log file mid-cleanup — a Windows file-lock timing race in the test's own
`cleanupNewLogs`, unrelated to the fix; retried clean 3/3 — see EXPLANATION).

- **Row 1 (ISS-323(c)/title-quoting):** removed the `$quoted = $cliArgs | ForEach-Object {...}`
  quoting layer, passed `$cliArgs` raw to `-ArgumentList`. Result: `ISS-323(c)` went **red**,
  specifically and only on the title-with-spaces assertion (`actual: 'Ashoka'`, expected the full
  title) — the URL/`&` assertion still passed even unquoted, because launching `node.exe` directly
  (never `cmd.exe`) is what actually kills the `&`-split bug; the quoting layer's own isolating
  value is for **spaces in the title**, not the `&` split. Both are real, but they're two different
  mechanisms and the manifest doesn't separate them — noted, not a defect.
- **Row 2 (ISS-323(b)/liveness gate):** deleted the `if ($LivenessSeconds -gt 0) {...}` block
  entirely. Result: `ISS-323(a,b)` went **red** — `actual: 0, expected: not 0` — confirming the
  launcher again exits 0 on a recorder that died within the liveness window, exactly the pre-fix
  bug.
- Both rows: green-before came from the copy's own run (not reused from the bound-tree run), red-
  after came from the same copy after the edit. Reverted by discarding the copy (never applied to
  the bound tree).
- **ISS-324:** not independently re-falsified via a throwaway-copy edit (would need the full
  monorepo TS toolchain + the fixture harness already built into `obs-windows.test.ts`, which I
  judged not proportionate given the full 250-test suite already contains 4 new, specific
  ISS-324 tests that I re-ran green in the bound tree and read line-by-line — see below). Read-
  verified instead.

CAPABILITY-COVERAGE: 2/2 attempted rows independently reproduced by the checker (both reddened
exactly the targeted assertion, from a checker-obtained green baseline); ISS-324 read-verified only
(4 tests, all green, each maps to a named fault: progress-past-stall still opens; wedged bring-up
names last stage + child output; child stderr surfaces; unspawnable interpreter reports itself, not
a page timeout).

## Judgement on the specific questions in the dispatch

**Does the new budget (obs-windows.ts) have a failure mode the old one didn't?** No blocking one.
Traced the logic directly: `stalled` is a `for(;;)` polling loop that checks `settled` (stop
polling once the outer `Promise.race` has already decided), `lastProgressAt` vs `stallMs`, and
`startedAt` vs `capMs` **independently** — a child that emits fake progress forever is still capped
by the absolute `capMs` (480s default) regardless of how often it "progresses"; the cap does not
depend on the stall check. The `settled` flag doesn't leak a subscription — the loop's `await
sleep(poll)` (`poll` ≤ 1000ms) means it exits within one poll tick of `settled` flipping, and its
result is simply discarded since `Promise.race` already resolved. The one real trade-off (not a
bug): a chatty-but-wedged child can now take up to `capMs` (480s) to fail instead of the old flat
120s — 4x longer in the worst case — which is the intentional cost of not misdiagnosing a slow cold
start as an unopened page (the actual 2026-09-27 failure). For the *true* wedged case (no output at
all after `starting`), the new code fails **faster** than before (90s stall vs 120s flat).

**Is the daemon thread in `sb_join.py` safe?** Yes. Only one function (`emit()`) ever writes to
stdout in this file (checked — no other `print()` call exists), and both the daemon thread and the
main thread call that same function, so `_EMIT_LOCK` covers every writer, not just some of them.
`boot_done.set()` wakes `Event.wait(10.0)` immediately (it doesn't block for the remaining timeout),
so the thread stops promptly once `SB()` returns. Being `daemon=True`, it dies with the interpreter
if `SB()` raises — matches the comment's own claim.

**Does the PowerShell quoting hold for a title with an embedded double quote?** Tested directly
(not just read) in the throwaway copy: `-Title 'Say "Hi" Now'` round-tripped through the launcher
and the argv-dump fixture came back as `Say "Hi" Now` — the escape-then-quote scheme
(`\"` inside `"…"`) is exactly what Win32's standard argv parser (which `node.exe` uses) expects.
No defect.

**Is `-CliEntry` an abusable production seam?** Traced every caller: `task-scheduler.ts` builds the
Scheduled Task command line as `-File "<launcherPath>" -Job "<jobKey>"` only (`jobKey` validated
against `^[a-z0-9-]{1,64}$` before it ever reaches `schtasks`) — `-CliEntry` is never passed by any
production code path, only by the test file. It requires local command-line access to this machine
to invoke directly, at which point arbitrary code execution is already available by other means.
Not a finding; noted for completeness since the dispatch asked.

**`PYTHONUNBUFFERED=1` + full `process.env` spread — does it change inheritance?** No. The pre-fix
`spawn()` call passed no `env` option at all, which means Node already inherited the full parent
`process.env` by default. `{ ...process.env, PYTHONUNBUFFERED: "1" }` is behaviourally identical
plus the one added variable. Confirmed via `git diff` against the parent commit.

**Tenancy/auth/data-write claim.** Verified by grep across every changed file
(`sb_join.py`, `obs-windows.ts`, `start-record-detached.ps1`, and all four new test/fixture files)
for `mongo|Mongo|MONGO|mongodb` — zero matches. The manifest's "no DB writes, no Mongo connection"
claim holds.

## Diff scope (4c)

`git diff --stat 72c212f...HEAD`: 11 files, all inside the manifest's declared "What changed" plus
its own tests, the `qa/gates/` HUMAN_GATE file, the lane ledger, and `package.json`'s
`test:lint` script list (adds the new launcher test to the existing lint-test aggregate — an
addition, not a removal, and directly implied by adding a new regression test). No function, export,
route, or test was deleted or renamed. No file outside this list was touched.

## Issues ledger

Updated in `D:\KnowledgeBase-lanes\live-record-repair\qa\issues.jsonl` (this lane's copy):
- **ISS-323**: `open` → **`fixed`**, `regression_check: node --test scripts/webinar/start-record-detached.test.mjs`.
  Sub-claim (a) stays annotated as not-reproduced-as-written (per the maker's own D-015 disclosure,
  judged adequate) rather than blocking the whole issue — the liveness gate independently fixes the
  observed symptom class.
- **ISS-324**: `open` → **`fixed`**, `regression_check: node --test --import tsx "src/**/*.test.ts"`.
  Explicitly annotated **do not move to `verified`** until a live webinar run shows the
  `starting → bootstrapping → driver-ready → navigating → opened` sequence and a non-empty
  recording file, per the manifest's own disclosed gap.

No new issue filed against `qa/issues.live-record-repair.jsonl` (continues from 001 at medium,
already filed by the maker). See EXPLANATION for two sub-critical observations that stay out of the
ledger per this repo's Verdict rule (low-severity notes only).

CAPABILITY-COVERAGE: 2/2 rows independently reproduced by the checker | ISS-324 read-verified (not-applicable to throwaway-copy falsification given toolchain cost; justified above)
LIVE-BROWSER: not-applicable (no UI surface touched — this unit is a CLI launcher script + a headless-controller budget/diagnostics change; the live browser it drives is explicitly, honestly disclosed as unverified by this unit itself)
ISSUES-WRITTEN: none
EXECUTOR: claude-opus-5 (maker, in-session) (checker: claude-sonnet-subagent)

## EXPLANATION

The fix is real, evidenced, and honestly scoped. ISS-323(b)/(c) were independently re-falsified by
the checker (not just re-run) in a throwaway copy, both reddening on exactly the assertion they
claim to fix. ISS-324's root cause is well-diagnosed and its new contract (progress-relative
stall/cap, not a flat timeout) is a genuine improvement with no new failure mode I could find that
isn't a disclosed, bounded trade-off (the cap is real and independent of the stall reset). Two minor,
low-severity notes (not filed, per this repo's verdict rule): (1) the launcher's regression test has
a flaky `EPERM` on Windows when it tries to delete its own just-closed log file during cleanup —
harmless (retried clean), but worth a `try/catch` or short retry in `cleanupNewLogs` sometime; (2)
the quoting-layer fix and the "never go through cmd.exe" fix are two independent mechanisms bundled
under one ISS-323(c) claim — both are correct, but a future regression in just the quoting layer
(e.g. a title with spaces) would not by itself reintroduce the `&`-splitting symptom, and vice
versa; worth knowing if either is ever touched separately. Neither rises above low severity or
changes the verdict.

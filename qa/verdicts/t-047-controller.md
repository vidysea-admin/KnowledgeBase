# Verdict — t-047-controller

**Cycle checked:** 0
**Date:** 2026-09-24
**Checker:** fresh Claude Sonnet subagent, Mode A unit check
**Project root (bound):** D:/KnowledgeBase-lanes/t-047-controller (branch wave/t-047-controller, commit 1e1a84e; base master 1e3c0cd)

## What I re-ran myself

- `pnpm -r --no-bail test` (full workspace, all 11 projects) inside the bound worktree:
  `core 7/7`, `db 14/14`, `ai 74/74`, `ask 50/50`, `index 214/215` (the one failure is
  `tree-real-data.test.ts` ENOENT on `data/toc-migrated/2026-09-24-zoho-...` — confirmed
  pre-existing: it is ledger row **ISS-294**, introduced by commit `fd74864` from the *separate*
  `webinar-bot-live` unit, and this unit's diff (`git diff 1e3c0cd..1e1a84e --stat`) touches zero
  files under `packages/index`), `ingest 97/97`, `meeting-bot 62/62` (independently confirms the
  manifest's pasted 62/62), `apps/api 173/173`, `apps/web` 13 files / 55 tests all green.
  Plain `pnpm -r test` (with pnpm's default bail-on-first-failure) stops at `packages/index`
  before ever reaching `packages/meeting-bot` — confirming the manifest could not have gotten a
  meaningful full-suite signal from that command alone; `--no-bail` was needed to see every
  package in one run, which I did.
- `pnpm lint:structure` (full composite): `lint-loc OK`, `lint-dirsize OK`, `lint-root FAIL — 16
  loose files (budget 15)`. Confirmed pre-existing myself: `git ls-tree -r 1e3c0cd --name-only |
  grep -v /` lists the exact same 16 root files at the base commit — this is ledger row
  **ISS-248**, and this unit added zero root files. Ran every remaining sub-check individually
  (since the composite `&&`-chain stops at the first FAIL): `lint-dupes OK (331 exports, 24
  schema ids)`, `lint-migrations OK (1093 files)`, `snapshot.mjs --check OK`, `lint.test.mjs
  14/14`, `tracker-audit --gate g1,g4 OK`, `depcruise` — no violations (316 modules, 980 deps).
  All match the manifest's pasted output.
- `pnpm --filter @lkb/meeting-bot typecheck` and `pnpm -r typecheck` (all 10 projects) — both
  clean.

## Capability coverage — re-falsified myself in a throwaway copy

Per Mode A step 4b: copied the full worktree (excluding `.git`) via `robocopy /SL` to a scratch
dir outside the bound root, then `pnpm install` + `pnpm approve-builds --all` there (the plain
robocopy of the package alone left `tsx`'s `esbuild` dependency unresolved — a full workspace
install fixed it). Confirmed the copy GREEN first (19/19 across `watchdog.test.ts` +
`controller-state.test.ts`) before any edit, per protocol. Backed up each original file
in the copy, applied each manifest-listed single-hunk edit, re-ran only the named check, then
restored from backup and `cmp`'d the restored file against the actual bound-tree file to prove
the restore was byte-exact:

| row | falsifying edit | result |
|---|---|---|
| finalize-when-dead+recording | `obsRecording ? finalize : stale-cleanup` → unconditional `stale-cleanup` | RED: exactly the 2 named tests fail, 9/11 pass. Matches manifest verbatim. RESTORED-OK, `cmp` clean. |
| clearState-after-finalize | removed `probes.clearState()` in the `finalize` case | RED: exactly the 1 named test fails, 10/11 pass. Matches manifest verbatim. RESTORED-OK, `cmp` clean. |
| corrupt-JSON-never-throws | removed the `try/catch` around `JSON.parse` in `readControllerState` | RED: exactly the 1 named test fails with the expected uncaught `SyntaxError`, 7/8 pass. Matches manifest verbatim. RESTORED-OK, `cmp` clean. |

All three rows reproduced exactly as claimed, isolate the assertion they're named for (no
parsing/import cascade), and the final re-run in the copy after all restores is 19/19 green
again. The two undisclosed-mutation rows (`isPidAlive` behavior, `tickWatchdog` live-controller
no-op) are covered by the reasoning the manifest gives (shared branch structure / direct
two-sided assertion) — accepted, not re-falsified separately, consistent with avoiding redundant
churn on the same lines.

CAPABILITY-COVERAGE: 3/3 falsifiable rows independently reproduced; 2/5 rows accepted on stated
reasoning (not separately mutated); 1 row (`runRecord`/`start-record-detached.ps1` real
integration) is a disclosed, out-of-scope gap per this check's own instructions (no live OBS/
Chrome/console-kill).

## Diff scope (step 4c)

`git diff 1e3c0cd..1e1a84e --stat`: 8 files, all listed in the manifest's "What changed" —
`controller-state.ts`/`.test.ts` (new), `watchdog.ts`/`.test.ts` (new),
`record-commands.ts` (edited — reviewed the full diff: the removed lines are the *same* loop/
stop/finalize logic re-nested inside an outer try/finally, not deleted behavior), `cli.ts`
(2-line addition, dispatch only), `start-record-detached.ps1` (new), the manifest itself. No
existing export, test, or config key was deleted or renamed. No file outside this list was
touched.

## Security/robustness focus (as asked)

- **State file location/contents:** `raw/webinars/.record-state.json` — pid, sessionId, title,
  platform, until, obsOutputDir, startedAt. No credentials. `OBS_WS_PASSWORD` is read from env
  and passed straight to `obs.connect()`; grepped `watchdog.ts` for every `console.*` call — the
  password is never logged.
- **Killed-console vs clean-exit:** `writeControllerState` runs right after join;
  `removeControllerState` is in the outer `finally` wrapping the entire
  loop+stop+finalize sequence in `runRecord` (`record-commands.ts`) — a process that reaches that
  `finally` (clean exit OR an in-process error) removes the file; a process killed out from under
  Node (console closed) never reaches it, leaving the file behind exactly as designed. Verified by
  code trace, consistent with this check's instruction not to spawn/kill a real console.
- **Corrupt/stale state:** `readControllerState` never throws (falsification row 3, above,
  confirms this is load-bearing, not incidental). `isPidAlive`'s signal-0 probe and the "no state
  file" path are both covered and correct in isolation.
- **Watchdog safe when nothing recording:** both "no state" tests (idle, and OBS recording anyway
  with no state) confirm a safe no-op — re-ran these myself in the copy, green.
- **Two gaps found, not disclosed anywhere in the manifest** (filed to
  `qa/issues.t-047-controller.jsonl`, this lane's shard per D-019):
  - **ISS-T-047-CONTROLLER-001 (high):** `runWatchdog`'s real `isObsRecording` probe
    (`watchdog.ts:96-106`) treats an OBS-websocket `connect`/`call` failure **identically** to a
    confirmed "not recording" — both return `false`. Traced deterministically: state present +
    controller dead + OBS merely *unreachable* (not actually stopped) → `decideWatchdogAction`
    returns `stale-cleanup` → `tickWatchdog` calls `clearState()` with **no finalize**. The one
    artifact the whole mechanism depends on is now gone; the next tick sees no state at all and
    is permanently a no-op. This is a silent failure that defeats the T-047 "Done when" criterion
    ("detect OBS still recording with no controller → finalize") in exactly the scenario named —
    a transient websocket hiccup concurrent with a dead controller. No test exercises this real
    probe's error path at all; every existing test injects `WatchdogProbes` fakes and never
    touches the `catch` in the wired implementation.
  - **ISS-T-047-CONTROLLER-002 (medium):** `RecordState` carries only a bare `pid`, no start-time
    or other identity marker. If the OS recycles a dead controller's pid onto an unrelated
    process before the next watchdog tick, `isPidAlive` reports `true` and
    `decideWatchdogAction` returns `noop-active` — permanently masking a genuinely dead
    controller. Not tested, not disclosed.

## Issues addressed

Manifest claims none — correct, nothing in the ledger names T-047/controller/watchdog as already
open.

## Scoreboard

Judging against TASKS.md row T-047 ("run hidden/detached" + "finalize-on-restart watchdog
(detect OBS still recording with no controller → finalize)"), plus `qa/contracts/
meeting-bot-capture.md` (C3 superseded, per standing ruling) as the only currently-adopted
contract (`meeting-bot-live-capture.md`/T-024b remains an open HUMAN_GATE, guidance-only, and its
own Non-goals section explicitly excludes T-047 — consistent with the manifest):

- Detached-launcher clause: MET (script correct by inspection; end-to-end console-kill
  untested, disclosed, out of scope per this check's own instructions).
- Finalize-on-restart watchdog clause: **NOT MET as wired for real use** — the pure decision
  function is correct and well-tested, but the actual `runWatchdog` implementation silently
  fails to finalize on a plausible, undisclosed, untested error path (ISS-T-047-CONTROLLER-001).

VERDICT: FAIL
SCOREBOARD: 1/2 Done-when clauses met, 0/0 invariants (none stated)
FAILURES:
- [T-047 watchdog clause] sev: high · `runWatchdog`'s real OBS-unreachable path clears the
  recovery state file without finalizing, silently defeating the exact recovery this unit exists
  to build · fix: give `isObsRecording` a tri-state (recording/idle/unknown) and never route
  "unknown" into `stale-cleanup`/`clearState` · issue: ISS-T-047-CONTROLLER-001
- [watchdog controller-liveness robustness] sev: medium · bare-pid `isPidAlive` has no defense
  against OS pid reuse, so a recycled pid permanently masks a dead controller · fix: record a
  process start-time or heartbeat alongside the pid and require both to match · issue:
  ISS-T-047-CONTROLLER-002
CAPABILITY-COVERAGE: 3/3 falsifiable rows independently reproduced by checker (see table above)
LIVE-BROWSER: not-applicable (packages/meeting-bot/src/capture/*.ts, cli.ts, and a PowerShell
launcher only — no browser/web surface in this unit's diff)
ISSUES-WRITTEN: ISS-T-047-CONTROLLER-001, ISS-T-047-CONTROLLER-002
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent — independent, no
ANTHROPIC_BASE_URL override)
EXPLANATION: Every re-run I performed (full workspace test suite, full lint:structure, full
typecheck, all three capability-coverage falsifications) matched the manifest's claims exactly,
and the two pre-existing failures (ISS-294, ISS-248) are independently confirmed as pre-existing
via git evidence at the base commit and outside this unit's diff — none of that is in question.
The FAIL rests entirely on a real, traced-not-speculated gap in the production watchdog wiring
(not the pure decision function, which is solid) that the manifest's capability-coverage table
does not mention and no test touches: an OBS-unreachable tick is indistinguishable from a
confirmed-idle tick, and the former destroys the one artifact recovery depends on. This is a
one-function fix (see ISS-T-047-CONTROLLER-001's fix_direction), not a redesign.

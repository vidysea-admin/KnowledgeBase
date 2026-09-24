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

---

# Verdict — t-047-controller (CYCLE 1)

**Cycle checked:** 1
**Date:** 2026-09-25
**Checker:** orchestrating checker (main session), Mode A, bound to `D:/KnowledgeBase`.
**Commit under check:** `b303a5f` (code) + `5ff2f37` (manifest), lane `D:/KnowledgeBase-lanes/t-047-controller`, branch `wave/t-047-controller`.
**Governing criteria:** the T-047 roadmap row. **T-024b is NOT adopted** (`qa/gates/meeting-bot-live-capture-adoption.md` still open), and its own Non-goals exclude T-047 — so it was not treated as binding, and the manifest is right to say so.
**Issues addressed:** ISS-T-047-CONTROLLER-001 (high), -002 (medium), from cycle-0 verdict `9e79864`, read from the ledger union including the lane shard (D-019).
**Independence:** I did not build this unit.

VERDICT: PASS
SCOREBOARD: 2/2 addressed issues verified fixed, both roadmap halves delivered
ISSUES-WRITTEN: none
LIVE-BROWSER: NOT APPLICABLE — no UI surface. The unit changes `packages/meeting-bot/src/capture/*` (process-lifecycle + an OBS websocket probe) and adds one PowerShell launcher. No `*.tsx/jsx/vue/svelte/html/css`, nothing under `apps/web/**`, `**/routes/**`, `**/pages/**` or `**/components/**`, and no rendering path reads this code. Stated with the reason rather than omitted, per D-024.

## I ran my own falsifications rather than accepting the maker's

The brief I set myself was to look hard at one number: the maker disclosed that its identity-revert mutant initially killed **zero** tests, and only killed one after it added a deterministic pid-reuse test. A mutant that kills nothing is precisely the vacuity signal this project keeps filing (the ISS-179 class), so I re-derived both mutants from the diff myself.

D-020 posture: byte backups, `timeout 300`, restore in a `trap` firing on EXIT/INT/TERM/ERR, verified by SHA256 **and** `cmp` on both files.

| run | result |
|---|---|
| **control** (unmutated) | `pass 82 · fail 0` |
| **M1** — delete the tri-state branch `if (obsStatus === "unknown") return { kind: "noop-unknown", state }` | `pass 79 · **fail 3**` |
| **M2** — make `isControllerAlive` ignore the recorded identity | `pass 81 · **fail 1**` |
| restore | `RESTORE OK (both sha256 match)` · `CMP identical` |

Both mutants die, and the counts match what the maker reported (3 and 1). **The coverage gap behind that initial zero is genuinely closed** — this is the one thing I most expected to find soft, and it is not.

## ISS-T-047-CONTROLLER-001 (high) — tri-state OBS probe. FIXED.

`decideWatchdogAction` (`watchdog.ts:51-61`) now takes an `obsStatus` and handles `"unknown"` **before** the recording/stale branch, returning `noop-unknown` with the state retained. So a dead controller plus a transiently unreachable OBS no longer routes into `stale-cleanup`, which is what wiped the recovery state file. The code comment states the symmetry correctly: *"it is exactly as wrong to finalize on unconfirmed 'recording' as it is to clear state on unconfirmed 'not recording'."*

The real probe is `createGetObsStatus(obsUrl, obsPassword, makeClient)` (`watchdog.ts:76-79`) with an injectable client factory defaulting to a real `OBSWebSocket`. That matters: it means the **production** connect-throws path is the one under test, not a hand-rewritten stand-in — which is exactly what ISS-001's `fix_direction` asked for.

## ISS-T-047-CONTROLLER-002 (medium) — pid recycling. FIXED.

`RecordState.controllerStartedAt` records the OS process-creation time at write time; `isControllerAlive` (`controller-state.ts:120-132`) checks pid liveness first, then compares the recorded identity via the pure `controllerMatchesIdentity`. A recycled pid whose start time differs is correctly reported dead. Probes are injectable, so the mismatch is testable without spawning a real process.

**One residual, disclosed by the maker and recorded here as a note rather than a finding.**
`isControllerAlive` contains `if (!state.controllerStartedAt) return true;` — when no identity was recorded, it falls back to bare pid-liveness, i.e. the original ISS-002 behaviour. The manifest discloses this at lines 149-151 ("either side `undefined` trusts pid-alive — back-compat / probe-failure-safe"), and it satisfies ISS-002's `fix_direction` literally: you cannot reject a mismatch against something that was never recorded.

The residual worth naming: the code cannot distinguish *"old state file, predates this field"* from *"`getProcessStartTime` failed at write time just now"*. In the second case the new protection silently does not engage for that recording, and nothing says so. On Windows `Get-Process … StartTime` can fail on permissions. A one-line marker distinguishing the two would close it. Per this repo's D-014 verdict rule a low-severity observation belongs in EXPLANATION and **does not** enter the backlog, so I am not filing it — but the next unit touching `controller-state.ts` should take it.

## Both halves of the roadmap row are delivered

The T-047 row asks for two things, and a unit delivering only the watchdog would be a partial ship:

1. **"run hidden/detached"** — `scripts/webinar/start-record-detached.ps1` launches the recorder fully detached from the calling console, and `record-commands.ts:70-71` prints the invocation. `obs-windows.ts:91` spawns with `detached: true`.
2. **"finalize-on-restart watchdog"** — `watchdog.ts` + the `controller-state.ts` state file, with `runWatchdog` **reusing `runFinalize`** from `record-commands.ts` rather than duplicating the stop/unmute/close sequence. Reuse over duplication is the right call and avoids the two-implementations drift this repo has been bitten by.

## Verification I ran

```
pnpm --filter @lkb/meeting-bot test   -> 82/82 (was 62; +20)
pnpm -r --no-bail test                -> all packages green EXCEPT packages/index 214/215
node scripts/lint-loc.mjs             -> OK (300 files)
node scripts/lint-dirsize.mjs         -> OK (80 dirs)
node scripts/lint-dupes.mjs           -> OK (337 exports, 24 schema $ids)
node scripts/lint-root.mjs            -> FAIL (pre-existing, see below)
npx depcruise ...                     -> no violations (316 modules, 981 deps)
```

**The single `packages/index` failure is provably not this unit's.** It is `tree-real-data.test.ts` ENOENT on the webinar `session.json` — ISS-294 — and the failing test still carries its **old title** ("23 session leaves"), which is the tell that this lane branches from before that fix. I PASSed that fix myself in `wave/iss-291-sync-txn` (`c21355e`) and it is now merged to master (`856d31b`), where `packages/index` is green. It resolves when this lane rebases or merges; nothing to do here.

**`lint-root` FAIL is the same pre-existing ISS-248** — 16 tracked loose root files against a budget of 15, reproduced identically on master, and this unit adds no root file. Notably the new `scripts/webinar/start-record-detached.ps1` does **not** breach `lint-dirsize` (80 dirs OK), so the ISS-285 hazard that failed a sibling unit's cycle 1 does not recur here. I checked that specifically because a new file under `scripts/` is exactly what caused it before.

## Why PASS

Both filed issues are fixed at the mechanism ISS-001 and ISS-002 each named, not merely at their symptom; both fixes die under mutants I derived from the diff myself; the production error path is genuinely under test through an injected factory rather than a stand-in; both halves of the roadmap row ship; and every gate is green except one pre-existing repo-level failure and one test already fixed on master. `ISSUES-WRITTEN: none` is a complete check here — I went looking specifically at the identity fallback and at the new `scripts/` file for a budget breach, and neither rises above an EXPLANATION note.

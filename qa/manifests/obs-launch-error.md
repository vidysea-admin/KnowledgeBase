# Manifest — obs-launch-error

**Contract:** qa/contracts/meeting-bot-live-capture.md (cited explicitly — ISS-341 was filed this
same sweep because `live-record-repair` merged without citing it; not repeating that)
**Goal task:** none (ledger-driven unit)
**Date:** 2026-09-27
**Fix cycle:** 0 of max 3
**Dual check:** no (no `.goal` task with `criticality: critical` for this slug)
**Persona walk:** skip (no UI surface — the diff is three files under `packages/meeting-bot/src/capture/`)
**Issues addressed:** ISS-337 (high)
**Backlog tier:** 2 (open critical/high). Tier 1 empty (0 QUEUE TODO rows); both open criticals
remain not-pullable (ISS-282 paused by Umesh, ISS-104 round-capped at ≥6 non-security PASSes);
ISS-337 is the top freely-buildable high with no gate.
**Executor:** claude-opus-5 (maker, in-session)
**Executor rationale:** a three-file, ~20-line fix in code this session already held in context;
writing a standalone brief for a delegated lane would have cost more than the edit.
**Lane:** worktree `D:/KnowledgeBase-lanes/obs-launch-error`, branch `wave/obs-launch-error`

## What changed

- `packages/meeting-bot/src/capture/obs-windows.ts` — `launchObsNormally` keeps the `ChildProcess`
  instead of discarding it, attaches `child.on("error", ...)` **before** `unref()`, and forwards the
  error to an optional `onError` callback. Also `export`ed purely as a test seam (see "Capability
  coverage" for why a faked callback could not cover that line).
- `packages/meeting-bot/src/capture/obs-windows.ts` (`createRealObsGuardProbes`) —
  `launchObs: (onError) => launchObsNormally(cfg, onError)`.
- `packages/meeting-bot/src/capture/obs-guard.ts` — `ObsGuardProbes.launchObs` is now
  `(onError?: (err: Error) => void) => void`, documented with why a try/catch cannot substitute for
  it (the event is asynchronous).
- `packages/meeting-bot/src/capture/obs-guard.ts` — `connectWithBackoff` takes a `launchFailure`
  accessor and **returns false immediately** once the launch is known to have failed, instead of
  sleeping out 10 × 3 s waiting for a process that was never started.
- `packages/meeting-bot/src/capture/obs-guard.ts` — `ensureObsReady` observes the failure, logs
  `OBS failed to start: <msg>`, gives the event loop one turn so an error queued on the last attempt
  cannot lose the race against the throw, and throws a message naming the spawn error and `OBS_EXE`
  rather than the generic websocket text.
- `packages/meeting-bot/src/capture/obs-guard.test.ts` — a `launchFails` option on `fakeProbes`, the
  fake `sleep` now yields for real, and 3 new tests.

## How to verify (commands + expected)

- `node --test --import tsx src/capture/obs-guard.test.ts` (in `packages/meeting-bot`) → 9 pass, 0 fail
- `node --test --import tsx "src/**/*.test.ts"` (in `packages/meeting-bot`) → 254 pass, 0 fail
- `npx tsc --noEmit -p tsconfig.json` (in `packages/meeting-bot`) → exit 0, no output
- `node scripts/lint-loc.mjs` (repo root) → still FAIL with **4** violations, no new file among them

## Actual outputs (from maker's own run)

```
$ node --test --import tsx src/capture/obs-guard.test.ts
ok ISS-337(a): a spawn failure makes ensureObsReady reject with a NAMED error, not crash (8.67ms)
ok ISS-337(b): the happy path is unaffected - a successful launch still connects normally (0.4161ms)
ok ISS-337: the real launchObsNormally reports a bad obsExe instead of throwing an unhandled event (507.06ms)
tests 9 | pass 9 | fail 0

$ node --test --import tsx "src/**/*.test.ts"
tests 254 | pass 254 | fail 0   (25.2s)

$ npx tsc --noEmit -p tsconfig.json
(no output, exit 0)

$ node scripts/lint-loc.mjs
lint-loc: FAIL - 4 violation(s)
  packages/index/src/pipeline/speakers-llm.ts:313 (budget 300)
  packages/meeting-bot/py/sb_join.py:437 (budget 300)
  packages/meeting-bot/src/capture/obs-windows.ts:359 (budget 300)
  scripts/watch/run-watch.mjs:447 (budget 300)
```

## Measurement against the ledger (D-015)

ISS-337's row records exactly two reproductions, quoted verbatim into the test file:
*"(a) point `cfg.obsExe` at a nonexistent path and confirm `ensureObsReady` rejects with a named
error instead of the process crashing; (b) confirm the existing OBS-reachable happy path is
unaffected."*

- **ISS-337(a): covered**, by two tests rather than one — the fake-probe contract test, and a test
  driving the **real** `spawn` against `C:\definitely-not-here\obs64.exe`.
- **ISS-337(b): covered** — and the 6 pre-existing `obs-guard` tests are unchanged and still pass.
- **2 of 2 recorded reproductions covered, 0 deliberately left open.** No self-authored corpus was
  substituted; the two cases above ARE the ledger's, and the real-spawn test is an addition to them.

## Capability coverage (each new claim -> its isolating falsification)

| capability | the check that covers it | the falsifying edit | observed |
|---|---|---|---|
| A spawn failure reaches a caller instead of killing the process as an unhandled `error` event | `obs-guard.test.ts` "ISS-337: the real launchObsNormally reports a bad obsExe…" — drives the real `spawn` | delete the `child.on("error", (err: Error) => onError?.(err));` line in `obs-windows.ts` | GREEN before: `ok ISS-337: the real launchObsNormally… (507.06ms)`. RED after: `not ok ISS-337: the real launchObsNormally reports a bad obsExe instead of throwing an unhandled event (4.65ms)` → `pass 8 / fail 1`, failing assertion `errors.length === 1` ("the spawn error must be delivered to the callback") — the one the test is named for |
| Once the launch is known to have failed, the guard gives up at once instead of sleeping out the full 10 × 3 s backoff | same file, "ISS-337(a)…" — asserts `calls.sleeps.length <= 2` | delete `if (launchFailure()) return false;` in `connectWithBackoff` | GREEN before: `ok ISS-337(a)… (8.67ms)`. RED after: `not ok ISS-337(a)… (28.04ms)` with `AssertionError: expected an early give-up, slept 10 times` → `pass 8 / fail 1`; again the named assertion, not a parse or import failure |

**The load-bearing observation, stated because it is the whole point of the first row:** under
mutation 1 the *fake-probe* test ISS-337(a) **still passed** (`ok … (3.25ms)`). A test that fakes the
`onError` callback cannot detect the listener being removed — it supplies the callback itself. That
is precisely why `launchObsNormally` was exported and driven against a real `spawn`, and why the
export is a genuine seam rather than convenience. Had only the fake-probe tests existed, this unit
would have reported full coverage of a fix whose central line was never executed.

**Mutation-run safety (D-020):** both mutations ran against byte backups taken first, under a
`trap … EXIT INT TERM ERR` restore, with each test run wrapped in `timeout 150`, and the restore
confirmed by `cmp` — the run printed `RESTORED-VERIFIED`. Neither mutation was committed.

## Live browser evidence

`Not UI-touching — no surface changed.` The changed paths are
`packages/meeting-bot/src/capture/obs-windows.ts`, `obs-guard.ts` and `obs-guard.test.ts`. None
matches a UI-surface pattern (`*.tsx|jsx|vue|svelte|html|css`, `apps/web/**`, `**/routes/**`,
`**/pages/**`, `**/components/**`), and no page's data flows through the OBS launch path.

## Declared regression, not hidden — this unit deepens ISS-340

`obs-windows.ts` went from **352 to 359 non-blank lines** against the C1 budget of 300. It was
already the gated violation: `qa/gates/obs-windows-loc-split.md` is OPEN and unanswered, and
**ISS-340 (high) was filed in this same sweep precisely because D-039 merged past that gate and
disclosed the resulting violation in prose instead of in the ledger.**

So it is stated here rather than repeating that pattern. The trade is deliberate: ISS-337 is an
uncaught exception that kills the controller on the unattended cold-start path — the same path that
cost the Ashoka recording — and a line-count budget is not a reason to leave that in place. The +7
lines are the minimum the fix needs (the retained `ChildProcess`, the listener, and its comment).
The file still needs the split Umesh has been asked about; this unit makes that need slightly more
acute and resolves none of it.

## Status: checked-PASS (cycle 0)

Verdict: `qa/verdicts/obs-launch-error.md` (**Cycle checked: 0**, commit `9a0174f`) — **PASS**.

The checker re-ran all four verify commands (and the full `pnpm run lint:structure` composite, not
just the `lint-loc` sub-check this manifest ran), reproduced **both** capability-coverage mutations
independently in a copy taken outside the bound root, re-read ISS-337's ledger row rather than
trusting the quote above, and confirmed no other call site of `launchObsNormally`/`launchObs` exists.
ISS-337 flipped `open -> fixed`; ISS-343 (medium) filed because ISS-340 still names the stale 352.

### Correction to "What changed" — one claim above is overstated

The bullet crediting the `setImmediate` yield in `ensureObsReady` with closing a race is **not
supported**. The checker deleted that line on its own initiative and all 9 tests still passed: it has
no capability-coverage row, and by the real timing (the in-loop `launchFailure()` check plus a 3000 ms
backoff, against a sub-millisecond async spawn-error latency) there is no production window it
protects either. It is inert, not wrong — it cannot cause a failure — but the sentence above claims a
guarantee the code does not provide, and that is the kind of claim this repo's D-015 discipline exists
to catch. **Filed as ISS-344 (low)** to be removed by the next unit that touches `obs-guard.ts`; not
removed here, because changing code after a PASS without a new cycle is precisely the shortcut the
handshake forbids.

The honest version of that bullet: *`ensureObsReady` observes the launch failure, logs it, and throws
a message naming the spawn error and `OBS_EXE`.* The race it also claimed to close was already closed
by `connectWithBackoff` returning early — which **is** covered, by the second row of the table.

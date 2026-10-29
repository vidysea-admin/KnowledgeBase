# Manifest — bot-ts-guards
Status: checked-PASS
Handshake status: checked-PASS
Policy-Version: proportional-verification/2026-10-19.17
Fix cycle: 0
Tier: L (capture lock = concurrency path; one checker)
Dual check: no (no auth, tenancy or production write: the lock is a local profile-dir file, schedule-tick only gains a refusal, assisted-cdp only picks a Chrome path)
Base: 77ba22d8 (branch wave/bot-ts-guards). Code SHA under check: 9dfe3196 (parent 12b7ccdf). The manifest commit adds only this file.
Authorization: D-205 (main docs/DECISIONS.md, commit ae9c204e) and qa/evidence/bot-linux-survey-2026-10-29.md, unit U3, blockers 1, 2, 9.
Goal task: none (go-live batch 4, Linux bot container).
Sessions: not recorded (subagent builder)

## Acceptance criteria
- C1 recycled PID: a lock whose PID is alive but whose stored process start time differs from the live process's start time is stale; it is replaced (survey blocker 2: PID reuse after a container restart refused all captures).
- C2 live owner still blocks: a live PID with the SAME start time still blocks ("already has an active capture controller") and leaves the lock untouched. A legacy lock (bare PID, no start time) and an unknown (undefined) start-time probe keep today's pid-only behaviour; a dead PID is still replaced.
- C3 symlinked lock is still refused ("Capture lock symlink refused"), and invalid lock contents are still refused.
- C4 schedule-tick fails fast off win32 (linux, darwin) with a message naming `node scripts/webinar/run-pipeline.mjs --run --watch`, before building deps or touching state; win32 unchanged (survey blocker 1).
- C5 assisted-cdp finds a Linux Chrome (managed CfT chrome-linux64 beside LKB_PYTHON's venv, then /usr/bin/google-chrome, /usr/bin/chromium), maps `LKB_BROWSER_EXECUTABLE=cft` on non-win32, keeps the Windows candidates on win32, and otherwise refuses with a clear message (survey blocker 9).
- C6 interrupted-capture recovery (controller-state.ts) still accepts the new lock body: required because tab-browser now writes `pid\nstart-time` and recovery compared the lock to `String(pid)` (see Deviation).

## What changed
- packages/meeting-bot/src/capture/tab-browser.ts — new exported `claimCaptureLock` / `formatCaptureLock` / `CaptureLockProbes`; the stale-lock block in `launch()` replaced in place by `claimCaptureLock(lock, cfg.lockProbes)`; lock body is `pid` or `pid\nstartTime`; `stop()` lock removal compares the parsed pid; new optional `cfg.lockProbes` test seam. Uses existing `getProcessStartTime` and `controllerMatchesIdentity` from controller-state.ts.
- packages/meeting-bot/src/calendar/schedule-tick.ts — new `assertScheduleTickPlatform`; `runScheduleTick(rest, platform = process.platform)` calls it first.
- packages/meeting-bot/src/capture/assisted/assisted-cdp.ts — new `resolveAssistedChrome` (injectable platform/env/exists/listDir); `connectAssistedChrome` uses it instead of the Windows-only list.
- packages/meeting-bot/src/capture/controller-state.ts — DEVIATION, own commit 12b7ccdf: new `parseCaptureLock`; the three recovery lock comparisons (`!== String(status.pid)`) now compare the parsed pid. Without it, any crash-recovery of a lock written by the new tab-browser would end in "Recovery profile lock ownership refused". Not on the unit's file list; separate commit so the orchestrator can revert it (but then C6 and Windows recovery of new locks regress).
- Tests: tab-browser.test.ts (+6 tests), schedule-tick.test.ts (+1), assisted-record.test.ts (+3), controller-state.test.ts (existing recovery loop now writes a start-time lock in the `extract` case).

## Verification scope
Tier: L, lock path (concurrency).
Round: 8 files, 6 criteria, est 40 min — three small guards plus lock helper.
Affected tests / full-suite trigger: none. The builder ran no full suite. Also green on the final tree, one file per invocation: record-commands (22), record-backend (5), tab-session-workspace (7), tab-receiver-integration (12), browser-profile (2), slot-profile-seed (17), schedule-tick-rules-integration (4), tab-startup-cleanup (2), tab-stop-cleanup (3); `tsc --noEmit -p packages/meeting-bot` exit 0; `pnpm lint:structure` OK (10 stages, 0 failed); `node scripts/snapshot.mjs --check` OK.
Tests[C1]: packages/meeting-bot/src/capture/tab-browser.test.ts::"lock: a recycled PID ..." and "lock: launch() through createTabBrowserDeps ..." — recycled PID replaced, directly and through launch()
Tests[C2]: packages/meeting-bot/src/capture/tab-browser.test.ts::"lock: a live PID with the SAME start time still blocks ...", "lock: legacy bare-pid lock ...", "lock format ..." — same identity blocks, legacy and unknown probe keep pid-only trust, parse strictness
Tests[C3]: packages/meeting-bot/src/capture/tab-browser.test.ts::"lock: invalid contents and a symlinked lock are refused" — symlink and junk refused (symlink creation works on this host, so the branch runs)
Tests[C4]: packages/meeting-bot/src/calendar/schedule-tick.test.ts::"schedule-tick refuses off win32 ..." — linux/darwin refuse before deps; win32 passes; the other 14 tests are the existing win32 suite
Tests[C5]: packages/meeting-bot/src/capture/assisted/assisted-record.test.ts::"resolveAssistedChrome: ..." (3 tests) — win32, linux order, explicit/cft/refusal
Tests[C6]: packages/meeting-bot/src/capture/controller-state.test.ts::"first-source normalize/probe/extract failures ..." — the `extract` loop writes `pid\nlinux:boot:1` and recovery must still finalize
Sibling: packages/meeting-bot/src/capture/workspace/tab-session-workspace.ts:150 — not affected: login writes a bare `String(process.pid)` lock via claimCaptureLock-independent code; a bare pid is the legacy form and parses; tab-session-workspace.test.ts 7/7 green
Sibling: packages/meeting-bot/src/capture/tab-browser.ts:270 (stop) — changed: removal now compares the parsed pid; tab-stop-cleanup 3/3 and record-backend 5/5 green
Falsification[C1]: copy mutant `controllerMatchesIdentity(previous.startTime, ...)` -> `true`: tab-browser.test.ts red (killed); restored, real file hash-object == HEAD blob
Falsification[C2]: copy mutant `pidAlive(previous.pid) && false && ...`: tab-browser.test.ts red (killed); second mutant `previous.startTime === startTime(previous.pid)` (drops legacy/unknown trust) also red (killed)
Falsification[C3]: copy mutant removing the symlink `throw`: tab-browser.test.ts red (killed)
Falsification[C4]: copy mutant `if (platform !== "win32") throw` -> `if (false) throw`: schedule-tick.test.ts red (killed)
Falsification[C5]: copy mutant `LINUX_CHROME_CANDIDATES.find(exists)` -> `undefined`: assisted-record.test.ts red (killed)
Falsification[C6]: copy mutant restoring `readFileSync(lock,"utf8") !== String(status.pid)` at the first recovery site: controller-state.test.ts red (killed). Extra: parseCaptureLock regex loosened to accept junk -> tab-browser.test.ts red (killed)
Falsification method: whole `src` copied to packages/meeting-bot/src_mut (no node_modules inside), ONE mutant per fresh copy, tests run against the copy, copy removed afterwards; baseline run of the unmutated copy 25/25 green; `git hash-object` == `git rev-parse HEAD:<file>` for all 7 touched files after the run (fidelity True). Harness: scratchpad mut.py (not committed).
Pre-check[C1]: 9dfe3196 node --test --import tsx packages/meeting-bot/src/capture/tab-browser.test.ts -> PASS 25/25 t=24 blobs=packages/meeting-bot/src/capture/tab-browser.test.ts:dbeb693
Pre-check[C2]: 9dfe3196 node --test --import tsx packages/meeting-bot/src/capture/tab-browser.test.ts -> PASS 25/25 t=24 blobs=packages/meeting-bot/src/capture/tab-browser.test.ts:dbeb693
Pre-check[C3]: 9dfe3196 node --test --import tsx packages/meeting-bot/src/capture/tab-browser.test.ts -> PASS 25/25 t=24 blobs=packages/meeting-bot/src/capture/tab-browser.test.ts:dbeb693
Pre-check[C4]: 9dfe3196 node --test --import tsx packages/meeting-bot/src/calendar/schedule-tick.test.ts -> PASS 15/15 t=1 blobs=packages/meeting-bot/src/calendar/schedule-tick.test.ts:c7ba5b0
Pre-check[C5]: 9dfe3196 node --test --import tsx packages/meeting-bot/src/capture/assisted/assisted-record.test.ts -> PASS 14/14 t=0 blobs=packages/meeting-bot/src/capture/assisted/assisted-record.test.ts:39292b3
Pre-check[C6]: 9dfe3196 node --test --import tsx packages/meeting-bot/src/capture/controller-state.test.ts -> PASS 22/22 t=4 blobs=packages/meeting-bot/src/capture/controller-state.test.ts:158f17d
Metrics: builder_min=45 suite_runs=0 repeat_runs=0 mutations=8 cycle=0 policy=proportional-verification/2026-10-19.17

## How to verify (commands + expected)
- `node --test --import tsx packages/meeting-bot/src/capture/tab-browser.test.ts` -> pass 25 fail 0
- `node --test --import tsx packages/meeting-bot/src/calendar/schedule-tick.test.ts` -> pass 15 fail 0
- `node --test --import tsx packages/meeting-bot/src/capture/assisted/assisted-record.test.ts` -> pass 14 fail 0
- `node --test --import tsx packages/meeting-bot/src/capture/controller-state.test.ts` -> pass 22 fail 0
- `cd packages/meeting-bot && npx tsc --noEmit -p tsconfig.json` -> exit 0

## Notes for the checker
- Unknown start time never implies stale: `controllerMatchesIdentity` returns true when either side is missing, so a failed probe keeps blocking (fail closed). A live owner whose start-time probe is unavailable on the other host is therefore still treated as live.
- The lock body check on stop/cleanup uses the exact written body (`claimCaptureLock` release) at startup failure, and the parsed pid at `stop()`.
- Not done (outside this unit): container entrypoint deleting stale locks at boot (U1); `LKB_PYTHON` default (blocker 3) and the other survey blockers belong to other units.

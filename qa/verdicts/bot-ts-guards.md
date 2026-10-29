# Verdict - bot-ts-guards

**Cycle checked:** 0
**Verdict:** PASS
**Policy-Version:** proportional-verification/2026-10-19.17
**Commits:** 12b7ccdf, 9dfe3196 (manifest d849e968); diff 77ba22d8..HEAD
**Coordinator:** A (Tier L, single checker, no dual check: lock is a local profile-dir file, no auth/tenancy/production write)

## Evidence (re-run by the checker on HEAD d849e968, one file per invocation, timeout 300)
- C1/C2/C3: node --test --import tsx packages/meeting-bot/src/capture/tab-browser.test.ts -> pass 25 fail 0 (blob dbeb693 matches manifest pre-check).
- C4: schedule-tick.test.ts -> pass 15 fail 0.
- C5: assisted/assisted-record.test.ts -> pass 14 fail 0.
- C6: controller-state.test.ts -> pass 22 fail 0.
- `tsc --noEmit -p packages/meeting-bot/tsconfig.json` -> exit 0. Unmutated copy of src run once as baseline: tab-browser 25/25 (copy is a valid harness).

## Falsification (copy at packages/meeting-bot/src_chk, ONE mutant per fresh copy, removed afterwards; bound src untouched)
All 10 mutants KILLED by a genuine named test failure (not an infrastructure error):
- C1 `controllerMatchesIdentity(...)` -> `true`: 2 fail (recycled PID replaced, launch() recycled).
- C2a `pidAlive &&` -> `true &&`: 1 fail (legacy lock: dead PID is replaced). C2b `-> false &&` (never blocks): 3 fail (same-start-time blocks, legacy, launch()).
- C3a symlink throw removed: 1 fail. C3b invalid-contents throw removed: 1 fail.
- C4 off-win32 guard disabled: 1 fail (refuses off win32).
- C5a Linux system-Chrome fallback removed: 1 fail. C5b `cft` mapping removed on non-win32: 1 fail.
- C6 first recovery site reverted to `!== String(status.pid)`: 1 fail (extract loop).
- Extra X1 tab-browser.ts stop() lock removal `parseCaptureLock(...).pid === process.pid` -> `false`: 3 fail in tab-stop-cleanup.test.ts.
Fidelity after run: `git hash-object` == `git rev-parse HEAD:<file>` for tab-browser.ts, schedule-tick.ts, assisted-cdp.ts, controller-state.ts (all True); `git status` shows no tracked modification; src_chk absent.

## Adversarial hunt (lock path, concurrency)
- Fail-closed holds: unknown probe or legacy bare lock never implies stale (`controllerMatchesIdentity` true when either side missing); only a proven start-time mismatch replaces a live PID.
- Replacement is race-safe: text re-read before `rmSync`, then `openSync(lock,"wx")`; a second racer fails EEXIST rather than double-owning.
- `parseCaptureLock` rejects pid 0, leading zero, > 2147483647, >10 digits, trailing newline, empty/ >128-char start time; no pid-prefix confusion (`12` vs `123`) since the pid is compared as a number.
- Release only removes a lock whose body equals exactly what this process wrote; symlink never removed. Recovery sites compare parsed pid, so a start-time lock is accepted and any foreign pid still refuses.
- Sibling tab-session-workspace.ts:150 writes a bare pid (parses as legacy); its occupancy check is existence-only, unaffected.
- Linux start-time = boot_id + starttime ticks: a container restart on the same host changes ticks, a host reboot changes boot_id, so a recycled PID (including pid 1) is detected.

## Notes (low, not backlog)
- resolveAssistedChrome with a bare `LKB_PYTHON=python` derives a cwd-relative `lib/...` search path; it only matters if cwd contains a seleniumbase CfT tree. Not exploitable without cwd write.
- Legacy bare-pid locks left by older builds keep blocking after a container restart if pid is alive (e.g. pid 1); this is the U1 entrypoint concern the manifest already scopes out.
- Deviation (controller-state.ts, not on the unit file list) is justified: without it crash recovery refuses every new-format lock; C6 test proves it.

Metrics: check_min=14 mutations=10 suite_runs=0 repeat_runs=0 tests_run=4 files cycle=0 policy=proportional-verification/2026-10-19.17

ISSUES-WRITTEN: none

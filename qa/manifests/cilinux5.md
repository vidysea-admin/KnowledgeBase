# cilinux5: tab-receiver-integration "crash-exit-code-only" flaky on Ubuntu CI

Status: checked-PASS
Fix cycle: 0

## Root cause
Test-only race. The fake extension child exited (code 7) on a fixed ~100-200ms schedule after 20 chunks. `createTabBrowserDeps.launch()` polls every 250ms and throws "Tab recorder did not start" when `ready && done` are both true at its first check (tab-browser.ts:242). On the fast Ubuntu runner the child was already dead at that check, so launch() rejected before the test reached stop(). The same test passed in run 38373155421 (624ms) and failed in 38410927823 (256ms): timing, not a Chrome dependency, not path/platform.

## Regression?
No code regression. tab-browser.ts is correct and fail-safe: a child dead at launch is reported as a failed start, never success. Test introduced in 6c9bafe8 (T-034); only tab-browser change since the last pass is 36a1e646 (guard, default OFF), which does not alter this path. No production code changed.

## Fix
packages/meeting-bot/src/capture/tab-receiver-integration.test.ts: the fake crashes only after a `.crash-now` sentinel (written by the test after launch() returned). The assertion is unchanged: stop() rejects with "did not acknowledge final flush", status `failed`, partial media kept.

## Evidence (Windows)
- `node --test --import tsx src/capture/tab-receiver-integration.test.ts` x10: 10/10 pass.
- Full meeting-bot suite: tests 873, pass 868, fail 3: two known symlink EPERM (owned-recovery, owned-status) plus `getProcessStartTime ... real live pid` (5.2s under load; passes 22/22 in isolation in controller-state.test.ts).
- tsc --noEmit: exit 0. `node scripts/lint-loc.mjs --all`: OK (10 stages, 0 failed).
- Not verified on Ubuntu (no runner locally); CI re-run needed.

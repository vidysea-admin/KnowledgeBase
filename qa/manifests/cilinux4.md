# cilinux4: ai-transport "Deadline kills owned descendant tree" fails on Ubuntu CI
Status: checked-PASS
Fix cycle: 0
Owner: cilinux4 lane
Tier: 3 (CI portability, medium; light ceremony).

## Evidence
GH Actions run 38403814599 (Ubuntu): apps/api ai-transport.test.ts:45 `true !== false`, "owned descendant must be gone before rejection settles", 1227 ms. All other tests passed.

## Root cause (Linux only)
Production: terminate() on POSIX sends `kill(-pgid, SIGKILL)` and the promise rejects on the child's `close`. The signal to the grandchild (a group member, not the leader) is delivered asynchronously and the orphan is only removed once reparented and reaped, so the rejection could settle while the grandchild was still alive. Windows uses taskkill /T and is unaffected.
Test: `process.kill(pid,0)` also succeeds on a killed-but-unreaped zombie, so a dead orphan awaiting its reaper (common on CI containers) reads as alive.
Real (small) production gap plus a test assumption; both fixed.

## Fix
- apps/api/src/ai-transport.ts: `groupGone()` polls `kill(-pgid,0)` (10 ms, bounded 2 s) before rejecting after a deadline/overflow termination. No-op on win32 and when there was no pid. Success path untouched.
- apps/api/src/ai-transport.test.ts: on linux only, a pid still visible to kill(pid,0) is read from /proc/<pid>/stat; state Z counts as dead. Same assertion otherwise; not skipped on any platform.

## Not verifiable here
No Linux (wsl not installed). Fix reasoned from log; needs the next Ubuntu CI run.

## Windows verification
ai-transport.test.ts x10: pass 17 / fail 0 each. Full apps/api suite (D2_FIXTURE_PYTHON=.venv python): pass 836 / fail 0. tsc --noEmit apps/api: exit 0. lint-loc --all: exit 0.

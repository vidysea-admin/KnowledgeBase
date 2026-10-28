# Verdict: cilinux4

VERDICT: PASS
Cycle checked: 0

EXPLANATION:
- Win32 path: the diff touches only a new function whose first line returns on win32, the `finish` rejection line, and a Linux-gated test branch. terminate()'s win32 branch is untouched. Windows rejection now goes through `groupGone(...).then(reject)`, which resolves on the next microtask, so behaviour is unchanged in effect, though not literally byte-identical in tick timing.
- kill(-pgid,0): ESRCH means gone and is correct. The bare catch also treats EPERM as gone. It does not hang, and EPERM is only reachable if a group member changes uid, so it is a note. The bound is 2 s. On expiry the loop returns and the code still rejects with the original error. Nothing is logged.
- Zombies: a zombie member keeps kill(-pgid,0) succeeding. The group leader is reaped by node's own waitpid before `close`, so the common case ends quickly. Orphaned grandchildren depend on init or a subreaper. docker-compose.yml has no `init: true`, so a 2 s stall on every deadline or overflow is plausible in a container. It is filed as ISS-CILINUX4-001 (medium, file-don't-fix). The rejection is still correct, only late.
- Test change: a live non-Z process still fails the assertion. Only a Z state, or a vanished /proc entry, counts as dead. The assertion is not skipped on any platform. Not exercised here, since this is Linux-only.
- Contracts/decisions: grep of qa/contracts and DECISIONS shows no ai-transport process-group criteria, only incidental mentions. No conflict.
- Runs: ai-transport.test.ts x10, pass 17 / fail 0 each. Full apps/api suite with D2_FIXTURE_PYTHON: tests 836, pass 836, fail 0. tsc --noEmit exit 0. lint-loc --all exit 0.
- Mutations (hash-verified applied and restored, tree clean): (1) groupGone returns immediately, (2) Z test inverted so Z counts as alive, (3) bound dropped. All three SURVIVED on Windows, 17/17. All three are killable only on Linux CI, because groupGone is a win32 no-op and the Z branch is gated on linux. The fix is therefore unverified locally, as the manifest states, and needs the next Ubuntu run.

ISSUES-WRITTEN: ISS-CILINUX4-001 (medium, open, file-don't-fix)

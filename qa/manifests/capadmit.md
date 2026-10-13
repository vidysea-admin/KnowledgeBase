# capadmit

**Handshake status:** ready-for-check
Fix cycle: 1
Tier: 2 (open high issue ISS-CAPTUREFIX-001, T-035). Class: capture integrity. Full ceremony. Verdict by the checker only.
Lane: lane/capadmit (from 42abecde). Ledger row status NOT changed here.

## What was left after lobbywatch (ef375de7)
lobbywatch gates the silence watchdog on `admitted` but, per its own limits, the capture was still *marked* recording while unadmitted: (1) the tab status file `<out>.webm.status.json` went to `"recording"` on `capture-started`, which the recorder emits at join, in the lobby; (2) the "Joined" Telegram notice fired right after `joiner.join()` returned (also at join). Both claimed a live capture for a bot still in the lobby.

## Change (TS only; no sb_join*.py edit, so no conflict with lane/lobbyzt or lane/w042)
- `tab-browser.ts`: status is `"starting"` after `capture-started` and becomes `"recording"` only when the bot's `admitted` stdout event arrives (or at capture-started if `admitted` came first). Recovery already accepts `starting` and keeps `captureStartedAt`.
- `record-commands.ts`: `telegram.notifyJoined` moved from right after join into `onEvent` on the first `admitted` (once). The existing admitted / admission_timeout events and the gate are reused; nothing duplicated.
- `admission-gate.ts`: `gate.state` getter = `"lobby"` | `"admitted"` | `"failed"` (admission_timeout while unadmitted), so consumers can tell the three apart.
- No flag: this tightens a safety invariant (status truthfulness) rather than adding a feature; the only output difference is state `starting` instead of `recording` before admission and a later Joined notice.

## Reproductions (ISS-CAPTUREFIX-001 records no numbered corpus; its single reproduction is the live-run timeline: bot in lobby, silent, capture claims recording)
ISS-CAPTUREFIX-001 lobby the whole run: status never "recording", no Joined, watchdog never starts: 1/1. Admitted: starting then recording, exactly one Joined, watchdog starts: 1/1. admission_timeout: typed failure, never "recording", no Joined: 1/1. lobbywatch's own 4 runRecord reproductions in admission-gate.test.ts re-run unchanged: 4/4.
NOT verified: a real Meet/Zoom/Teams lobby (needs a human to admit the bot).

## Evidence (node from the toolchain)
```
src/capture/admission-status.test.ts   x3 runs   ℹ pass 4 ℹ fail 0 (each run)
admission-gate.test.ts + admission-status.test.ts + tab-browser.test.ts   22/21 pass; the 1 fail = tab-browser "owned status retains..." EPERM symlink (Windows, untouched file path)
record-commands + record-backend + controller-state   ℹ pass 49 ℹ fail 1 ("interrupted recovery binds..."); SAME 49/1 on the stashed baseline (2/2 runs), passes alone: pre-existing cross-file interaction
py -k "not native_same_host" (.venv pytest)   311 passed, 7 deselected (py untouched)
tsc --noEmit -p packages/meeting-bot   clean;  lint-loc.mjs: loc/dirsize/root/dupes/migrations OK; lint:structure FAILS only on docs/SNAPSHOT.md stale (76 lines, scripts/retention etc.), pre-existing on base, not regenerated here
```
Mutation (untracked harness in the worktree, per-mutation byte backup restored in finally, deleted before commit), 4/4 killed: capture-started writes "recording" unconditionally; `admitted` no longer sets the flag; Joined fired on capture-started/opened; gate ignores admission_timeout.

## Not delivered / known limits
- No explicit denied signal: a Meet/Zoom/Teams denial or removal is "unknown" and ends only at admission_timeout (900 s). A fast `admission_denied` emit needs sb_join_loop.py, which lane/lobbyzt rewrites; do it after lobbyzt merges (DENIED_PHRASES exist there).
- The OBS backend has no per-capture status file; its Joined notice is gated, its recording state is OBS's own.
- The tab recorder still records the lobby silence from join; starting capture only after admission is a larger change.
- T-029 reconnect-reload can still fire in the lobby.

## Fix cycle 1 (ISS-CAPADMIT-001) -- test-only; production code untouched
Cause: the fake bot emitted `admitted` after a fixed 1500 ms sleep and the run ended on a wall-clock `--until` (9-10 s) computed before join; sampling depended on controller poll timing, and slow startup under suite load consumed `--until` (the ~10.3 s failures).
Fix (admission-status.test.ts only): the fake holds at the lobby behind a `release` file that the wait hook writes only after it has SEEN status "starting"; it quits only on a `quit` file the hook writes after seeing "recording" (admitted) or 25 "starting" samples (lobby). `--until` is now 120 s so it can never end the run. All assertions kept.
Evidence: solo x20: pass 4 fail 0 in 20/20 runs. Full meeting-bot suite x2 (`node --test --import tsx "src/**/*.test.ts" "py/tab-capture/*.test.mjs"`): 867 tests, pass 863 fail 2 both runs; the 2 = known Windows failures (symlink EPERM "owned status retains...", "interrupted recovery binds..."). tsc --noEmit clean. lint-loc --all: all stages OK after `node scripts/snapshot.mjs` regenerated docs/SNAPSHOT.md.
Mutant M4 (admitted no longer promotes; hash-verified applied 2f2cce57, restored to HEAD blob 020b3a0c): admitted test fails (times out at 60 s, "recording" never observed): KILLED. M1-M3 unchanged by this cycle.

# Verdict: w25-assistrec

VERDICT: FAIL
Cycle checked: 0
Reviewed SHA: 603e265f99c0fbc64a7746c88f2ad09db094df54
Base: 50c320a6505a3d7d2802b42167b2a854355d5cd4

## Independently verified
- No stealth/evasion: grep of assisted/*.ts finds no click, dispatchEvent, Input.*, userAgent, webdriver, AutomationControlled, yt-dlp, Emulation, Page.reload or headless. Chrome args are only --remote-debugging-port, --user-data-dir and the URL. Injected JS is STATE_JS (read), START_JS (captureStream + MediaRecorder), STOP_JS (stop); no input dispatch. /json/new PUT only loads the URL. OK.
- Consent: assistedRecordDeps is built only after prepareWorkspaceCaptureControls -> createRecordConsent (record-commands.ts:~108 -> tab-session-workspace.ts:89), which runs before any Chrome spawn. Receipt required, fails closed, shared path unchanged. OK. (No assisted-specific fail-closed test; shared code is covered by existing tests.)
- Chunk data path: each MediaRecorder chunk (1 s) goes straight over the CDP binding and is appendFileSync'd to disk; nothing accumulates in page or node memory. OK for long videos.
- Flag off: only a ternary branch + --until default under `assisted`; 22/22 record-commands tests pass. OK.
- Play detection (currentTime advancing, !paused, !ended, readyState>=3), no-play timeout refusal (page detached, no file), ended/--until ceiling (3 h default): logic correct on read.
- Cleanup: Chrome is spawned detached/unref and deliberately left open; profile `assisted-chrome-profile` is persistent, not a temp dir; bot only detaches the WebSocket. Design intent, noted, not a defect.

## Commands (cwd packages/meeting-bot, exit codes captured to scratchpad)
- node --test --test-force-exit --import tsx src/capture/assisted/assisted-record.test.ts: exit 0, pass 7 fail 0
- ... src/capture/record-commands.test.ts: exit 0, pass 22 fail 0
- node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json: exit 0
- D-020 mutation (per-mutation backup, trap INT/TERM/ERR, timeout 300): assisted-record.ts `ended >= ENDED_CONFIRM_POLLS` -> `ended >= 1`. Result: SURVIVED (pass 7 fail 0). Restored; cmp identical; `git -c core.autocrlf=true hash-object` = HEAD blob c19de619349ebe9f8e0b553f17f2a2e8c698a272.
- Not run: lint-loc, real Chrome (forbidden).

## Findings
1. (medium, test gap, blocks PASS) The 3-poll ended confirmation is untested. Test "a single transient ended blip does not stop the recording" (assisted-record.test.ts, the blip test) asserts only that browserExited resolves 0, which is true whether or not the blip debounces, so the mutant ended>=1 survives. Same for "browserExited resolves after the media ends". Fix: test-only; script [play, play, ended-blip, play, play, play...] and assert browserExited is still pending after the blip polls (race against a settled flag), then that it resolves after 3 consecutive ended polls and after null. Re-run the mutation and show it killed.
2. (low note) `--assisted` with `--backend obs` is silently ignored (obs path runs); native settings are ignored under assisted. Consider a usage error. Not blocking.

ISSUES-WRITTEN: none
Ledger rows may NOT be flipped. Code is otherwise sound; re-check after the test fix (cycle 1).

---
# Cycle 1 re-check

VERDICT: PASS
Cycle checked: 1
Reviewed SHA: 892d46f0b29c3d8fb4e7bf7ece1179c0e0598015
Prior: cycle 0 FAIL at 603e265f (verdict commit 37a95083).

## Finding 1 (surviving ended-confirm mutant): resolved
New tests assert exact poll counts for 2 consecutive ended (no stop) and 3 consecutive ended (stop).
Re-run mutations (per-mutation backup, trap INT/TERM/ERR, timeout 300, cmp and `git -c core.autocrlf=true hash-object` == HEAD blob after each):
- `ended >= 1`: KILLED (pass 9 / fail 2). Blob 87cd1408... == HEAD.
- `ended >= 4` (own new mutant): KILLED (test run hung to timeout rc=124, i.e. fails). Blob restored == HEAD.
- wiring guard `if (on && backend !== "tab")` -> `if (false)`: KILLED (pass 10 / fail 1). Blob d68cf271... == HEAD.
- dispose guard `!launched ||` removed (assisted-cdp.ts): SURVIVED, because the real CDP adapter is not unit-testable without Chrome. Verified by reading instead (below). Blob 67812703... == HEAD.

## Commands (cwd packages/meeting-bot unless noted)
- assisted-record.test.ts: exit 0, pass 11 fail 0
- record-commands.test.ts: exit 0, pass 22 fail 0
- tsc --noEmit: exit 0
- repo root `node scripts/lint-loc.mjs --all`: exit 0, 10 stages OK (an earlier run failed lint-root only because of my own stray scratch files in the lane root; removed and re-run clean)

## dispose safety (read review of assisted-cdp.ts)
`launched` is set true only on the branch where no matching tab exists AND `/json/list` on the debug port is empty (nothing listening), immediately before this run spawns Chrome. dispose() returns at once if `!launched || keepBrowser`; otherwise it sends Browser.close to that port's browser and rmSync's the user-data-dir. A Chrome the human already had open on the port (list non-empty, tab found or not) never sets `launched`, so it is never closed and its profile never removed. `--keep-browser` also skips it. --assisted with a non-tab backend is now refused (assistedFlag). Both stop() and the no-play refusal call dispose.

## Notes (low, not blocking, no issues filed)
- If connect fails after the spawn (no tab found), dispose is not called and the launched Chrome/profile remain.
- The `launched` guard has no automated test (needs real Chrome); relies on the read review above.
- rmSync removes assisted-chrome-profile only when this run launched it; a profile from a prior --keep-browser run is deleted too if a later run launches fresh.

ISSUES-WRITTEN: none
Ledger rows for w25-assistrec may be flipped to verified.

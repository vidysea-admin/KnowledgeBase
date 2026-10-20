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

# Verdict — t034-capture-failure-not-success

VERDICT: PASS
Cycle checked: 0
Commit checked: 709038c (branch lane/t034fix, from d27cf71)
Scope: logic verified with fakes; NOT run in a real browser; one live tab-capture session is required before T-034 is called done. Manifest status not flipped.

## EXPLANATION
Re-derived, not trusted. Gates (node v24.19.0, targeted, foreground): extension tests `py/tab-capture/*.test.mjs` 44 tests / 43 pass / 0 fail / 1 todo (ISS-T034EXT-004, correctly left); tab-browser.test.ts 6 / 5 pass / 1 fail = the untouched `owned status retains ...` test, `EPERM: operation not permitted, symlink` (this machine cannot create symlinks; neither the test nor the code it exercises is in the diff, so it fails identically at d27cf71 by construction; I did not run the base); record-commands.test.ts 19 / 18 pass / 1 skipped. `tsc --noEmit -p tsconfig.json` in packages/meeting-bot: exit 0, no errors in this worktree (the maker's skip-describe.ts error does not appear here). lint-dirsize OK. tab-browser.ts 263 of 300 lines (maker figure; diff is +5). `git merge-tree --write-tree HEAD codex/machine-migration-2026-10-09`: clean (merge base is d27cf71; target tip a3ad969).

### 1. False success
Own probe (untracked, deleted) through createTabBrowserDeps with a fake extension: `failed:true` stop with no prior error -> stop() rejects "Recorder reported a failed stop; media is incomplete", status failed, partial file kept; a second stop() of the same handle also rejects; capture-error then `failed:false` -> still rejects (sticky), state failed. Through record-commands, by code reading: deps.stop rejects, browser-joiner awaits it, runRecord's `if (backend === "tab") throw e` rethrows out of the finally, so normalizeCapture/finalizeRecording are unreachable. That last link is UNTESTED (ISS-T034FIX-004); runRecord has no injectable finalize, so I could not assert "finalize never called" at runtime.
Non-boolean `failed`: the code uses `=== true` as failure, i.e. fail-OPEN. Values "true", "false", 1, null and a missing field all produced a resolved stop and state `stopped`. The SAFE reading is "clean only when `failed === false`". The shipped recorder.js always sends a boolean and only the token holder can post, so this is not reachable from the shipped extension: filed as ISS-T034FIX-003 (medium) and made a merge condition, not a FAIL. stop() for an unknown handle resolves silently (`if (!run) return`); unreachable in the normal flow (the handle comes from launch). Receiver restart mid-capture: the receiver lives inside the controller, so a restart ends the run; the status stays `recording`/`failed` and the recovery path, not the success path, owns it.

### 2. False failure (ISS-T034FIX-001)
How the bot ends a recording (record-commands loop): `--until` reached, bot browser exited, an `ended` DOM-phrase event followed by `endNotBefore` plus 60 s, or a capture-control stop. In every case the bot itself calls stop, which sets `stopping`; the extension's 1 s control poll then sets `finishing` before any track is stopped, and the stop file (which closes Chrome) is written only after the ack. So the normal paths stay `failed:false` (test: deliberate stop then tracks ended is clean). The new failure appears only if the tracks end BEFORE the bot's stop: the meeting page closing its own tab (background.js itself says "navigation retains the stream; closing the tab ends it", so navigation to a post-meeting page is fine) or Chrome dying. A page can close a tab only if script-opened or with a single history entry, so I do not expect this on every meeting; it is unverified. Cost if it hits: media kept, status failed, run exits non-zero, no alert, and `lkb finalize` refuses the failed partial because `.record-state.json` is already removed (ISS-T034FIX-005, code reading, not executed). Signals available to tell "meeting ended" from "capture broke": sb_join's own `ended` event (END_PHRASES; already feeds record-commands `endedAt`) shortly before the track end, and elapsed time vs the controller's `until`; tab-browser already receives sb_join's events so the receiver could classify. Rating: stays medium (bad-reported-good is the worse direction; nothing is lost). Not a PASS blocker; follow-up gated on the live session.

### 3. Partial file
Kept, status `failed`, never promoted. No consumer scans raw/webinars for .webm (grep: schedule-tick, watchdog, join-rules-host use only state/scheduled files; transcribe scripts need an explicit audioPath). interrupted-recovery (`finalizeControllerRecording`) accepts state `failed` only while `.record-state.json` still matches, and runRecord deletes it. Visibility is weak: exit 1, stderr, status.json; no Telegram failure alert, no operation row (ISS-T034FIX-005).

### 4. Endpoint pin
Regex `^http:\/\/127\.0\.0\.1:([1-9]\d{0,4})$`, no flags, plus port <= 65535 and non-empty token, first in start(). 40 own inputs: accepted only `:1`, `:65535`, `:8080`. Refused: ports 0, 65536, 99999, 123456, 01234, `+80`, spaces, any path, `/`, query, `#@evil`, `@evil.example`, `127.0.0.1.evil.example`, `127.1`, `[::ffff:127.0.0.1]`, `[::1]`, localhost, https, `HTTP://`, userinfo, unicode digits, fullwidth dot, `\r`, ` `, NUL, and `"http://127.0.0.1:1234\n"` and `"...1234\n.evil.example"` (no `m` flag; JS `$` does not match before a trailing newline). Chunk URLs are `${config.endpoint}${route}` onto the validated string; fetch uses the default redirect mode (a cross-origin redirect drops Authorization per the fetch spec; the loopback receiver never redirects). The pin MATCHES the launcher: tab-browser writes config.json `{endpoint: "http://127.0.0.1:<port>", token}`, no path.

### 5. Sender predicate
`id === chrome.runtime.id && !tab && (url undefined || startsWith chrome-extension://<id>/)`. background.js sends with `chrome.runtime.sendMessage` from the service worker (no tab; url is the extension's own script URL), so the legitimate sender passes; content-script/tab, foreign id and web url are refused (tests plus mutations M12/M14/M18). UNVERIFIED in a real browser: a live check must confirm the real `sender` seen by the offscreen listener.

### 6. Frozen files
`git diff d27cf71 709038c -- background.js manifest.json`: empty. Git-blob sha256 of both (`git show HEAD:...`) equals the t052 manifest's recorded 5B654060...ED9C8D (background.js) and 3E8E3548...A2C16 (manifest.json); the working-copy sha256 differs only by CRLF checkout.

### 7. Edited tests
P3 track-ending assertion flipped `failed:false` -> `failed:true` (the fix); todo markers removed for 001/002/003/005 and the 002 assertion strengthened (the old `||` form was weaker); deliberate-stop, endpoint and sender tables added; nothing weakened; one todo (004) remains.

### 8. package.json / CI
Diff is exactly the added `"py/tab-capture/*.test.mjs"` glob. Both globs are double-quoted so node (v24 locally and in CI, setup-node 24) expands them itself, identical under Windows and Linux sh; CI runs `pnpm -r test`. Ran the new glob by hand: 44 tests, so both extension test files are discovered.

### 9. Mutations (own harness, byte backup per mutation, 250 s timeout, finally restore, harness deleted)
18 run, 15 killed, 3 survived. Killed: tab-browser M1 failed flag ignored, M2 sticky cleared, M3 no throw on failure, M4 partial recorded as stopped; recorder M8 unexpected end clean, M9 requested stop reported failed, M10 unanchored regex, M11 `m` flag, M12 sender id check removed, M13 request sent before endpoint check, M14 sender.tab ignored, M15 empty token, M16 port range, M18 sender url check; M17 (localhost allowed) killed only collaterally (it shifts the capture group). SURVIVED in record-commands.ts: M5 rethrow removed, M7 `if (captureFailure) throw` removed, M6 new early-exit line removed (ISS-T034FIX-004). Afterwards `git hash-object` equals `git rev-parse HEAD:<file>` for tab-browser.ts, record-commands.ts, recorder.js.

## ISSUES-WRITTEN: ISS-T034FIX-003 (medium), ISS-T034FIX-004 (medium), ISS-T034FIX-005 (medium) in qa/issues.t034fix.jsonl. ISS-T034FIX-001 re-rated: stays medium (section 2). ISS-T034FIX-002 stays low, subsumed by -004.

## ISS-T034EXT rows (logic with fakes only)
Verified by the new passing tests and mutations: -001, -002, -003, -005, -006, -007. -004 remains open.

## Merge conditions
1. ISS-T034FIX-003 fixed (clean only when `failed === false`) with a seven-value table test, before T-034 is called done (may ride in the next unit).
2. ISS-T034FIX-004: a test for the stop-rejects-so-no-finalize link, same horizon.
3. ISS-T034FIX-001 / -005 decided after the live session.

## A live session must confirm
Normal bot-requested stop yields `stopped`; the meeting closing or navigating the tab before the bot's stop (does Chrome fire `ended`, does the stream survive navigation); a deliberately killed track yields `failed` and a kept partial; the real `sender` of the background-to-offscreen message passes the predicate; the real config.json endpoint is accepted; no redirect carries the token; a failed capture produces an operator-visible signal.

---

# Cycle 1 check (commit dbe3938, on df00752)

VERDICT: FAIL
Cycle checked: 1
Commit checked: dbe3938
Scope: logic verified with fakes; NOT run in a real browser; one live tab-capture session is required before T-034 is called done.

## EXPLANATION
The two fixes are correct; the new record-commands tests are flaky, which is a required fix on the recording path.
- (a) ISS-T034FIX-003 VERIFIED. Own probe through the real receiver with ten values: only exactly `false` is a clean stop (state stopped). `true` -> "Recorder reported a failed stop"; "true", "false", 1, 0, null, missing, {} and [] -> "Malformed capture-stopped message ..." and state failed, partial kept. record-commands onEvent uses `!== false`. Existing clean-stop tests unchanged.
- (b) `inject` seam: ruled acceptable. Defaults: recordDir = RECORD_DIR, tab = same createTabBrowserDeps config, finalize = finalizeRecording, pollMs 5000, so absent-inject behaviour is the same calls. The only callers are cli.ts and send-now-command.ts, neither passes it; it is a function parameter, not readable from argv or env, so it cannot be set from outside the process. It can only skip finalize or move the record dir for a caller in code. Low risk; keep.
- (c) Mutants re-applied (per-mutation backup, 250 s timeout, finally restore, hashes equal HEAD): M5 (rethrow removed) KILLED by an assertion (message regex "failed stop; media is incomplete" in the stop-failed test). M7 (loop throw removed) and M6 (early-exit line removed) KILLED only by the `elapsedAfterStart < 3000` wall-clock assertion ("loop must end promptly, took 5800-6600 ms"), not by a behavioural assertion.
- (d) FLAKINESS: record-commands.test.ts run five times in a row: run1 green; runs 2-5 each failed 1-2 of the "promptly" tests (took 6.6-9.7 s against a 3000 ms bound). The fake child sleeps 1000 ms, gives up at 6000 ms, and the assertions hold wall-clock margins on a saturated machine. REQUIRED FIX before merge: remove the real-time margin (assert on behaviour: loop exits before `--until` with the right reason, or inject a clock or poll step and widen the bound to a large multiple), as it would otherwise be ignored in CI. Filed ISS-T034FIX-006.
- (e) record-commands.test.ts 397 of 400 non-blank lines; record-commands.ts 278; tab-browser.ts 268 of 300; lint-dirsize OK but the capture directory is at its file limit: the next unit needs a split of the test file first.
- (f) Frozen files: unchanged since d27cf71. tab-browser tests 12/13 (the symlink-EPERM test, environmental); extension tests 44 / 43 pass / 1 todo; `tsc --noEmit` exit 0; `git merge-tree` against codex/machine-migration-2026-10-09 clean.

## ISSUES
ISS-T034FIX-003 verified (fixed, logic with fakes). ISS-T034FIX-004: chain now tested; M5 killed by assertion, M6/M7 only by the flaky timing assertion, so NOT yet verified. ISS-T034FIX-005 stays open. New: ISS-T034FIX-006 (medium).

## Merge conditions
1. ISS-T034FIX-006: deterministic record-commands tests (five consecutive green runs, M6/M7 killed by a non-timing assertion).
2. ISS-T034FIX-001 / -005 decided after the live session; the live-session list in cycle 0 still applies.

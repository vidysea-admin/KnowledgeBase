# iss-capturefix-001-lobby-admission-watchdog

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 2 (open high issue ISS-CAPTUREFIX-001; T-031 / T-034). Class: capture integrity (a lobby reload destroyed the recording). Severity high: FULL ceremony. Verdict by the checker only.
Lane: lane/lobbywatch (branched from 16d20ec9). Ledger row ISS-CAPTUREFIX-001 status NOT changed here.

## What was wrong
Live run 2026-10-13 (qa/evidence/t034-t035-live-capture-2026-10-13/summary.md on lane/capturelive 6f9f5116): the tab recorder and the T-031 silence watchdog started while the bot sat in the Meet lobby. A lobby is silent, so after 121 s the watchdog asked sb_join to reload the page; the reload ended the audio track and the capture failed ("audio track ended unexpectedly"), twice. sb_join emitted only opened / clicked / heartbeat / ended, so Node had no admission signal.

## Change
Python (packages/meeting-bot/py):
- `sb_join_detect.py`: `LOBBY_PHRASES`, `is_meet_url`, pure `classify_meet_state(in_call_dom, body)` (lobby text always wins over a leave control: "lobby" | "in-call" | "unknown"), pure `AdmissionState` (admitted once, timeout once, timeout 0 = never), `ADMISSION_TIMEOUT_S = 900`.
- `sb_join_scripts.py`: `IN_CALL_JS` = a VISIBLE "Leave call" button or "Call controls" toolbar (same querySelector/aria-label style as CLICK_JS).
- `sb_join_loop.py`: each tick on a Meet URL classifies lobby vs in-call and emits `admitted` once. Still not admitted after the timeout: emit typed `admission_timeout` (seconds, limit), leave the loop, normal `closed` path (not `fatal`). The `--reload-file` sentinel is consumed but NOT acted on until admitted: emits `watchdog-reload-suppressed` (reason not-admitted), no page reload. After admission the T-031 reload is unchanged.
- Non-Meet URLs (Zoom, Zoho) have no lobby signal: `admitted` is emitted on the first tick with `assumed: true` and they never time out, so their watchdog behaviour is unchanged.
- `sb_join_cli.py`: `--admission-timeout SECONDS` (default 900; default read from `$LKB_ADMISSION_TIMEOUT_S`; 0 = never).
- `sb_join.py`: only the re-export import lines changed.
TS (packages/meeting-bot/src/capture):
- `admission-gate.ts` (new, split out because record-commands.ts is near the LOC budget): starts the watchdog only on `admitted` (also if `admitted` arrived before the watchdog was built); `admission_timeout` becomes the failure "admission_timeout: the bot was not admitted ... within Ns (waited Ms in the lobby); no recording made"; a `capture-error` within 180 s after a post-admission `watchdog-reload`/`reconnect-reload` is reported as "<error> (the audio track ended after a page reload [kind] following admission; the reload killed the capture)".
- `record-commands.ts`: `audioWatchdog.start()` replaced by `gate.attach(audioWatchdog)`; the tab stop-failure rethrow prefers the gate's message so the reload cause is not lost.

## Guards untouched
`git diff` shows NO change to `sb_join_ownership.py`, `sb_join_recorder.py`, `sb_join_register.py`, `sb_join_profile.py`, `registration_cdp.py`, `registration_cdp_page.py` (loopback, DNR, CDP and redirect guards byte-identical).

## Reproductions (ISS-CAPTUREFIX-001 records no numbered corpus; its single reproduction is the live-run timeline)
- Lobby for the whole run, silence > 120 s: watchdog never started (0 level subscriptions in runRecord), no reload (py: `watchdog-reload-suppressed`, `uc_open_with_reconnect` calls 0). 1/1.
- Admitted: watchdog starts exactly once; the reload still works after admission. 1/1.
- Reload killing the track after admission: reported with the reload cause. 1/1.
NOT verified: a real Meet lobby/admission (needs a human to admit the bot; the DOM selectors and LOBBY_PHRASES are from Meet's known UI, exercised only on static HTML fixtures), a real 60-minute run.

## Evidence (node from the toolchain)
```
py/test_sb_join_admission.py (.venv pytest)      18 passed (14 pure/fake-driver + 4 static-HTML fixtures in ONE headless Chrome)
py suite -k "not native_same_host"               311 passed, 7 deselected
src/capture/admission-gate.test.ts               ℹ tests 9 ℹ pass 9 ℹ fail 0 (5 unit + 4 runRecord with real tab receiver and fake join script)
full meeting-bot TS suite (src + tab-capture)    ℹ tests 862 ℹ pass 856 ℹ fail 3 ℹ skipped 2 ℹ todo 1
  the 3 fails are environmental, in files not touched: 2x EPERM creating a symlink (Windows), 1x live WebM remux needing ffmpeg; not run on main for comparison
tsc --noEmit -p packages/meeting-bot            clean;  scripts/lint-loc.mjs OK (878 files)
```
Static fixtures: py/fixtures/meet_lobby.html (lobby, with a Leave control), meet_prejoin.html, meet_incall.html, meet_incall_hidden.html (display:none Leave button) -> lobby, lobby, in-call, unknown.
Mutation (untracked harness inside the worktree, byte backup per mutation restored in `finally`, `git hash-object` equals the pre-mutation blob after each, harness deleted): 9/9 killed: reload not suppressed in lobby; lobby text no longer wins; timeout comparison inverted; no loop exit after admission_timeout; IN_CALL_JS ignores visibility; gate does not start watchdog on admitted; watchdog started unconditionally in runRecord; reload blamed before admission; stop error not replaced by gate message. (One first draft survived: the "no exit after timeout" test passed because the event count is still 1; the test now asserts the simulated clock stopped at the timeout.)

## Not delivered / known limits
- T-029 `reconnect-reload` (connectivity banner) can still reload in the lobby; only the silence-watchdog reload is suppressed. A reload before admission is still possible if Meet shows a network banner.
- The tab recorder itself still starts at join (it records the silent lobby); the output then contains lobby silence. Starting capture only after admission is a larger change, not made here.
- After a post-admission reload Meet may put the bot back in the lobby; the gate does not re-suspend the watchdog.
- Selectors/phrases are English-locale Meet UI.

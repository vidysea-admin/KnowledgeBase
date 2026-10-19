# capturefix-lean-bitrate-and-lobby-watchdog

**Handshake status:** checked-PASS
Fix cycle: 0
Lane: lane/capturefix. Tier: roadmap T-035 (defect 2 DELIVERED); T-034 lobby watchdog (defect 1 NOT delivered, STOPPED).

## Defect 2: T-035 bitrate (delivered)
`py/tab-capture/recorder.js`: video 1500000 -> 500000 bps, audio 96000 -> 64000 bps, maxFrameRate 20 -> 5 (720p cap kept).
Arithmetic: (500000 + 64000) bps = 564 kbps x 3600 s / 8 = 253.8 MB/h (decimal; 242 MiB/h). Before: 1596 kbps = 718 MB/h. Limit 400 MB/h: 63% of limit. Audio 64 kbps meets the stated floor. Matches the OBS lean defaults (720p, 5 fps, 500+64 kbps).
Test: `py/tab-capture/recorder-bitrate.test.mjs` (2 tests) reads the real MediaRecorder options via the fake world.
Evidence: `node --test --import tsx py/tab-capture/*.test.mjs` tests 49, pass 48, todo 1 (pre-existing ISS-T034EXT-004), fail 0.
Mutations (per-mutation backup, restored; hash == intended blob 7c45306c): video back to 1.5 Mbps KILLED; audio 32 kbps KILLED; fps 20 KILLED; audio 96k + video 1 Mbps (over the 75% bar) KILLED. 4/4.
Not verified: real-world size (target bitrate only; VP8 may undershoot/overshoot) needs a live measurement.

## Defect 1: lobby watchdog (STOPPED, not implemented)
Contract (qa/contracts/meeting-bot-live-capture.md) does not fix watchdog behaviour; roadmap T-031: "no signal for more than 2 min while the session is live", which supports suspending in the lobby. No conflict. But:
- No admission signal exists anywhere. sb_join.py emits only opened/clicked/heartbeat(url,title)/ended/watchdog-reload/gap; `clicked` is the Join click, not admission. TS has no body-text access. browser-joiner.ts has no admitted state. No "admission timeout" setting exists either.
- Providing one requires a new emit in py/sb_join.py (admission detection from page text, plus not reloading while waiting; the reload is consumed there, `should_force_reload`), which lane budgetmb owns. A TS-only guess (first audible level = admitted) would be a policy choice and fails for silent-but-admitted meetings.
Options: (a) after budgetmb merges, add `emit("admitted")` in sb_join.py and gate createAudioWatchdog.start() on it in record-commands.ts, with a lobby timeout and a loud "watchdog-reload ended the track" report; (b) heuristic TS-only gate (not recommended).

## Integrator close-out note (2026-10-13)
Bitrate part checked-PASS; watchdog part pending ISS-CAPTUREFIX-001. Manifest status deliberately left ready-for-check until the watchdog part is delivered and checked.

## Integrator close-out note (2026-10-13, update)
Watchdog part: checked-PASS for Meet scope by lane/lobbywatch (verdict qa/verdicts/iss-capturefix-001-lobby-admission-watchdog.md); ISS-CAPTUREFIX-001 verified for Meet. Zoom/Teams are tracked as ISS-LOBBYWATCH-001. Bitrate part checked-PASS earlier.

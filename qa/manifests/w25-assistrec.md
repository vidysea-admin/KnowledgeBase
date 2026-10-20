# w25-assistrec: assisted recording of human-played media (YouTube replays)

Status: ready-for-check
Fix cycle: 0
Lane: KnowledgeBase-lanes/w25-assistrec  Branch: lane/w25-assistrec  Base: 50c320a6505a3d7d2802b42167b2a854355d5cd4
Candidate SHA: see `git log -1 lane/w25-assistrec` (the commit that adds this file)

## Why
YouTube shows "Sign in to confirm you're not a bot" to the automated Chrome. Bypassing or downloading is out of bounds.
A HUMAN opens the video in a normal Chrome and presses play; the bot records what plays.

## Design (backend A: attach)
- `lkb record <url> --assisted [--play-timeout MIN=10] [--debug-port 9223] [--until HH:MM]` (+ the usual consent vars/flags).
- Starts a plain Chrome with ONLY `--remote-debugging-port` and its own user-data-dir (`assisted-chrome-profile`, sibling of the bot profile; Chrome refuses the debug port on the default profile). No automation flags, no stealth, no UA change.
- Finds or opens the tab for the URL (`/json/new` PUT only loads the URL), prints "press play", waits until `<video>` is playing (currentTime advancing, not paused, readyState>=3).
- Records the `<video>` via in-page `captureStream()` + `MediaRecorder` (WebM), chunks to a localhost CDP binding, written to the record dir.
- Stops when the media ended (ended flag, or paused at duration, confirmed over 3 polls) or the tab closes, or at `--until` (default ceiling 3 h).
- Hands the file to the existing `runRecord` consent, finalize, transcribe and index path unchanged (same deps shape as `createTabBrowserDeps`).
- Never clicks, scrolls, types or reloads. `triggerReload` is a no-op. An ad that plays first is recorded too (noted, accepted).
- Refusal: nothing playing within `--play-timeout` => error "nothing played within N minutes; refusing, no recording made".

## Changed paths
- packages/meeting-bot/src/capture/assisted/assisted-record.ts (logic), assisted-cdp.ts (real Chrome adapter), assisted-wiring.ts (flags), assisted-record.test.ts
- packages/meeting-bot/src/capture/record-commands.ts (+--assisted flag, ternary, usage; stays at 300 lines)

## Checks a checker must run (from packages/meeting-bot)
- `node --test --import tsx src/capture/assisted/assisted-record.test.ts` -> pass 7
- `node --test --import tsx src/capture/record-commands.test.ts` -> pass 22 (regression)
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0
- `node scripts/lint-loc.mjs --all` (repo root) -> 10 stages pass
- Review: no input dispatch in assisted-cdp.ts; no yt-dlp/download; no flags beyond --remote-debugging-port/--user-data-dir.

## Evidence
- tests: assisted-record 7/7, record-commands 22/22, tsc exit 0, lint-loc all 10 stages exit 0.
- D-020 mutation (script outside repo, per-mutation backup + trap): drop `!cur.paused` from isPlaying -> test "isPlaying needs currentTime advancing while not paused" FAILED (pass 6 / fail 1); restored, cmp identical.
- Live smoke: `lkb record https://www.youtube.com/ --assisted --play-timeout 0.5` launched a plain Chrome on port 9223, attached to the youtube.com tab, printed READY/press play, and refused after 30 s with "nothing played within 0.5 minutes; refusing, no recording made". No recording was made. Chrome was left open. Smoke used placeholder provenance vars (w25-smoke) and organizer-consent unknown; real runs must pass the real consent vars.

## Not verified
- A full real recording to the end of a video (needs a human to press play). In-page MediaRecorder start/stop/ended path is covered by fakes only.
- YouTube DRM/ad behaviour of `captureStream()`; `ended` may not fire on every ad transition (3-poll confirmation mitigates).

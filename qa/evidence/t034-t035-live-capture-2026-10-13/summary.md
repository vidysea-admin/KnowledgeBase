# T-034 / T-035 live 60-minute capture, 2026-10-13: NOT ACHIEVED

Outcome: no usable recording. The tab-capture backend failed three times; the capture stopped at about 2 min each time. T-034 and T-035 live criteria are NOT met. No transcript, lean-video, validation.json or provenance was produced, because the producer failed before finalize.

## Prerequisites
- Node v24.19.0 (given bin dir); pnpm not on PATH (not needed, ran `node --import tsx packages/meeting-bot/src/cli.ts record`).
- System Chrome 155.0.8059.40 present but refused: sb_join requires an explicit managed browser (`LKB_BROWSER_EXECUTABLE`); then the extension-ownership check failed on branded Chrome. Used the repo's prepared Chrome for Testing 155.0.8059.39 (`.venv/.../seleniumbase/drivers/cft_drivers/chrome-win64/chrome.exe`), per `.cache/tools/capture-runtime-155.0.8059.39/prepared.json`.
- OBS not installed (`obs64.exe` absent); not needed for `--backend tab`.
- ffmpeg/ffprobe not on PATH; found under WinGet Gyan.FFmpeg 9.0.2 and added to PATH. Disk free about 14 GB. Python venv with seleniumbase 4.51.9. Bot profile `data/bot-profile` (not Umesh's profile, not kb-automation-chrome). Telegram alerts disabled (no env).
- Env: MONGODB_DB=lkb_staging, MONGO_WORK_DB=lkb_staging, LKB_ALLOW_STAGING=lkb_staging, LKB_TENANT_ID=vidysea. No DB writes occurred.

## Command (secrets none)
`node --import tsx packages/meeting-bot/src/cli.ts record https://meet.google.com/atm-ygmf-ksq --until 2026-10-13T07:36:00Z --end-not-before 2026-10-13T07:20:00Z --title t034-t035-live-capture --session-id <id> --backend tab`

## Timeline (UTC)
- 06:34:23 run 1: `Explicit managed Windows browser required` (LKB_BROWSER_EXECUTABLE unset). 0-byte webm.
- 06:35:19 run 2 (system Chrome): `Recorder extension ownership mapping refused`.
- 06:40:16 run 3 (Chrome for Testing), session 2026-10-13-t034-t035-live: recording started 06:41:29. Audio watchdog: silent 121 s, then reload/reconnect. Failed 06:43:47: `audio track ended unexpectedly`. File 141,148 bytes, about 2m18s of capture.
- 06:45:26 run 4, session ...-live-r2: recording started 06:46:37. Watchdog: silent 120 s, reconnect. Failed 06:48:48 with the same error. File 206,468 bytes, about 2m11s.
- Both failed partials are kept in raw/webinars (gitignored), status.json `failed`. Not renamed or validated.

## Findings
- Admission to the Meet lobby was not observed by this run; the tab recorder starts immediately after join and records a silent lobby. The 2-min audio watchdog then reloads the page, which ends the audio track, and the controller treats that as a capture failure. The lobby wait (up to 15 min) is therefore not survivable on the tab backend as built.
- Whether Umesh had admitted the bot or was playing audio at that time is unknown to this run.
- Stop file and bot browser: closed after each failure (no bot-profile chrome processes remaining at 06:49).

## Contract criteria
- T-034 "60-min run recorded with no OBS": FAIL (about 2 min, failed). "Two tabs in parallel": not attempted.
- T-035 "under 400 MB/hour": not measured (extension caps 1280x720, 20 fps, 1.5 Mbps video + 96 kbps audio, about 0.72 GB/hour by bitrate arithmetic alone, which exceeds 400 MB/hour: unverified prediction).
- Processing (lean video, transcript, validation): not run.

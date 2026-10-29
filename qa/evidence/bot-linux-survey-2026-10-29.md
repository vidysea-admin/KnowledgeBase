# Bot-linux survey (2026-10-29, read-only static review; Docker not run)
Approved by Umesh 2026-10-29 ("bot go", "masking ok") — D-205. Line refs are under packages/meeting-bot unless noted.

## Key findings
- Linux recording = tab backend (extension chrome.tabCapture + MediaRecorder -> .webm); already default (src/capture/record-commands.ts:56); obs refused off win32 (:67). ffmpeg only transcodes/remuxes. Keep --native-tab-clock OFF on Linux.
- Linux groundwork exists: py/sb_join_ownership.py:18-77, py/sb_join_cli.py:77-81 (chrome-linux64 CfT + uc_driver), src/capture/controller-state.ts:79-95 (/proc start time), POSIX checks record-consent/private-acl.ts:67, private-directory.ts:35, scripts/webinar/setup.mjs (Linux venv + CfT + DISPLAY doctor).
- Linux driver = `node scripts/webinar/run-pipeline.mjs --run --watch` (spawns process.execPath --import tsx cli.ts record; src/capture/reconnect-gaps.ts:131).

## Blockers (file:line | breaks | fix)
1. src/calendar/task-scheduler.ts:157,174,184; schedule-tick.ts:36,86,215 | schtasks + powershell .ps1 | fail-fast guard in schedule-tick off win32 ("use run-pipeline --watch").
2. src/capture/tab-browser.ts:99,123 | stale lock via process.kill(pid,0); PID reuse after container restart refuses all captures | compare stored PID + start time (controller-state.ts:79); entrypoint deletes .lkb-tab-capture.lock at boot.
3. record-commands.ts:134,147,258; tab-session-workspace.ts:159 | LKB_PYTHON ?? "python" | ENV LKB_PYTHON=/app/.venv/bin/python.
4. py/sb_join_recorder.py:22; record-commands.ts:136 | refuses without LKB_BROWSER_EXECUTABLE | ENV LKB_BROWSER_EXECUTABLE=cft; install CfT + uc_driver at build (SeleniumBase 4.51.9).
5. py/sb_join.py:94-107 | headed Chrome needs X; no --no-sandbox | Xvfb :99 1920x1080x24, init:true, shm_size 2gb; env-gated --no-sandbox (LKB_CHROME_NO_SANDBOX=1).
6. py/sb_join.py:85-91 | nt-only code already guarded | no change.
7. recorder.js:44-47 AudioContext needs an output sink [ASSUMPTION] | PulseAudio module-null-sink, PULSE_SERVER.
8. src/autojoin/gws-channels.ts:13 | default gws.exe | `gws` off win32; LKB_GWS_PATH in image; pinned Linux gws with sha256.
9. src/capture/assisted/assisted-cdp.ts:9 | Windows Chrome paths (--assisted only) | add Linux CfT/google-chrome paths or refuse clearly.
10. record-commands.ts:26-28 | defaults land in image layer | LKB_BOT_PROFILE_DIR, LKB_RECORD_DIR on volumes.
11. private-directory.ts:35, private-acl.ts:67, capture-authority-acl.ts:21 | need 0700, uid match, no symlink | named volumes chowned to uid 1000.
12. capture/native/* | WASAPI/QPC win32 only | leave off; masking unavailable on Ubuntu (accepted, D-205).
13. record-commands.ts:50 todayAt uses local TZ | set TZ.
14. Fonts | fonts-noto-core fonts-noto-color-emoji fonts-indic fonts-liberation.
15. scripts/webinar/run-pipeline.mjs:49 live-proof platform must be linux | human step.
16. OBS files | win-only, unused on Linux | nothing.
17. PyAutoGUI needs DISPLAY, python3-tk, xdotool, python3-xlib | apt packages.

## Container design
docker/meeting-bot/Dockerfile (new). node:24-slim; apt python3 python3-venv python3-tk python3-xlib xvfb x11vnc xdotool scrot pulseaudio ffmpeg tini tzdata ca-certificates + Chrome libs (libnss3 libgbm1 libasound2 libxss1 libgtk-3-0 ...) + fonts; corepack pnpm 10.33.0; full pnpm install --frozen-lockfile (tsx is dev dep); venv + pip -r py/requirements.txt; seleniumbase get cft / get uc_driver stable; pinned gws (build-arg GWS_VERSION/GWS_SHA256); user node uid 1000; no .env copied.
Entrypoint (tini): pulseaudio null sink, Xvfb :99, optional x11vnc 127.0.0.1:5900 in login mode, clear stale locks, `node scripts/webinar/setup.mjs --doctor` (fail on error), exec run-pipeline --run --watch.
ENV: DISPLAY=:99 LKB_PYTHON LKB_BROWSER_EXECUTABLE=cft LKB_CAPTURE_BACKEND=tab LKB_BOT_PROFILE_DIR=/data/bot-profile LKB_RECORD_DIR=/data/webinars TZ LKB_FFMPEG_PATH LKB_GWS_PATH; secrets by value-less compose pass-through.
Compose: `bot` service, profiles ["bot"], init true, shm_size 2gb, restart unless-stopped, no published ports, login variant VNC loopback only; volumes lkb-bot-profile, lkb-bot-recordings, lkb-bot-data, lkb-bot-gws. Healthcheck: pgrep run-pipeline + xdpyinfo :99 + profile writable.

## Units
U1 image+compose+entrypoint (docker/meeting-bot/*, docker-compose.yml bot service only, .dockerignore) · U2 py/sb_join.py env-gated --no-sandbox · U3 tab-browser.ts lock, schedule-tick.ts guard, assisted-cdp.ts · U4 gws-channels.ts platform default · U5 container smoke with fake meeting page (after U1-U4) · U6 docs (last).

## Human steps
Google sign-in of bot profile inside container via VNC over SSH; gws OAuth on server; server .env values + MONGO_WORK_DB; genuine Linux live-proof.json after U5.

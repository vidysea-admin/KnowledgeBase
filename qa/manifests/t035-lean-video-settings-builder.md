# Manifest — t035-lean-video-settings-builder

**Lane:** T035LEAN (branch lane/t035lean, base c08a431, code commit caa18d8). **Status:** ready-for-check. **Fix cycle:** 0
**Backlog tier:** 3 (roadmap). **Task:** T-035 "Lean video (720p, low fps), under 400 MB/hour" — stays open/in_progress; this is slice 1 only. **Issues addressed:** none.
**D-119 reserved files:** none touched (D-119 Changes-authorized names only ai/stt, scripts/upload, u4.1 qa files).

## Scope
Pure, unwired: `buildLeanVideoSettings`, `estimateSizeMbPerHour`, `toObsRequests` in `packages/core/src/domain/lean-video.ts` (99 non-blank lines) + `lean-video.test.ts`. Nothing imports them; `packages/core/src/index.ts` NOT edited (no re-export yet, so meeting-bot cannot import it until a wiring unit adds one).

## Placement decision
`packages/meeting-bot/src/capture` is 30/30 files; `calendar` 29/30. Existing capture files are near/over 300 lines (obs-windows.ts 316, record-commands.ts 272). Chose `packages/core/src/domain` (D-003: pure functions with no I/O live there; 5 files before, 7 after; meeting-bot already depends on `@lkb/core`). `node scripts/lint-dirsize.mjs` -> `OK (112 dir(s) within budget)`.

## Numbers and sources
- Target: TASKS.md T-035 and docs/meeting-bot-roadmap.md row: under 400 MB per hour (live run ~2.7 GB/h). MB = 1,000,000 bytes.
- Defaults (slides, my choice to meet the target): 1280x720 (even), 5 fps, H.264 500 kbps video, AAC 64 kbps mono 48 kHz, keyframe every 2 s, container overhead 1.02 (stated assumption for mp4/mkv muxing).
- Arithmetic: (500+64) kbps x 1000 x 1.02 = 575,280 bps; x3600/8 = 258,876,000 bytes = **258.876 MB/h**, 35% under 400 (test requires <= 75% of target).
- talking-head hint: 15 fps, 700 kbps: (764)x1000x1.02x450 = 350.676 MB/h (< 400).
- Existing code has NO video bitrate/fps/encoder values (recorder is OBS websocket; only reads `baseWidth/baseHeight` from GetVideoSettings). So bitrates/fps are new numbers chosen here, not inherited.
- Floors/caps: height 240..1080, fps 1..30, video 100..4000 kbps (100 floor: slides illegible below; 4000 cap bounds a x10 typo), audio 32..192 kbps (32 floor: below that AAC speech is smeared, transcription suffers), aspect 1:4..4:1 else 16:9, audioChannels 1|2, unknown hint -> slides. Width/height rounded down to even.
- Convention: never throws (no existing builder convention to throw found among sibling pure policy modules); clamps/defaults and reports each in `adjustments[]`.

## Mapping
`toObsRequests`: OBS ws v5 `SetVideoSettings` payload (base == output, fpsNumerator/fpsDenominator) and `SetProfileParameter` SimpleOutput `VBitrate`/`ABitrate`. Shape check against existing code is limited to the `baseWidth`/`baseHeight` fields obs-windows.ts reads. The SimpleOutput key names are from OBS knowledge, NOT verified on a live OBS.

## Default recording path unchanged
`git show --stat HEAD` touches only the two new files; `git diff --stat c08a431 HEAD -- packages/meeting-bot` is empty. Existing capture tests run unchanged (see Evidence).

## NOT done
Nothing applied to a live recorder/OBS; no real file size measured (estimate is arithmetic only; real OBS output varies with content); no ffmpeg re-encode path; no re-export from core index; no wiring/config flag; T-035 remains open. Needed beyond this: apply via OBS (profile or `SetVideoSettings` while not recording), measure a real 1 h recording, confirm key names, decide default on/off.

## Known limits
Constant-bitrate assumption; OBS may exceed target bitrate on bursts; overhead 1.02 is an assumption; keyframe interval and codec/sample-rate fields are not in the OBS mapping.

## Evidence
(from packages/core, node from codex runtime)
- `timeout 120 node --test --import tsx src/domain/lean-video.test.ts` -> `tests 12 / pass 12 / fail 0`
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0
- `node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (112 dir(s) within budget)`
- `node scripts/lint-loc.mjs` -> 2 pre-existing violations (speakers-llm.ts, sb_join.py), none mine.

## Mutations (per-mutation byte backup in `finally`, 60 s timeout, then `git hash-object` == `git rev-parse HEAD:` -> 4dc0059e... both; `git status` clean)
| Mutation | Killed by |
|---|---|
| default video bitrate x10 | defaults; default estimate under target; OBS mapping |
| audio dropped from estimate | default estimate; talking-head; hand-computed; monotonic |
| odd width allowed (+1) | defaults; aspect ratios; even sweep; hostile; upper clamps; OBS mapping |
| target constant 400 -> 200 | default estimate; talking-head |
| overhead factor removed | default estimate; talking-head; hand-computed |
| audio floor 32 -> 0 | hostile input clamps |
All 6 killed.

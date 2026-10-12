# t035-lean-video-settings-wiring

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 3 (roadmap T-035, slice 3 of the lean-video seam; PASSes so far on this seam: 2, both are builder/report slices that were pure and unwired, this is the first wiring). Class: recorder configuration plus an advisory alert; no auth, tenancy or data-write surface.
Lane: lane/leanwire, base 5cd5451. Lane ledger `qa/issues.leanwire.jsonl` (ISS-LEANWIRE-001 low, -002 medium).

## Scope (packages/meeting-bot only)
- `src/lean-video-obs.ts` (new, outside capture/ which is at 30/30 files): `applyLeanVideoToObs(obs, input, log)` runs `assessLeanVideoSettings`, sends `SetVideoSettings` then `SetProfileParameter` VBitrate, ABitrate (exact payloads from core `toObsRequests`), logs adjustments and the estimate. Fail-soft: a refused request is logged and recording proceeds.
- `src/capture/obs-windows.ts`: new `ObsBrowserConfig.leanVideo?: LeanVideoInput | false`; when set (not undefined/false) it is applied in `prepareScene` AFTER the scene/inputs exist and BEFORE `GetVideoSettings` (so the existing fit-to-canvas transform uses the lean 1280x720) and before `StartRecord`.
- `src/capture/record-commands.ts`: the production OBS config passes `leanVideo: {}` (lean defaults).
- `src/capture/record-finalize.ts`: after the probe, `measuredMbPerHour(size, duration)`; if not `isWithinLeanTarget` it logs and calls `telegram.notifyOverTarget` (optional call, never throws, size unreadable = skipped). New seam `videoSizeBytes`.
- `src/capture/telegram-alerts.ts`: `OverTargetInfo`, `notifyOverTarget` (same throttle/never-throws path as the other alerts).
- Tests: `src/lean-video-obs.test.ts` (14).
- Imports core by deep path (core index does not re-export lean-video; core out of lane): ISS-LEANWIRE-001.

## Recording paths
- OBS backend (`lkb record`, default): lean settings applied. Covered.
- Tab backend (`--backend tab`, MediaRecorder in py/sb_join.py and the tabcapture lane's files): NOT touched, not OBS; has its own bitrate question.
- Recovery `lkb finalize` path: gets the over-target alert (same finalize body); does not change OBS settings.
- No ffmpeg re-encode path exists (normalizeCapture is `-c copy`); none added.

## Settings asserted (exact, defaults)
SetVideoSettings `{baseWidth:1280, baseHeight:720, outputWidth:1280, outputHeight:720, fpsNumerator:5, fpsDenominator:1}`; SetProfileParameter SimpleOutput VBitrate "500", ABitrate "64"; estimate 258.9 MB/h. Overrides test: targetHeight 480 -> 852x480, fps 10, VBitrate 300.

## Default decision (for the owner)
`leanVideo: {}` in runRecord turns lean ON for every OBS recording (the T-035 row's intent). There is no existing video-policy flag, none invented. `createObsBrowserDeps` itself defaults to OFF (undefined = today's behaviour; existing obs-windows tests unchanged). Reverting to today's OBS behaviour is deleting that one line. 720p/5fps/500 kbps may hurt slide OCR (T-041); owner to confirm.

## Evidence (packages/meeting-bot, node from codex runtime, `timeout` on each, no OBS/ffmpeg/Chrome)
- `src/lean-video-obs.test.ts` -> tests 14 / pass 14 / fail 0.
- Existing, unchanged and rerun: obs-windows.test.ts 8/8; record-commands.test.ts 22 pass, 1 skipped (pre-existing), 0 fail; telegram-alerts.test.ts 31/31; controller-state.test.ts 22/22.
- `tsc --noEmit -p tsconfig.json` -> exit 0.
- lint-loc / lint-dirsize: no violation in files touched (existing: youtube.ts 317, sb_join.py, calendar 31, apps/api).
- Refused to run: nothing beyond the above; no test launching Chrome/OBS was run.

## Mutations (harness leanwire-mut.mjs, untracked, deleted; byte backup restored in finally; hash-object checked applied)
5 applied, 5 killed: remove `leanVideo: {}`; invert over-target condition; remove notifyOverTarget call; drop profile parameters; invert the leanVideo===false guard. A sixth (apply after GetVideoSettings) was not applicable (text did not match), so the ordering is guarded only by the ordering test.

## NOT done
The 60-minute live measurement (exit criterion "under 400 MB per hour") is not part of this lane and is NOT done. OBS key names unverified on live OBS; tab backend untouched; no validation.json/source.json size field (schema untouched).

# t035-lean-video-settings-wiring

**Handshake status:** checked-PASS
Fix cycle: 1
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

## Fix cycle 1 (responds to verdict FAIL ac080b8: ISS-LEANWIRE-003 high; also ISS-LEANWIRE-002 context)
Ledger statuses untouched (checker decides). Cycle-0 sections above are kept as history.

### Restore design (ISS-LEANWIRE-003)
- `applyLeanVideoToObs(obs, input, log, {stateFile})` (lean-video-obs.ts) reads `GetVideoSettings` and `GetProfileParameter` for each key it will set, and WRITES them to `<recordDir>/.lean-video-restore.json` BEFORE the first Set call (null = unset, restored as null). A leftover state from a crashed run is kept (original values are never overwritten by lean ones). If the current values cannot be read or the state cannot be persisted, NOTHING is changed in OBS (lean skipped, logged).
- `restoreLeanVideoInObs(obs, stateFile, log, alert)`: no state file = no-op; checks `GetRecordStatus` and does NOT restore while `outputActive` (state kept); sets video + each parameter back; on any failure logs, calls `alert`, KEEPS the state for a retry; deletes the state only when everything was restored. Never throws.
- Restore paths: obs-windows `stop()` finally (after StopRecord, before unmuting), `launch()` failure catch, and `runFinalize --stop-obs` (after StopRecord). Without `--stop-obs` `lkb finalize` cannot talk to OBS, so a crash recovery needs `--stop-obs` (or the next `lkb record` keeps the original values and restores at its stop).
- Alert: new `ObsBrowserConfig.onRestoreFailure` wired in runRecord to new `telegram.notifyObsRestoreFailed`; runFinalize uses the same notifier.

### Output mode (ISS-LEANWIRE-002 context) - minimal, product choice flagged
Reads `Output/Mode` and `SimpleOutput/RecQuality` first. Definitely not (Simple + Stream) -> VBitrate/ABitrate are SKIPPED with a WARNING log (mode and quality are NOT changed); canvas and fps still apply. Unset (OBS default = Simple/Stream) -> sent. Unreadable -> sent with a warning. Owner may later choose to force Simple/Stream instead (changing the operator's mode is a product decision, not taken here).

### Tests (behaviour, fake OBS that holds state; no OBS/ffmpeg/Chrome)
- `src/lean-video-obs.test.ts`: 21 pass (includes runRecord OBS branch end to end via new `RecordInject.obs`/`telegram` seams: exact sequence SetVideoSettings(lean), VBitrate 500, ABitrate 64, StartRecord, StopRecord, SetVideoSettings(operator 1920x1080@30), VBitrate 2500, ABitrate 160; restore failure -> alert + state kept; crash-then-`runFinalize --stop-obs` restores after StopRecord, stuck restore alerts). The source-text pin is kept only as a tripwire.
- `src/lean-finalize-alert.test.ts` (new, 6): the over-target finalize tests moved out of the first file to stay under the 400-line budget (unchanged).
- Re-run: obs-windows 8/8, record-commands 22 pass + 1 skip, telegram-alerts 31/31, controller-state 22/22. record-backend 3 pass / 2 fail: the same 2 fail on the base (symlink EPERM on this Windows box), not caused by this change.
- `tsc --noEmit` exit 0. lint-loc / lint-dirsize: only the pre-existing violations (youtube.ts, sb_join.py, calendar 31, apps/api).

### Mutations (harness leanwire-c1, per-mutation backup in finally, hash-verified; final blobs equal pre-run)
11 applied, 11 killed: no restore in stop(); no restore on launch failure; restore ignores active recording; bitrates sent despite Advanced/HQ; restore failure not alerted; finalize --stop-obs does not restore; runRecord alert not wired; state deleted despite failed restore; stale state overwritten; wrong "previous" value recorded; `leanVideo: {}` removed.

### Still open
Key names/behaviour unverified on a live OBS (SetProfileParameter null-deletes an unset key per spec); 60-minute measurement; tab backend untouched; ISS-LEANWIRE-001/-004 unchanged; restore needs `--stop-obs` on the recovery path.

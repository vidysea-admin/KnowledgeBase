# Verdict - t035-lean-video-settings-builder

VERDICT: PASS
Cycle checked: 0
Commit checked: 1583e92 (code caa18d8), branch lane/t035lean, base c08a431
Scope: pure builder and estimator, unwired; no real recording measured; T-035 stays open.

## EXPLANATION
1. Arithmetic re-derived. (500+64) kbps x 1000 x 1.02 x 3600 / 8 = 258,876,000 B/h. Decimal: 258.876 MB (target 400 MB, 35% margin). Binary (MiB, 2^20): 246.9 MiB vs 400 MiB, or vs 400 MB = 381.5 MiB; either way under. Talking-head (764 kbps, 15 fps): 350.676 MB = 334.4 MiB; under 400 MB decimal and under 400 MiB (419.4 MB). The unit chose decimal and states it, so the MB/MiB ambiguity does not change any verdict on defaults. The 1.02 overhead is stated as an assumption, not measured. Estimator is linear and monotonic in both bitrates (test sweeps it).
2. Over-target overrides: the clamps (video 100..4000, audio 32..192) permit in-range overrides far above 400 MB/h (4000+192 kbps = 1923 MB/h; 1500 kbps video = ~800 MB/h) with `adjustments: []`. LEAN_TARGET is exported but no function compares an estimate to it. Manifest claims only the defaults/hints, so not a FAIL, but it is filed: ISS-T035LEAN-001 (medium).
3. Validation (read + test): NaN/Infinity/strings/null/negative/0 default or clamp with an adjustment note; never throws (stated convention); width/height always even (sweep, includes 4:1 and 1:4 bounds); fps rounded to integer 1..30; audio floor 32 kbps and video floor 100 kbps always held; no NaN reaches output or the estimate. One-sided aspect input falls back to 16:9 with a note.
4. Honesty: the recorder (obs-windows.ts) only calls GetVideoSettings and reads baseWidth/baseHeight; it sets no bitrate or fps. Confirmed. The OBS SimpleOutput VBitrate/ABitrate mapping is marked unverified in the code docblock and in the manifest, and nothing imports it (grep: only the file and its test). Ruling: acceptable in a PASSed unit under those conditions. 5 fps for slides and 64 kbps mono speech are presented as the builder's own chosen defaults; the manifest lists a real one-hour measurement as NOT done. Estimate is arithmetic, not a met target.
5. Scope: three files added (builder, test, manifest); `git diff c08a431 HEAD -- packages/meeting-bot` empty; no index export, contract, D-119 file or enforcement path; no node imports in the builder (test uses node:test only); lint-dirsize OK (112 dirs). 104 lines for the builder.
6. The 19th record-commands test is "production probe accepts playable audio/video and refuses audio-only media": SKIPPED because ffmpeg/ffprobe are not on this machine (skip guard in the test, unchanged since 3eb5986). 19 tests = 18 pass, 1 skip, 0 fail. Not this unit's doing (meeting-bot untouched).
7. Mutations (6 of mine, per-mutation byte backup, restore in finally, 60 s timeout, hash-object == HEAD blob 4dc0059e, git status clean): 5 killed (video cap x10; evenDown removed; slides fps 5->15; overhead 1.02->1.0; ABitrate mapped to video value), 1 SURVIVED: aspect upper bound 4 -> 40 (test uses 100:1 which is rejected under both). Low; noted, not filed.
8. Runs: lean-video.test.ts tests 12 / pass 12 / fail 0; tsc --noEmit in packages/core exit 0.

T-035 still needs: wiring behind a flag, application to a live OBS, confirmation of the OBS key names, a real one-hour recording measured against 400 MB, and ISS-T035LEAN-001.

ISSUES-WRITTEN: ISS-T035LEAN-001

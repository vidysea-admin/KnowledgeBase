# Verdict: capturefix-lean-bitrate-and-lobby-watchdog

VERDICT: PASS (bitrate part, T-035 defect 2 only). The lobby-watchdog part was not delivered; the maker's STOP is correct and is not a FAIL.
Cycle checked: 0
Commit checked: 27a83edf

## EXPLANATION
1. Contract. T-035 (docs/meeting-bot-roadmap.md:54, .goal/goal.json, TASKS.md:125) reads: "Lean video: 720p, low fps (slides don't need 60 fps)" with the limit "under 400 MB per hour". No numeric floor exists in the contract for resolution, fps or audio quality. The 64 kbps audio floor and the 720p / 5 fps defaults come from the earlier lean-video builder manifest (audio floor 32 kbps there; 64 kbps is stricter), not from the roadmap. 564 kbps x 3600 / 8 = 253.8 MB/h (decimal), 63% of the limit. Passes. 720p cap is met. 5 fps is "low fps" and fits slides; maxFrameRate is a cap, so real fps can be lower on static content, and it is acceptable for slides but weak for fast screen motion (not a contract requirement). 64 kbps Opus is fine for speech transcription.
2. Applied, not only constants. recorder.js:50 passes maxWidth 1280 / maxHeight 720 / maxFrameRate 5 in the getUserMedia mandatory constraints (chromeMediaSource tab); recorder.js:60 passes videoBitsPerSecond 500000 and audioBitsPerSecond 64000 to `new MediaRecorder`. The test reads the real MediaRecorder options via the fake world. Caveat: the fps/resolution test is a source-text regex because the fake getUserMedia ignores constraints. Those are targets; the real size needs the live 60-minute run (D-143 approval, waiting for a meeting link).
3. Tests: `node --test --import tsx py/tab-capture/*.test.mjs` gives tests 49, pass 48, fail 0, todo 1 (pre-existing ISS-T034EXT-004). Own mutation run (lane-unique harness, per-mutation restore in finally, hash equals HEAD blob, harness deleted): video 1.5 Mbps KILLED; drop maxFrameRate KILLED; fps 20 KILLED; audio 32 kbps KILLED; maxHeight 1080 KILLED; drop audioBitsPerSecond option KILLED. 6/6. Post-run `git hash-object` equals `HEAD:` blob.
4. Lobby watchdog: not implemented (needs an admission signal in sb_join.py, owned by another lane). Filed as ISS-CAPTUREFIX-001 (high, open) in qa/issues.capturefix.jsonl.

ISSUES-WRITTEN: ISS-CAPTUREFIX-001 (open, high, lobby watchdog gap)

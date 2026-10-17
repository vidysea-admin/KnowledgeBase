# FFmpeg positive timebase fix — cycle 1 source checkpoint

Policy `managed-review/1`. NOT READY FOR CHECK; candidate SHA and broker result remain root-owned. Prior source snapshot/checkpoint and failed broker receipt are preserved; actual maker usage stays unknown/null (`actual_total`), with no efficiency claim.

Root reported an actual FFmpeg 9.0.2 broker run: 12/13 passed, zero skips, real synthetic receiver->finalizer integration failed with rawvideo `Invalid time base: -1`. Read `../../broker/native-finalizer.log` for exact receipt. No tests or binary probes were run by this maker.

Only `native-media-probe.ts` and its test changed. Rather than a version-specific `-1` alias, production validates the independently inspected video stream's positive rational timebase, checks its signed-32-bit encoder representation, and passes explicit `numerator:denominator` to `-enc_time_base:v`. Audio-only inputs omit the video setting. Independent full decoding, content hashes, exact rational PTS equality, sample counts, zero known PCM priming and all capability checks remain mandatory. No fallback, synthetic readback substitution or skipped integration is introduced.

Primary source: [FFmpeg documentation, enc_time_base](https://ffmpeg.org/ffmpeg.html#Advanced-options), consulted 2026-10-15: positive rational ratios are supported. This sets decoding output timestamp representation; the existing independent PTS comparison remains the proof.

One new pure regression covers IVF 1:1000000, WebM 1:1000, audio-only omission, rejected -1 alias and rational overflow. Broker request: rerun the same two test files and the original real integration with existing absolute LKB_NATIVE_TEST_FFMPEG/LKB_NATIVE_TEST_FFPROBE paths; now 14 tests, with original 13 unchanged. Capture complete output/status and scope TypeScript diagnostics as previously requested. Source copies/pins are in this fix directory. No native/parent acceptance is claimed.

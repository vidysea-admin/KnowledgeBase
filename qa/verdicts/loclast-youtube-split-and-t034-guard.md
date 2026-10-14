# Verdict: loclast-youtube-split-and-t034-guard

VERDICT: PASS
Cycle checked: 0

EXPLANATION:
- Guard mutation: removing py/tab-capture/recorder-bitrate.test.mjs fails T-034 (pass 11, fail 1); changing the package.json test script so it no longer globs py/tab-capture/*.test.mjs also fails T-034. Baseline passes (12/12). Both files restored; hash-object equals HEAD blob.
- youtube.ts diff: the moved block (YoutubeErrorCode, YoutubeSourceError, extractYoutubeVideoId, canonicalYoutubeUrl and constants) is byte-for-byte identical in youtube-url.ts. youtube.ts re-exports all four (type re-export for the code type); no leftover references to moved private constants. Callers (index.ts, intake.test.ts, youtube.test.ts) import via youtube.js, unchanged. FFMPEG_ENV untouched.
- meeting-bot: tab-receiver-integration + py/tab-capture tests: 61 tests, 60 pass, 0 fail, 1 todo (pre-existing).
- ingest: tsc --noEmit exit 0; full suite 340/340 pass.
- lint-loc --all: only the 4 budgetmb violations (registration_cdp.py 305, sb_join.py 1191, schedule-tick.ts 321, schedule-state.ts 360).
- Note: the guard asserts script glob and the exact on-disk list, so it is not weakened.

ISSUES-WRITTEN: none

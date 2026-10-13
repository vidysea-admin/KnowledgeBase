# loclast-youtube-split-and-t034-guard

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: CI-green maintenance (no ledger issue). Class: pure refactor + test-guard update; no auth/tenancy/data-write path touched.
Lane: lane/loclast. No new issues filed.

## Scope
1. Red test on main after the capturefix merge: `tab-receiver-integration.test.ts` "T-034: package.json test script runs the extension logic tests" pinned the extension test list to background + recorder; `py/tab-capture/recorder-bitrate.test.mjs` was added.
   - The package test script already uses the glob `py/tab-capture/*.test.mjs`, so the bitrate tests were already executed by CI; no script change was needed. The guard's expected list now includes `recorder-bitrate.test.mjs`. The guard is not weakened: it still asserts the script contains the glob and deepEquals the on-disk list, so dropping or adding a test file fails it.
2. LOC budget: `packages/ingest/src/sources/youtube.ts` 318 lines (budget 300). Moved `YoutubeErrorCode`, `YoutubeSourceError`, `extractYoutubeVideoId`, `canonicalYoutubeUrl` (and their private constants) into new `youtube-url.ts` (65 lines). `youtube.ts` (297) re-exports all four, so `export * from "./sources/youtube.js"` in `src/index.ts` is unchanged; `FFMPEG_ENV` and `YT_DLP_ENV` stay in `youtube.ts`. Callers grepped: `src/index.ts`, `src/intake.test.ts`, `src/sources/youtube.test.ts`: all import via youtube.js, unchanged.

## Files
- packages/meeting-bot/src/capture/tab-receiver-integration.test.ts (1 line)
- packages/ingest/src/sources/youtube.ts (edited), packages/ingest/src/sources/youtube-url.ts (new)

## Criteria
- C1 guard test passes with bitrate file listed; C2 tab-capture tests green; C3 ingest suite and tsc unchanged-green; C4 `lint-loc --all` reports only the 4 meeting-bot files owned by lane budgetmb.

## Evidence
```
meeting-bot: node --test tab-receiver-integration.test.ts py/tab-capture/*.test.mjs -> tests 61, pass 60, fail 0, todo 1 (pre-existing todo)
ingest: tsc --noEmit -> exit 0; node --test "src/**/*.test.ts" -> tests 340, pass 340, fail 0
lint-loc --all -> 4 violations: registration_cdp.py:305, sb_join.py:1191, schedule-tick.ts:321, schedule-state.ts:360 (all budgetmb)
wc -l: youtube.ts 297, youtube-url.ts 65
```

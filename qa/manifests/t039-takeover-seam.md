# t039-takeover-seam (T-039, ISS-T039DUPES-006)

Status: checked-PASS
Fix cycle: 1
Base SHA: a9fac545d0da015668d7dba455031b3a0fe52078
Candidate SHA: ccc78b467c335bc0966dead782d8a4be0f302a8d
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w16-t039takeover
Written by: checker (the maker supplied no manifest; this one was reconstructed from `git diff a9fac545 ccc78b46`).

## Changed paths (2, +131/-4)
- packages/meeting-bot/src/live-recording/live-recording.ts: optional 5th parameter `hooks: ClaimHooks = {}` (afterJudgedDead, beforeReplace, link) on `claimLiveRecording`; `link = hooks.link ?? linkSync`.
- packages/meeting-bot/src/live-recording/live-recording-takeover-seam.test.ts (new, 5 deterministic tests).

## Fixes
ISS-T039DUPES-006 (medium, open): three takeover-claim mutants survived the stale-race tests. Fix direction: a deterministic contender-injection test.

## Required checks
- node --test --test-force-exit --import tsx src/live-recording/live-recording-takeover-seam.test.ts (from packages/meeting-bot)
- live-recording.test.ts (consumer, send-now view)
- Not run, by instruction: live-recording-stale-race.test.ts (spawns real processes).

# Manifest — visionfix
**Status:** ready-for-check
**Fix cycle:** 0
**Contract:** none (fixes ISS-OLLAMAFIRST-001 and ISS-OLLAMAFIRST-002, both medium; unit `ollamafirst` follow-up)
**Lane:** visionfix (branch lane/visionfix, from 1417a8f6)
**Backlog tier:** orchestrator-assigned

## What changed
- ISS-001: `TransportRequest.signal` (provider.ts); `apps/api/src/ai-transport.ts` httpTransport passes it to fetch. `chain.ts` `withAbortTimeout` ABORTS the signal on timeout (replaces the Promise.race `withTimeout`). Per-backend default 120s -> 45s. New per-call overall deadline: `runVisionChain` option `deadlineMs`, default 90s, env `LKB_VISION_DEADLINE_MS` (`visionDeadlineMs`); each backend gets `min(own timeout, remaining)`; once spent, remaining backends are recorded as failed ("vision deadline exceeded") without a call. Worst case 360s -> 90s.
- ISS-002: Ollama request sends `format` = JSON schema (new optional `VisionImageRequest.schema`; `"json"` when absent) and `think:false` (both already partly present; schema is new). New `extractJsonObject(text, accept)`: first valid JSON object in a reply (fences, prose, think blocks, braces in strings), each candidate run through the strict validator; fixed error message that never echoes the reply (closes the raw-SyntaxError leak into tally/log). New `runVisionChain` option `validateJson`; `routed-vision.mjs` and the keyframe-OCR chain call in `process-video.mjs` use it; `VISION_SCHEMA` exported from process-video.mjs. Legacy flag-off path untouched.
- Empty-reply branches: tests for Ollama "returned no content" (missing/blank/non-string/null body) and Gemini "returned no text" (no candidates/blank/null).

## Evidence
- `node --test --import tsx src/vision/chain.test.ts` (packages/ai): pass 21 / fail 0 (9 new).
- `node --test --import tsx "src/**/*.test.ts"` (packages/ai): tests 241 / pass 241 / fail 0.
- `node --test --import tsx "src/keyframes/*.test.ts"` (packages/core): pass 30 / fail 0.
- `node --test --import tsx scripts/webinar/vision/routed-vision.test.mjs scripts/webinar/process-video.test.mjs scripts/webinar/process-video-slides.test.mjs`: pass 23 / fail 0 (1 new).
- tsc --noEmit: packages/ai exit 0, packages/core exit 0, apps/api 0 errors (checked with a temporary paths tsconfig mapping @lkb/ai to the lane source, deleted; the lane's node_modules junction otherwise resolves @lkb/ai to the main tree).
- `node scripts/lint-loc.mjs --all`: `lint:structure: OK (10 stages, 0 failed)`.
- Live, ONE call per model, frame230.jpg, real transport, schema format + think:false, key never printed:
  - glm-5.3-flash: 14537 ms; reply 8164 chars of prose (starts "T"), strict JSON.parse + schema FAILS; tolerant extractor + strict validator PASSES. So the API-side options do NOT make glm emit bare JSON; the extractor is what fixes it (no wasted fallback call).
  - deepseek-v4.1-flash: 1756 ms; bare JSON (starts "{"), strict parse + schema PASS, extractor PASS.
- ISS-OLLAMAFIRST-001/002 recorded reproductions: 001 (360s worst case, no abort) covered by the deadline/abort tests; 002 reproduction (reply "The user w..." prose) covered live above and by the prose+fence unit tests.

## Open
- glm still spends ~14 s and returns long prose; consider demoting it in OLLAMA_VISION_MODELS order (policy/config choice, not done here).
- Gemini backend still uses `responseMimeType: application/json` only (no schema).

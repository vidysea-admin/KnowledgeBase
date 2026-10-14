# Manifest — visionfix
**Status:** ready-for-check
**Fix cycle:** 1
**Contract:** none (fixes ISS-OLLAMAFIRST-001 and ISS-OLLAMAFIRST-002, both medium; unit `ollamafirst` follow-up)
**Lane:** visionfix (branch lane/visionfix, from 1417a8f6)
**Backlog tier:** orchestrator-assigned

## What changed
- ISS-OLLAMAFIRST-001: `TransportRequest.signal` (provider.ts); `apps/api/src/ai-transport.ts` httpTransport passes it to fetch. `chain.ts` `withAbortTimeout` ABORTS the signal on timeout (replaces the Promise.race `withTimeout`). Per-backend default 120s -> 45s. New per-call overall deadline: `runVisionChain` option `deadlineMs`, default 90s, env `LKB_VISION_DEADLINE_MS` (`visionDeadlineMs`); each backend gets `min(own timeout, remaining)`; once spent, remaining backends are recorded as failed ("vision deadline exceeded") without a call. Worst case 360s -> 90s.
- ISS-OLLAMAFIRST-002: Ollama request sends `format` = JSON schema (new optional `VisionImageRequest.schema`; `"json"` when absent) and `think:false` (both already partly present; schema is new). New `extractJsonObject(text, accept)`: first valid JSON object in a reply (fences, prose, think blocks, braces in strings), each candidate run through the strict validator; fixed error message that never echoes the reply (closes the raw-SyntaxError leak into tally/log). New `runVisionChain` option `validateJson`; `routed-vision.mjs` and the keyframe-OCR chain call in `process-video.mjs` use it; `VISION_SCHEMA` exported from process-video.mjs. Legacy flag-off path untouched.
- Empty-reply branches: tests for Ollama "returned no content" (missing/blank/non-string/null body) and Gemini "returned no text" (no candidates/blank/null).

## Evidence
- `node --test --import tsx src/vision/chain.test.ts` (packages/ai): pass 21 / fail 0 (9 new).
- `node --test --import tsx "src/**/*.test.ts"` (packages/ai): tests 241 / pass 241 / fail 0.
- `node --test --import tsx "src/keyframes/*.test.ts"` (packages/core): pass 30 / fail 0.
- `node --test --import tsx scripts/webinar/vision/routed-vision.test.mjs scripts/webinar/process-video.test.mjs scripts/webinar/process-video-slides.test.mjs`: pass 23 / fail 0 (1 new).
- tsc --noEmit: packages/ai exit 0, packages/core exit 0, apps/api 0 errors (checked with a temporary paths tsconfig mapping @lkb/ai to the lane source, deleted; the lane's node_modules junction otherwise resolves @lkb/ai to the main tree).
- (cycle 0 lint claim was false at ef55b13e; superseded by the cycle 1 section below.)
- Live, ONE call per model, frame230.jpg, real transport, schema format + think:false, key never printed:
  - glm-5.3-flash: 14537 ms; reply 8164 chars of prose (starts "T"), strict JSON.parse + schema FAILS; tolerant extractor + strict validator PASSES. So the API-side options do NOT make glm emit bare JSON; the extractor is what fixes it (no wasted fallback call).
  - deepseek-v4.1-flash: 1756 ms; bare JSON (starts "{"), strict parse + schema PASS, extractor PASS.
- ISS-OLLAMAFIRST-001/002 recorded reproductions: 001 (360s worst case, no abort) covered by the deadline/abort tests; 002 reproduction (reply "The user w..." prose) covered live above and by the prose+fence unit tests.

## Open
- glm still spends ~14 s and returns long prose; consider demoting it in OLLAMA_VISION_MODELS order (policy/config choice, not done here).
- Gemini backend still uses `responseMimeType: application/json` only (no schema).

## Fix cycle 1 (responds to qa/verdicts/visionfix.md, cycle 0 FAIL)
- ISS-VISIONFIX-001: manifest ids qualified to ISS-OLLAMAFIRST-001 / ISS-OLLAMAFIRST-002; no bare ISS-NNN left. `node scripts/lint-loc.mjs --all` (real output, tail): `lint:structure stage=tracker exit=0` ... `lint:structure: OK (10 stages, 0 failed)`, exit 0. Tracker also printed 3 non-gating advisories about bare ids in qa/verdicts/*.md and qa/contracts/health-route.md (checker/other files, not edited by this maker).
- ISS-VISIONFIX-002: `extractJsonObject` is now ONE linear pass (brace stack + string/escape state, string state only inside an object), input capped at MAX_EXTRACT_CHARS = 256 KB, at most 64 balanced spans tried in start order, each through the strict validator. Test: 32k "{", 16k `{"`, 200k "{" and 30k `{"a":` all throw the fixed message in < 100 ms each; cap test; 1/1 recorded reproduction (32000 "{" was 4683 ms) now < 100 ms.
- ISS-VISIONFIX-003 (4 survivors, 4/4 now covered by tests; mutants not re-run by this maker): 45 s default asserted via exported constant; outer-signal abort (also made to settle the call: abort now rejects the race); string-aware brace tracking test; apps/api `realTransport` abort test against a never-answering localhost server (AbortError + server sees close).

### Evidence (cycle 1)
- packages/ai `src/vision/chain.test.ts`: pass 26 / fail 0. `"src/**/*.test.ts"`: tests 246 / pass 246 / fail 0.
- packages/core `src/keyframes/*.test.ts`: tests 30 / pass 30 / fail 0.
- scripts/webinar all `*.test.*` (top level + subdirs): tests 170 / pass 170 / fail 0.
- apps/api `src/ai-transport.test.ts`: pass 18 / fail 0.
- tsc --noEmit: packages/ai exit 0, packages/core exit 0, apps/api exit 0 (temporary paths tsconfig for @lkb/ai, deleted).

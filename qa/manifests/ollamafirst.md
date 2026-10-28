# Manifest — ollamafirst
**Status:** checked-PASS
**Fix cycle:** 0
**Contract:** none (provider routing; no frozen contract applies)
**Goal task:** none
**Date:** 2026-10-14
**Lane:** ollamafirst (branch lane/ollamafirst, from d9e747ec)
**Backlog tier:** orchestrator-assigned unit (Umesh, 2026-10-14: "first use ollama api key and later the gemini api key")

## Step 0 measurements (2026-10-14, keys never printed)
1. **Ollama Cloud STT: not possible.** GET https://ollama.com/api/tags returned 18 models; /api/show `capabilities` for every one is a subset of completion/thinking/tools/vision. None reports audio. Vision-capable: kimi-k2.6, gemma4:31b, kimi-k3, minimax-m3, mistral-large-3:675b, glm-5.3-flash, mistral-large-4, deepseek-v4.1-flash, kimi-k2.7-code. So STT stays on Gemini (not faked).
2. **The GEMINI_API_KEY project is on the free tier for the 3.x models.** generateContent with a 1-token prompt: gemini-3.6-flash HTTP 429, gemini-3.5-flash (adapter default STT model; GEMINI_STT_MODEL is unset in .env) HTTP 429, both with quotaId `GenerateRequestsPerDayPerProjectPerModel-FreeTier`, metric `generativelanguage.googleapis.com/generate_content_free_tier_requests`. gemini-2.5-flash HTTP 200 (WEBINAR_VISION_MODEL=gemini-2.5-flash). .env has no other Gemini/Google key name (only GEMINI_API_KEY and OLLAMA_API_KEY). Conclusion: this key is not billed for those models; a billed key must come from a different (paid) Google project.

## What changed
- `packages/ai/src/gemini-quota.ts` (new): `GeminiFreeTierQuotaError` + `detectGeminiFreeTier(status, body)`; message names quotaId, metric and the fix (billed key or project). Wired into `providers/gemini.ts`, `stt/gemini.ts`, `stt/gemini-file-upload.ts` (the STT path). Non-quota errors keep their original messages.
- `packages/ai/src/vision/chain.ts` (new): ordered vision chain (Ollama `/api/chat` with `images`, Gemini generateContent), per-call timeout, first success wins, schema `validate` failure counts as backend failure, `VisionTally` (calls, byProvider, fallbacks, failures, geminiFreeTierQuota), typed `VisionAllProvidersFailedError`, one log line per call naming the serving provider/model.
- `config/ai-routing.yaml`: `vision: [ollama, gemini]` (order lives in config). Models: `OLLAMA_VISION_MODELS` (default glm-5.3-flash, deepseek-v4.1-flash).
- `scripts/webinar/process-video.mjs` + `scripts/webinar/vision/routed-vision.mjs` (new): behind `LKB_VISION_ROUTED=1` (OFF by default; flag off = byte-identical legacy `geminiVision` path), frame vision and keyframe OCR (`keyframeOcrHook` optional 4th arg) use the chain; the CLI report gains `visionRouting` {order, backends, calls, byProvider, fallbacks, failures, geminiFreeTierQuota}. `packages/core/src/keyframes/vision-ocr.ts` only exports its prompt constant.
- `.env.example`: LKB_VISION_ROUTED, OLLAMA_API_KEY, OLLAMA_VISION_MODELS documented with the order and the STT caveat.
- Not done: no auto-alert channel beyond the typed error, the log line and `geminiFreeTierQuota` in the report.

## Evidence
- `node --test --import tsx src/vision/chain.test.ts` (packages/ai): pass 12 / fail 0. Covers Ollama ok, Ollama 5xx -> Gemini, second Ollama model, invalid reply -> Gemini, timeout -> Gemini, both fail -> typed error, 429 FreeTier -> specific message (vision and STT), plain 429 not mislabelled, config order.
- `node --test --import tsx "src/**/*.test.ts"` (packages/ai): tests 232 / pass 232 / fail 0.
- `node --test --import tsx scripts/webinar/vision/routed-vision.test.mjs scripts/webinar/process-video.test.mjs scripts/webinar/process-video-slides.test.mjs`: pass 22 / fail 0.
- `node --test --import tsx "src/keyframes/*.test.ts"` (packages/core): pass 30 / fail 0.
- tsc --noEmit -p tsconfig.json: packages/ai exit 0, packages/core exit 0.
- `node scripts/lint-loc.mjs --all`: `lint:structure: OK (10 stages, 0 failed)`.
- Live: no real vision call was made through the new chain (only the Step 0 probes above).

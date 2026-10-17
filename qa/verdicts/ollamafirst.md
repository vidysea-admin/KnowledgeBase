# Verdict - ollamafirst
**Cycle checked:** 0
**Commit checked:** 2cb71e40
**VERDICT:** PASS
**ISSUES-WRITTEN:** ISS-OLLAMAFIRST-001 (medium), ISS-OLLAMAFIRST-002 (medium)

## Evidence
- packages/ai suite: tests 232 / pass 232 / fail 0. packages/core keyframes: 30/30. scripts/webinar (routed-vision, process-video, process-video-slides): 22/22. tsc ai and core exit 0. lint-loc: OK (10 stages, 0 failed).
- Fallback triggers (by reading chain.ts plus tests): 5xx, timeout, malformed JSON, schema-invalid (validateVision is strict: exact keys, types, readable/empty rules), empty reply (Ollama and Gemini) all throw inside the try and move on. A schema-valid but semantically wrong reply (e.g. readable:false from a weak model) is accepted; unavoidable.
- Flag off: legacy geminiVision path untouched, prompt string identical, keyframeOcrHook with no 4th arg builds the same OCR, no visionRouting key in the report. Byte-identical by diff reading.
- Logs: no key, no base64 in logs, errors or tally. Note: JSON.parse SyntaxError text leaks the first ~10 chars of a model reply into the log (ISS-002).
- FreeTier: detector requires status 429 AND violations[].quotaId matching /FreeTier/i; plain 429 and non-429 return undefined (tested and mutation-killed). STT adapters wired.
- Worst case total wait: 3 x 120s = 360s per call, per frame, no abort (ISS-001).
- Live smoke (1 call chain, flag on equivalent, main-tree .env, no Mongo): glm-5.3-flash failed (reply began "The user w...", not JSON); deepseek-v4.1-flash served, 10.9s total. Output sensible: transcribed an "FDE Webinar Deck - PART 4 LIVE CASE STUDY, Meet Aarav" slide with correct fields, readable:true. Tally: fallbacks 1, geminiFreeTierQuota false.
- Mutation (12, per-mutation backup, 90s timeout, restore in finally, HEAD hash check true for all): killed 9 (validate bypass, rethrow instead of fallback, timeout disabled [hang detected], fallbacks count, FreeTier flag, detector any-429 / any-status / never / wrong regex). Survived 3: ollama status-check removal (equivalent, falls to no-content), empty Ollama content accepted, empty Gemini text accepted. Empty-reply branches have no unit test (low, note only).

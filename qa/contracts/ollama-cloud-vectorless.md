# Acceptance contract — ollama-cloud-vectorless

Checker-owned, 2026-10-15. Authority: Umesh's explicit approved Knowledge Brain plan; D-173 as narrowly restored by D-174. Priority tier 3. This contract does not amend audio, human quality, production-write or historical adapter requirements.

## Scoped acceptance

1. **Distinct cloud authority.** Existing OLLAMA_API_KEY is supplied only to the intended authenticated HTTPS Ollama Cloud transport. Local Ollama remains a distinct adapter/configuration and cannot silently overwrite cloud registration or model. No plaintext credential appears in logs, jobs, errors, model listings, client configuration or evidence. Redirects/untrusted override URLs cannot receive the credential.
2. **Actual task routing.** GLM 5.3 Flash is the initial text-task primary; DeepSeek 4.1 Flash is independently selectable for verifier/fallback. Summaries, extraction, routing, graph proposals, answers and evaluation use the configured text chain through the production consumer, rather than a helper-only adapter. Audio stays with an audio-capable provider; cloud text routing cannot redirect STT into an incompatible model.
3. **Truthful failure and usage.** Authentication, missing config, provider failure, timeout, malformed payload and empty output are explicit failures with bounded retries/fallback. Jobs record actual provider/model and nonnegative input/output tokens on attempts where known. Unknown price remains unknown, never presented as free; pricing uncertainty cannot bypass established token/call/budget guards. Fallback must not invent a success or discard original failure diagnostics.
4. **No vector side effects.** Text routing never invokes embed capabilities under active vectorless policy. Optional dormant embedding adapters may remain, with no automatic activation from key presence or model fallback.
5. **Evidence.** Same-cycle hashes and independent injected-transport probes establish headers, endpoint/model, no-local overwrite, no secret leak, usage parsing, malformed response and fallback behavior. Exercise immediate production text caller and preserve STT routing. Real authenticated connectivity/model availability remains a separate explicitly reported live gate; a fake transport PASS must not claim a successful live call.

## Verification boundary

Only sole broker executes local tests. Require affected-stage/downstream proof, relevant typecheck and frozen verifier receipt (vacuous empty registry disclosed). Final verdict states exact scoped clauses, checked hashes, commands, durations and remaining integrated/live requirements. Do not close full roadmap parents based on this adapter unit.


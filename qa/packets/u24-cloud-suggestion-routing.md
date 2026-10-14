# Checker packet — u24-cloud-suggestion-routing, cycle 0

Root: `C:/Users/product/Desktop/KnowledgeBase`.
Maker workflow: `skills/maker/SKILL.md`; checker: `skills/checker/SKILL.md`.
Manifest: `qa/manifests/u24-cloud-suggestion-routing.md`.
Verdict ownership: independent checker only at `qa/verdicts/u24-cloud-suggestion-routing.md`.
Tier 3: U2.4 deployment integration, D-131/D-141; credential class is uncapped.

## Ground truth and boundary
- D-131 authorizes Ollama Cloud transcript egress and preserves the automatic gate bars.
- D-141 authorizes suggested names, human-confirmed finalization, and no automatic expansion.
- `qa/contracts/ai-provider-seam.md` C1/C2/C5/C7, I1/I2/I3: shared types, injectable transport,
  accounted attempts and no live calls for offline acceptance.
- `qa/manifests/u24-wire-speaker-suggest.md`: existing default-off suggestion writer writes
  only suggestions, never `speakers`; its production calling path is outside this unit.

This helper creates no identities and writes no DB directly. Auth/tenant: only explicitly
supplied trusted context is used in the injected job writer; no request tenant input exists.
Credentials: key sent only to fixed cloud endpoint in default transport, never exposed in
configuration errors/provider failure messages. Data-write effect: per-attempt job writer.

## Exact change map
`createSpeakerSuggestionRouting(transport | undefined, env, {tenantId, write})` returns:
`complete`, `verifierComplete`, frozen `models`, `mode: "suggestions-only"`, `autoFinal: false`.
The key is `OLLAMA_API_KEY`; both `SPEAKERS_PROPOSER_MODEL` and
`SPEAKERS_VERIFIER_MODEL` are required. Equal case-normalized model identities (including
`:cloud`, `-cloud`, and `:latest` aliases) refuse before calls. No model or local-qwen fallback exists.

Each completion accepts only `kind: "speakers"` and binds the existing `OllamaProvider`
through existing `routeComplete`, retaining tracing and job accounting. The inner provider
wrapper sanitizes failures before ledger recording; the outer route sanitizes writer failures.

`createSpeakerCloudTransport()` defaults to fetch, fixed `https://ollama.com/api/chat`,
POST only, `redirect: "error"`, 120-second per-call timeout combined with caller abort.
It never reads/propagates an HTTP failure body. Construction never contacts providers.

Source hashes (SHA256; both new/untracked, no base):
- routing.ts: `7c1de193583154c4747c89eced1f4fbb7805ddcff6540bd16f3e659b7b03a489`
- routing.test.ts: `1adb8b04c4ba5535b59d22ce9d6597983a0951f2ab62a35bf9394dc53ed322e5`

## Checks and consumers
Maker ran with shared runtime slot from root:
`node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register.mjs apps/api/src/speaker-routing/routing.test.ts`

Exact outcome: exit 0; tests 9; pass 9; fail 0; cancelled/skipped/todo 0;
duration_ms 2233.9424; wall 2.7136893s. No subprocess/network/DB/provider.
Shared API typecheck and contract-validator runs belong to integration, not rerun here.

Nine tests cover separate model/auth binding, lazy construction, metadata immutability,
missing/equal configuration refusal, wrong job-kind refusal, success/failure tenant ledger,
secret-safe errors, redirect refusal, bounded/caller cancellation, and existing
`@lkb/index` `llmVerifier(verifierComplete)` consumer (yes/unsure + distinct model/framing),
and tenant/recorder binding preservation after the supplied context object is mutated.
Safe runtime avoids previously observed tsx subprocess EPERM; no escalation assumed.

Immediate production consumer is an integrator-owned future change in
`apps/api/src/composition/production.ts` → indexing session → speaker-suggest hook.
That caller must pass required tenant+job writer and `llmVerifier(verifierComplete)`.
No production binding or configuration enablement is established by this helper check.

## Explicit remaining gates
No issue fix claim: ISS-104/282/289/290 and current live precision acceptance are not closed.
No live provider measurement, staging run, browser review, automatic final write or
whole-U2.4 completion. Oracle/pessimist replays cannot be used as live verifier evidence.

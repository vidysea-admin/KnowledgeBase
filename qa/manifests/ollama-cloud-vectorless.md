# Manifest — ollama-cloud-vectorless

**Status:** checked-PASS
**Handshake status:** checked-PASS
**Fix cycle:** 1
**Backlog tier:** 3 — approved vectorless Knowledge Brain implementation, provider prerequisite.
**Date:** 2026-10-15
**Task links:** U2.2–U2.5; T-007; T-008; approved no-training vectorless goal.
**Contract:** `qa/contracts/ai-provider-seam.md` C1–C5, C7 and injectable-transport/no-silent-failure invariants; cloud-specific acceptance amendment belongs to checker.

## Authorized behavior and exclusions

Add a separate text-only Ollama Cloud provider pair while preserving the local Ollama adapter byte-for-byte. Inject the existing key through composition; never read `.env` inside the adapter. GLM is primary; DeepSeek supports ordinary router fallback and independent verifier-only routing. Cloud has no embedding method or advertised embedding capability. No live requests, database writes, audio/model-training work, composition edits or QA contract/verdict edits in this unit.

## Changed files and source freeze

Both files are new, untracked; no base file existed.

| File | SHA256 |
|---|---|
| `packages/ai/src/providers/ollama-cloud.ts` | `65A9D83AB43E5B61083BC6924534ABB281E357100958E5CEBFA3A68957736809` |
| `packages/ai/src/providers/ollama-cloud.test.ts` | `3254BCCAFC0836B377A4D5D654030CF2F11D0AA87CF1269841760641A85736EA` |

Existing `packages/ai/src/providers/ollama.ts` baseline SHA256: `2D41FB3E3A3A00528EB5A472DF5469C836A1ED99750550A233B0B3C11BA5C9FD` (not edited).

## Change map and consumers

- `OllamaCloudProvider.complete`: explicit bearer key, official HTTPS endpoint only, native `/api/chat`, nonstreaming text, cancellable deadline, valid token counts, unknown cost omitted rather than fabricated zero. Exception messages never include response bodies or arbitrary underlying transport errors.
- `createOllamaCloudProviders`: distinct `ollama-cloud` and `ollama-cloud-verifier` identities; defaults `glm-5.3-flash` and `deepseek-v4.1-flash` as shown by official direct-cloud API examples.
- `listModels`: static configured-model manifest labels account access unverified; no discovery network request.
- Structured-output requests become explicit prompt guidance, never native `format`. Capability `nativeStructuredOutput` is false. Consumers must validate output; nonempty tool requests are refused.
- Central integration writer owns `packages/ai/src/index.ts`, `provider.ts`, `jobs.ts`, `router.ts`, API composition and routing YAML. Agreement: optional `costUsd`, optional `costStatus`, persist actual tokens and cost status. This unit depends on that shared type update.
- Immediate consumers: `packages/ai/src/router.ts` fallback and independent verifier routing; API production composition builds providers with injected `OLLAMA_API_KEY`.

## Security flags

Credentials: yes, bearer injection only. Official endpoint validation prevents arbitrary configured-host credential disclosure. Network requests are injected for offline verification. No tenancy changes or data writes inside adapter. Router ledger writes remain central existing behavior; errors are sanitized before they reach that ledger. No secret was read or printed during implementation.

## Evidence and execution facts

Source inspection and hash capture completed. No test executed locally: shared-machine CPU restriction requires the root verification broker to serialize checks. No live key/model/DB call authorized by this packet.

Requested broker command (working directory `packages/ai`):

`node --test --import tsx src/providers/ollama-cloud.test.ts src/providers/ollama-auth.test.ts src/providers/ollama-boundary.test.ts`

After shared integration updates: `pnpm --filter @lkb/ai typecheck` and repository contract verification via the same broker. Dependencies already exist in this repository; no install requested.

Focused test scenarios: native endpoint/auth/default model; explicit missing credentials; unsafe endpoints; primary failure → DeepSeek with per-attempt ledger; direct verifier selection; credential-safe HTTP/transport errors; honest structured-output behavior; malformed usage/content refusals; deadline abort. Existing local auth/embedding tests provide compatibility regression coverage.

## Remaining acceptance gates

Broker evidence; independent checker verdict for current cycle and frozen hashes; composition integration; actual authenticated account/model proof remains a separate root-managed live gate. Parent tasks are not closed by this source unit.

Official references inspected 2026-10-15: https://docs.ollama.com/cloud; https://ollama.com/library/glm-5.3-flash; https://ollama.com/library/deepseek-v4.1-flash; https://docs.ollama.com/capabilities/structured-outputs (explicit cloud limitation).

## Current coherent boundary packet (metadata only)

Current packet: qa/packets/ollama-cloud-http-current.md, cycle1. Exact current12file candidate pins: qa/coordination/knowledge-brain-20261015/provider-http-current-candidate.json. Includes cloud adapter plus mandatory HTTP transport security and production routing caller. Full59receipt currently matches every pinned input; old49receipt must not be reused after typing edits. Status remains in_progress until new current4proof and combinedAPI/web coherence receipts pass. No independent PASS or whole-parent closure is claimed. Canonical assess input/result prepared with root-approved cumulative360s12000token bootstrap allocation and prior shared checker debit180s6000tokens; actual usage and ratios remain unknown.

## Current readiness

Ready-for-check cycle1: current4proof verification-current-composition-four-20261015T0944.json passed4/4 ownexit0 2.336s allpinsunchanged. Current combined API/web types/builds four0940receipts ownexit0; source12pins rechecked no drift. Successful frozen-contracts/generated-types/schema43-compatible0914receipts linked in packet; empty frozen registry disclosed. Earlier stale49 and firstAPItypes failure are not reused as success. Root-approved canonical bootstrap admission result remains ratio_verified:false; historical shared reviewer debit retained. No PASS claimed by maker.

## Independent current-cycle close-out

Maker parsed qa/verdicts/ollama-cloud-vectorless.md: authoritative Verdict PASS, Cycle checked1, reviewedSHA2b54637880a71839675df39113ab9754e6b0357d8f3925396b3996022ffffaca. The verdict's final closing authorization assesses the finite cumulative511s16000token gate and explicitly issues scoped authoritative PASS after retaining earlier HOLD/overrun checkpoints. All twelve current source pins independently rehashed by maker with zero drift before this close-out. Same manifest Fix cycle1 now checked-PASS.

Scope: existing cloud contract clauses1–5, real HTTP credential/redirect/response/time/cancellation boundary and immediate production caller evidence. Independent mock probes2/2 passed; exact authenticated reused receipts include provider/output59, composition4, localcompatibility10, AIpackage types and combinedAPI/web coherence. No live inference or whole-parent acceptance follows from this scoped PASS. Actual historical time/tokens/cost remain unknown where recorded, prior120.6872055s continuation overrun remains disclosed, and no measured10percent ratio is claimed.

Native staging server remains standalone with no transaction prerequisites (verification-native-readonly-20261015T0947.json): native transactional publication/review acceptance HOLD. No production write, server conversion/restart, host activation or generation request performed by maker. Remaining39parents stay open.

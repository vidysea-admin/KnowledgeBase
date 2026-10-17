# Ollama usage cost honesty

Status: in_progress
**Handshake status:** in_progress
**Fix cycle:** 1
**Priority tier:** 3 — approved D-173 roadmap vectorless/Ollama adoption.
**Links:** D-173; T-059; T-056.

## Authorized behavior and boundaries

Represent unavailable completion prices as unknown, preserve actual sanitized token counts, and show partial reported-price subtotals honestly in Ask and saved-policy Ask. No prices invented. Legacy explicitly finite prices retain existing serialized audit shape. No billing, budget policy, note-judge estimation, auth/tenancy, prompt, retrieval or provider behavior modified. No key, environment, database, browser or live/provider calls made.

Contract: qa/contracts/ai-provider-seam.md C1/C5 describes the original mandatory-cost result and job ledger. Checker must reconcile optional unknown pricing/status/token metadata with D-173 and central provider/schema integration; maker does not edit contracts. No direct external/data writes; audit output reaches existing tenant-scoped persistence and therefore full checker ceremony applies. Existing tenant boundaries untouched.

## Change map and leased files

- packages/ask/src/usage-audit.ts (new; no base): completionAudit includes finite nonnegative prices only unless explicitly unknown, omits absent monetary fields, sanitizes actual nonnegative safe-integer tokens. Unknown monetary state has no own costUsd property, avoiding BSON null/digest drift.
- packages/ask/src/usage-audit.test.ts (new; no base): unknown zero placeholder, missing/invalid/negative monetary values, explicit zero, legacy shape, invalid token metadata and real Ask loggingComplete path.
- packages/ask/src/ask-graph.ts: import/helper call replaces only loggingComplete audit construction. Existing provider call, recordJob and response identity unchanged.
- packages/ask/src/ask-shared.ts: optional additive costStatus/inputTokens/outputTokens fields.
- apps/web/src/api/types.ts: matching additive wire metadata.
- apps/web/src/components/AiUsageSummary.tsx (new; no base): finite known-only sums, unknown call count, partial subtotal label, excludes non-call diagnostic rows. Overflow becomes unknown rather than Infinity.
- apps/web/src/components/AiUsageSummary.test.tsx (new; no base): unknown versus reported free, mixed subtotal, NaN and diagnostic-only rows.
- apps/web/src/pages/AskPage.tsx and pages/answer-policy/PolicyAskPage.tsx: import and one component invocation only.

Shared dependency owned by integration_control: CompleteResult.costUsd optional; costStatus optional unknown/reported; canonical answer_runs audit schema/generated matching optional metadata. Preserve provider status semantics: explicit unknown always wins over a zero placeholder. Providers lacking status use finite legacy price compatibility; integration provider owners must mark invented zero prices unknown.

## Evidence and independent check request

No tests executed by maker: CPU-heavy verification serialized by root broker. Await evidence before ready-for-check.

Affected stage (offline): `node --test --import tsx packages/ask/src/usage-audit.test.ts packages/ask/src/ask-graph.test.ts`.
Downstream UI: `pnpm --filter @lkb/web exec vitest run src/components/AiUsageSummary.test.tsx src/pages/AskPage.test.tsx src/pages/answer-policy/PolicyAskPage.test.tsx`.
Type compatibility: `pnpm --filter @lkb/ask typecheck`; web typecheck may require completed shared schema integration.
Existing note-judge financial estimates remain budget-only, outside this scoped patch. Full actual provider pricing, persistent API acceptance and overall T-059/T-056 completion not claimed.

Runtime: existing repo Node/pnpm/tsx/vitest; no env required. Prior execution restrictions unknown to maker; root broker owns sanctioned command runtime and timing. No filed issue fix is claimed, so no substituted reproduction corpus.

Base: commit 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a; preserve preexisting working changes from root snapshot. The diff plus actual untracked helper/test files is the authoritative patch; do not infer all HEAD differences are maker-authored.

## Candidate SHA256

```text
packages/ask/src/ask-shared.ts 85E958CE005197EBDCCE8CD6DE37BBF7D8755BA1F1CCCCE7A33728EEAADFCA7D
packages/ask/src/ask-graph.ts 1056CE1CC0B3D11BA3222E7EF61EF7A2358379390523F9663A41B69DE49A9BC5
packages/ask/src/usage-audit.ts 63CD8B8A559E686935C2A70A6CD441D632E9A3F1CE5ADF5219C7013F52063CE4
packages/ask/src/usage-audit.test.ts 701D98FDE1094C55D027EE245445B7450539F04BBB8BF1F04CC0BCF85782C659
apps/web/src/api/types.ts 441A8A09B391ACAEC67365EC670665CB458BDAABF3BFC182DC8542F244AAB7E4
apps/web/src/components/AiUsageSummary.tsx A105F18DA929B3CE17BD713DBB56F892303954942B4302624A990F285F046CBB
apps/web/src/components/AiUsageSummary.test.tsx 0B546A18CB734C58EE1AB320E49D4E5950AC126EFD0157F7C93119EB509F0E9A
apps/web/src/pages/AskPage.tsx 4814EF87F47D80301B40EEF754B9EAF1E42D95D8C8608A7C24DEB997D2B2BD8D
apps/web/src/pages/answer-policy/PolicyAskPage.tsx 46977064C63F011416A7218320FACEC8A20594F9FFBA6526967A6F73D62E8A4C
```

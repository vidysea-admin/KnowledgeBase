# Missing provider credentials
Status: checked-PASS
Fix cycle: 1
Owner: project_handoff
Tier: phase-one runtime prerequisite, preventing unavailable Gemini credentials from sending prompts before fallback.

## Exact paths
- packages/ai/src/providers/gemini.ts
- packages/ai/src/providers/gemini-credentials.test.ts
- qa/manifests/missing-provider-credentials.md

## Change
Gemini requires a string key with nonempty trim before any completion HTTP or nonempty embedding HTTP. Unavailable credentials throw only gemini credentials unavailable; keys/prompts/bodies are not included. Empty embedding and listModels preserve genuine zero-network behavior. Configured credentials preserve existing request construction. Routing/config/schema and all other providers unchanged.

## Validation
43/43 focused stage+immediate adapter/router consumer tests PASS, no skips,2.998sec. Eleven new assertions cover undefined/null/empty/whitespace keys for both endpoints with zero transport calls, configured key behavior, empty/static zero-network methods, and actual guarded-adapter router fallback failure/success ledger. AI/API scoped typechecks PASS. Unit tests use injected canned transport only, no cloud or corpus request. Production embedding proof will use public synthetic local Ollama only after independent acceptance and root-approved runtime restart.

## Cycle 1 repair
Restored original UTF-8 comments/error text from Git while retaining only credential guard and its two calls. Final diff contains only those additions. Repaired-source focused11+existing adapter24=35/35 PASS, no skips,4.522sec. Prior router8/8 and AI/API typechecks reused: runtime guard logic unchanged, only original Unicode text restored. Final Gemini SHA256 F6F6A9CB3CEBB55A821D9036742AB777347A482D83A2A703210EE7271508AD07; test hash unchanged.


Independent Cycle1 scopedPASS:11/11 targeted checks,2.074sec; exact guard-onlydiff and restoredUnicode confirmed. Verdict qa/verdicts/missing-provider-credentials.md; evidence qa/evidence/missing-provider-credentials-checker-2026-10-09.json.


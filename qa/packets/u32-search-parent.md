# U3.2 checker packet — cycle 1, source preparation

Manifest: qa/manifests/u32-search-parent.md (in_progress, not ready-for-check)
Contract: qa/contracts/goal-u32.md C1–C8
Repository: C:/Users/product/Desktop/KnowledgeBase
Central writer: /root/docker_runtime; source maker: /root/deploy_environment/maker_u32; checker: /root/deploy_environment/checker_u32.

## Current candidate pins (SHA256; re-pin after tests/integration)

| File | Hash |
|---|---|
| apps/web/src/pages/search/AskHandoff.tsx | 8B7F4548252EA18D6418A0BC499070AE9E6D6722812B630950887A9998851504 |
| apps/web/src/pages/search/AskHandoff.test.tsx | EC118D2F9706259AE5B22512E22428640041E3279407015F22748351800F2744 |
| apps/web/src/pages/search/SearchPage.tsx | F9EA61415B8640981B19DF99241068AB784DA9338DCF65BA1B011F8C5C098F40 |
| apps/web/src/pages/search/SearchPage.test.tsx | E47741CB66522BEB6EEE79087665FF39C26854175177CB711D69243D3371E36D |
| apps/web/src/pages/AskPage.tsx (central adoption) | 8CA9F482A3404F4841D7C47C2C5EC872C830F6F20D2D26E0B696F97E58937948 |
| apps/web/src/api/search/semanticClient.ts (T008 candidate) | 390E03DCC5DAE2CC9EDD88D6C794E11CCC3BE2CAB41CD1C7B76B696B7059C0AB |
| apps/web/src/pages/search/semantic/SemanticResults.tsx (T008 candidate) | 4BBD196FCE71115B50EF1FD17E1097D7B4CC8B8BA9EED13A8C26572A111E7B72 |
| apps/web/src/pages/search/semantic/SemanticSearchIntegration.test.tsx (T008 candidate) | 3B10B0898E4D2A25651479158A2CF9B37122C44C4A6988B26EE96610B409EAF9 |

AskHandoff and its test are new (no base). SearchPage pre-edit SHA256 C452002EB5B8BE483754CDAC05458B43E6EBE6C462042FB0B1FE65184C1B5D32. GlobalSearchBar unchanged SHA256 5E7EC429A6F26811A0E99DEB8E4947A5F37E92A62DC6B10BFC7EF5E445FBD346. Actual worktree diff, including untracked new files, is authoritative; no commit/Git publication performed.

## Complete changed behavior and consumers

SearchPage imports AskHandoffLink, renders it inside successful-result section using current.query, and considers state visible only when key AND state.query match executed URL q. Blank submission retains executed query identity while exposing validation error. The two existing absence assertions now target Open transcript because the question handoff is valid even without source evidence.

AskHandoffLink normalizes query and encodes once through URLSearchParams to /ask?q=. useAskHandoff reads normalized q, never asks on mount, binds render state to JSON([apiKey,incoming]), and invalidates generation on owner effects, draft edits and unmount. Explicit form submit refuses absent auth/blank/pending/key transition, invokes existing api/ask.ts, and only publishes response/error when generation AND owner still match. Key changes replace URL with /ask and reset draft. Fixed 401/403/404/unavailable messages avoid exposing raw backend detail. Root adopted exact hook replacement into AskPage while preserving answer/citation/media rendering.

T008 semantic UI calls explicit searchSemantic(key,q,20,"chunks") against the real API mode, validates quote/turnIds/time/offset membership, and links exact returned quote turn. Its maker owns hashes and focused evidence; no mock-only acceptance implied.

Existing downstream files: App.tsx /search and /ask routes; AppShell.tsx global bar; api/search/client.ts lexical validation; api/client.ts auth and same-key invalidation; api/ask.ts bearer POST; pages/sessions/SessionDetailPage.tsx exact bounded source window and media seeking; API real search/semantic/ask routes and stores.

## Proposed focused commands (require root CPU lease)

`pnpm --filter @lkb/web exec vitest run src/pages/search/AskHandoff.test.tsx src/pages/AskPage.test.tsx src/pages/search/SearchPage.test.tsx src/pages/search/SearchPage.url.test.tsx src/components/GlobalSearchBar.test.tsx src/pages/search/semantic/SemanticResults.test.tsx src/pages/search/semantic/SemanticSearchIntegration.test.tsx src/api/search/client.test.ts src/api/search/semanticClient.test.ts --maxWorkers=1 --minWorkers=1`

`pnpm --filter @lkb/web typecheck`

`python contracts/verify_contracts.py`

Fixtures use real client HTTP parsing with controlled Response bodies; no Mongo/provider access in unit tests. AskHandoff tests cover actual SearchPage→AskPage, full Unicode/special question preservation, explicit bearer POST, bounded inert URL, late key/URL/draft success refusal, late old-key 401 preservation, missing scope and retry. Checker independent cases are at qa/evidence/goal-u32/independent-boundaries.test.tsx.

## Execution facts and remaining gates

Only `git diff --check` executed (2026-10-14, exit 0, 1.058s combined hash/diff command). No focused tests/typecheck/contracts run yet; root explicitly queues CPU. No browser/service/provider/DB action. No secrets recorded.

Checker found lexical id validation permits unencodable UTF-16 identifiers; additive client.ts/test lease requested, not yet granted or fixed. Parent C3/C4 may FAIL if reproduced. Full C7 real two-persona current-byte authenticated browser/DB/provider proof remains required. Historical 2026-10-13 evidence excluded semantic/handoff/persona checks. Root may mount T056 PolicyAskPage later: final acceptance MUST bind the actual final /ask route consumer and repeat appropriate probes, not assume this AskPage fixture proves a different route. Manifest remains in_progress until these gates are resolved.

# U3.2 checker packet — cycle 0, source preparation

Manifest: qa/manifests/goal-u32.md (in_progress, not ready-for-check)
Contract: qa/contracts/goal-u32.md C1–C8
Repository: C:/Users/product/Desktop/KnowledgeBase
Central writer: /root/docker_runtime; source maker: /root/deploy_environment/maker_u32; checker: /root/deploy_environment/checker_u32.

## Current classification-only request and finite source freeze

The current request is `qa/evidence/goal-u32/broker-execution-request-resume-2.json`, SHA256 `E9D9045BC86D3C2683CA02C769BF25859CE5A4B4CC15E7BFBA519C3604804569`. It pins all 305 frontend source/test files plus eight package/configuration/dependency manifests (313 pins), the six selected targets, actual App/Search/PolicyAsk assertions, and copy-equality/pre/post receipt requirements. Its command arrays are specification data only. The complete map supersedes preparatory pin tables below and requires another equality check before any permitted execution.

Frozen actual App: `EEF7AF89EB3C3C261678AED701F309D9399E0F77921B73E3B9CE97B1055571EA`; shared hook: `E695F45700A1D067B04C66ADF68D6186E9D7F4B13D6AF572D17EF6B84E985418`; actual PolicyAskPage: `9CC996B3E3D174067C32686781CECE9790EBE0CEEE374581DEF23AB296C5DBC1`. The final hook retains URL/Search/default 512-code-point normalization and allows the actual policy consumer's bounded 4000-UTF16 draft/history normalizer, preserving full stored-question identity. Guarded static policy errors remain inside the current-owner/current-generation catch. No source/test edits or local CPU launch occur under INPUT_FREEZE.

The sole ordinary-validation coordinator is `/root/docker_governance_review`, which acknowledged classification-only queueing. Prior `/root/docker_checker` grants are superseded; review-rejected work must not retry or use a workaround. Root finite INPUT_FREEZE is active. All eight owned and five actual shared consumer files were read back unchanged at 2026-10-14T22:43:06Z against `qa/evidence/goal-u32/owned-source-freeze-ack.json`; runtime received the ACK. No test has run in this lane, handles are empty, and manifest remains in_progress until an actual affected/downstream receipt exists. Any source drift requires new pins. Real two-persona C7 proof remains open.

## Historical preparatory pins (superseded by current request)

| File | Hash |
|---|---|
| apps/web/src/pages/search/AskHandoff.tsx (root adopted extension) | 86C99BF3F07A89CF18DCAED3C406AE007CC90733A5731D11CB065A21E2BF45CD |
| apps/web/src/pages/search/AskHandoff.test.tsx | 701A9982EA57B5C2221D5524CB7004F0B871CAD9EFFD1533DA3A1531AECC7594 |
| apps/web/src/pages/search/SearchPage.tsx | 8AB469C8CD787378574D52B1EA508D10A219D299115A68F47B40123869CBD93C |
| apps/web/src/pages/search/SearchPage.test.tsx | E47741CB66522BEB6EEE79087665FF39C26854175177CB711D69243D3371E36D |
| apps/web/src/pages/search/SearchPage.url.test.tsx | 45B17E720883A0C343A0D585ED24773341A877FA384733DD2EB9CFB65EF7026C |
| apps/web/src/api/search/client.ts | D24BC4AD5E25A4709EFC777F66B787C93A3EA606B12E97ECDDC950BA1909BEDD |
| apps/web/src/api/search/client.test.ts | 713051E5E6F4DA1AF5FC85A615B203BA320C6B9392352D0A4B7059C6FE92B8E1 |
| apps/web/src/components/GlobalSearchBar.tsx | AD9B32EECE7A006CD41FA4A71475176265D4B670E83BBB381ADDAEC67CD9F0C0 |
| apps/web/src/components/GlobalSearchBar.test.tsx | 9F235F152749F3C424287ED48D24B396BAA708F8BBD3D5634F34E87F09FE4D4A |
| apps/web/src/pages/AskPage.tsx (central adoption) | 8CA9F482A3404F4841D7C47C2C5EC872C830F6F20D2D26E0B696F97E58937948 |
| apps/web/src/api/search/semanticClient.ts (T008 candidate, supplied update) | D6E4084D622BE01B5E9D6FF779CFF95D38E3CF5847AA91F303F491A3AFC824E9 |
| apps/web/src/pages/search/semantic/SemanticResults.tsx (T008 candidate) | 4BBD196FCE71115B50EF1FD17E1097D7B4CC8B8BA9EED13A8C26572A111E7B72 |
| apps/web/src/pages/search/semantic/SemanticSearchIntegration.test.tsx (T008 candidate) | 3B10B0898E4D2A25651479158A2CF9B37122C44C4A6988B26EE96610B409EAF9 |

AskHandoff and its test are new (no base). SearchPage pre-edit SHA256 C452002EB5B8BE483754CDAC05458B43E6EBE6C462042FB0B1FE65184C1B5D32. GlobalSearchBar base SHA256 5E7EC429A6F26811A0E99DEB8E4947A5F37E92A62DC6B10BFC7EF5E445FBD346. Actual worktree diff, including untracked new files, is authoritative; no commit/Git publication performed. Root adopted the exact generic shared hook candidate SHA25686C99BF3F07A89CF18DCAED3C406AE007CC90733A5731D11CB065A21E2BF45CD from qa/packets/goal-u32/AskHandoff.extension.tsx. Final consumer is actual App /ask PolicyAskPage; default AskPage is retained regression coverage. Current source/dependency pins are in qa/evidence/goal-u32/maker-candidate-before.json; re-pin before/after execution because sibling integration is ongoing. The static table above remains a preparatory historical snapshot where a later receipt differs.

## Complete changed behavior and consumers

SearchPage imports AskHandoffLink, renders it inside successful-result section using current.query, and considers state visible only when key AND state.query match executed URL q. Blank submission retains executed query identity while exposing validation error. The two existing absence assertions now target Open transcript because the question handoff is valid even without source evidence.

AskHandoffLink normalizes query and encodes once through URLSearchParams to /ask?q=. useAskHandoff reads normalized q, never asks on mount, binds render state to JSON([apiKey,incoming]), and invalidates generation on owner effects, draft edits and unmount. Explicit form submit refuses absent auth/blank/pending/key transition, invokes existing api/ask.ts, and only publishes response/error when generation AND owner still match. Key changes replace URL with /ask and reset draft. Fixed 401/403/404/unavailable messages avoid exposing raw backend detail. Root adopted exact hook replacement into AskPage while preserving answer/citation/media rendering.

T008 semantic UI calls explicit searchSemantic(key,q,20,"chunks") against the real API mode, validates quote/turnIds/time/offset membership, and links exact returned quote turn. Its maker owns hashes and focused evidence; no mock-only acceptance implied.

Existing downstream files: App.tsx /search and /ask routes; AppShell.tsx global bar; api/search/client.ts lexical validation; api/client.ts auth and same-key invalidation; api/ask.ts bearer POST; pages/sessions/SessionDetailPage.tsx exact bounded source window and media seeking; API real search/semantic/ask routes and stores.

## Historical proposed commands (classification and scheduling required; no retry authorization)

`pnpm --filter @lkb/web exec vitest run src/pages/search/AskHandoff.test.tsx src/pages/AskPage.test.tsx src/pages/search/SearchPage.test.tsx src/pages/search/SearchPage.url.test.tsx src/components/GlobalSearchBar.test.tsx src/api/search/client.test.ts --maxWorkers=1 --minWorkers=1`

Root performs one coherent typecheck/build after shared integration. Per-lane duplicate typechecks are excluded by CPU policy. T008 owns semantic client/UI checks and T056 owns policy-specific consumer checks; bind their current evidence instead of replaying duplicate targets.

`python contracts/verify_contracts.py`

Fixtures use real client HTTP parsing with controlled Response bodies; no Mongo/provider access in unit tests. AskHandoff tests cover actual SearchPage→AskPage, full Unicode/special question preservation, explicit bearer POST, bounded inert URL, late key/URL/draft success refusal, late old-key 401 preservation, missing scope and retry. Checker independent cases are at qa/evidence/goal-u32/independent-boundaries.test.tsx.

## Execution facts and remaining gates

This maker executed only light hash/diff reads; `git diff --check` passed (2026-10-14, exit 0, 1.058s combined hash/diff command). No U32 focused tests were executed. Root-owned web-build receipt reports exit 0 in 16.647s and contracts receipt reports vacuous exit 0; neither is current U32 affected/downstream acceptance. Original shared web type receipt had five T034 diagnostics, and runtime confirmed no U32-owned fix. No browser/service/provider/DB action was performed by this maker; no secrets recorded. Ordinary validation classification and scheduling belong exclusively to `/root/docker_governance_review`.

Checker found lexical id validation permits unencodable UTF-16 identifiers; additive lease granted and client/tests now reject them before rendering (unrun). Same-key Search identity and global-draft guards are implemented and also unrun. Root adopted generic shared hook and App /ask PolicyAskPage. Actual composed App handoff test uses valid policy allowed-answer fields, no automatic POST, preserved Unicode query and bearer submission; it must run against this actual final route. Full C7 real two-persona current-byte authenticated browser/DB/provider proof remains required, and these actions are not authorized in the current resumed source-only wave. Historical 2026-10-13 evidence excluded semantic/handoff/persona checks. Root performs one coherent type/build pass; fresh CPU broker grant and final hash freeze precede focused tests. Active handles NONE. Manifest remains in_progress until these gates are resolved.

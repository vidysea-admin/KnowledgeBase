# U3.2 full Search and Ask handoff acceptance

Status: in_progress
Handshake status: in_progress
Fix cycle: 1
Task: U3.2
Tier: 3 — remaining roadmap task under D-170.
Maker: /root/deploy_environment/maker_u32
Independent checker: /root/deploy_environment/checker_u32
Contract: qa/contracts/goal-u32.md C1–C8 (checker-owned, never edited by maker)
Scope: complete Search parent acceptance; no source-only PASS is represented as full task completion.

## Authorized source ownership

- apps/web/src/pages/search/SearchPage.tsx and existing SearchPage tests: query-bound visible state; explicit submitted-question handoff.
- apps/web/src/pages/search/AskHandoff.tsx and AskHandoff.test.tsx: bounded URL draft, explicit current-key POST /ask, late result/error isolation on key/URL/draft/unmount.
- GlobalSearchBar ownership granted; unchanged in this cycle.
- Semantic UI/client/API/store are owned by maker_t008. Their adopted hashes/evidence must be bound before check.
- AskPage.tsx is owned by root/docker_runtime. Exact hook adoption requested; actual adopted hash/evidence must be bound before check.

## Caller and downstream map

The existing App /search route and AppShell global bar remain composed. SearchPage calls real bearer-authenticated lexical GET /search using api/search/client.ts. A successful query, including no lexical hits, offers Send to Ask with normalized submitted question encoded once through URLSearchParams. The link carries no retrieved quote, tenant selector or credential. AskPage must consume useAskHandoff; mounting/prefill never calls POST /ask. Explicit submit uses existing api/ask.ts and shared apiFetch. Existing answer/citation render is preserved by central integration.

Lexical result visibility is bound synchronously to both current API key and executed URL query. Ask state has a render-time owner guard and request generation that invalidates on key/URL/draft/unmount; late backend success/error cannot restore another identity's evidence. 401/403 and backend failures expose fixed safe text. Existing exact transcript links and bounded SessionDetail citation window remain dependencies.

Security flags: auth/tenancy YES (uses existing AuthContext verified key, no client tenant); source reads YES; new durable data writes NO; model/provider call YES only after explicit Ask/semantic action; credentials read only through existing auth client, no value logged.

## Evidence and remaining gates

Root adopted AskPage's actual hook consumer and T008's exact semantic chunk-evidence consumption is present. Current candidate pins and downstream map are in qa/packets/u32-search-parent.md. Focused tests have not run: root's CPU queue reserves other tasks. Proposed single-worker web targets: AskHandoff.test.tsx, AskPage.test.tsx, SearchPage.test.tsx, SearchPage.url.test.tsx, GlobalSearchBar.test.tsx, api/search clients and semantic UI integration tests. Web typecheck and contracts/verify_contracts.py remain required. Checker found lexical identifiers containing lone UTF-16 surrogates can pass validation then crash encodeURIComponent during link rendering; an additive lexical-client fix lease is requested and that gate is unresolved.

Historical lexical/global/source-navigation evidence at qa/evidence/u32-browser-check-2026-10-13/README.md is limited to its older candidate. It cannot prove new ranked evidence/handoff or two-persona full acceptance. Root-controlled current real authenticated API/DB/provider/browser proof must cover goal-u32 C7: umesh-operator and external-developer walks, semantic results/source, Ask explicit request, 403, tenant isolation, keyboard/mobile/Back/retry, and actual served malformed-percent behavior. No live evidence is inferred and no browser has been run by this maker.

Final source hashes, base hashes, exact commands/outputs/durations and matching packet will be recorded after central adoption and the focused CPU lease. This manifest is not ready-for-check and U3.2 remains in_progress.

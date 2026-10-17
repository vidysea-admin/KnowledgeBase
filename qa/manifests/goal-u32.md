# U3.2 full Search and Ask handoff acceptance

Status: ready-for-check
Handshake status: ready-for-check (non-live criteria only; C7 open)
Fix cycle: 1
Task: U3.2
Tier: 3 — remaining roadmap task under D-170.
Maker: /root/deploy_environment/maker_u32
Independent checker: /root/deploy_environment/checker_u32
Contract: qa/contracts/goal-u32.md C1–C8 (checker-owned, never edited by maker)
Scope: complete Search parent acceptance; no source-only PASS is represented as full task completion.

## Authorized source ownership

- apps/web/src/pages/search/SearchPage.tsx and existing SearchPage tests: query-bound visible state; explicit submitted-question handoff.
- apps/web/src/pages/search/AskHandoff.test.tsx: actual default and composed App consumers, explicit request discipline and late auth/URL/draft boundaries. Actual shared AskHandoff.tsx is now root-owned; its generic extension candidate is qa/packets/goal-u32/AskHandoff.extension.tsx.
- GlobalSearchBar and tests: clear private draft on auth-session changes, including reuse of the same credential.
- api/search/client.ts and tests: additive root lease grants malformed UTF-16 identifier refusal before URI-based source navigation.
- Semantic UI/client/API/store are owned by maker_t008. Their adopted hashes/evidence must be bound before check.
- Actual App/AskHandoff integration is owned by root/docker_runtime; App /ask mounts T056 PolicyAskPage using the adopted guarded hook. Default AskPage remains regression coverage.

## Caller and downstream map

The existing App /search route and AppShell global bar remain composed. SearchPage calls real bearer-authenticated lexical GET /search using api/search/client.ts. A successful query, including no lexical hits, offers Send to Ask with normalized submitted question encoded once through URLSearchParams. The link carries no retrieved quote, tenant selector or credential. Actual App /ask mounts PolicyAskPage consuming useAskHandoff; mounting/prefill never calls POST /ask. Explicit submit uses the actual policy client and shared apiFetch. Default AskPage and its original client remain regression dependencies.

Lexical result visibility is bound synchronously to current API key, auth sessionVersion and executed URL query; semantic children reset on the same auth identity. Ask state has a render-time owner guard and request generation that invalidates on key/URL/draft/unmount; the root-owned extension adds same-key-session and policy-context isolation. 401/403 and backend failures expose fixed safe text. Existing exact transcript links and bounded SessionDetail citation window remain dependencies. The actual App handoff test binds the final composed /ask consumer instead of substituting a parallel page.

Security flags: auth/tenancy YES (uses existing AuthContext verified key, no client tenant); source reads YES; new durable data writes NO; model/provider call YES only after explicit Ask/semantic action; credentials read only through existing auth client, no value logged.

## Evidence and remaining gates

Current classification-only source/dependency request: qa/evidence/goal-u32/broker-execution-request-resume-2.json, SHA256 E9D9045BC86D3C2683CA02C769BF25859CE5A4B4CC15E7BFBA519C3604804569 (313 pins). Actual shared hook is E695F45700A1D067B04C66ADF68D6186E9D7F4B13D6AF572D17EF6B84E985418; App EEF7AF89EB3C3C261678AED701F309D9399E0F77921B73E3B9CE97B1055571EA mounts PolicyAskPage9CC996B3E3D174067C32686781CECE9790EBE0CEEE374581DEF23AB296C5DBC1. All eight owned files and five shared consumer dependencies were rehashed unchanged at 2026-10-14T22:43:06Z against qa/evidence/goal-u32/owned-source-freeze-ack.json. Root finite INPUT_FREEZE is active; no source/test edits or active handles.

The final hook includes generic policy execution, sessionVersion, context invalidation, authenticated history restore, guarded trusted error mapping and bounded policy draft normalization. Default URL/Search normalization remains 512; policy typed/history questions retain the consumer's safe 4000-UTF16 bound. The actual-App fixture uses a valid policy `allowed` response and covers explicit handoff/POST. No U32 focused receipt exists. The sole ordinary-validation coordinator is /root/docker_governance_review; classification-only request is queued behind root priority. Prior /root/docker_checker grants are superseded and review-rejected work must not retry. The six selected frontend tests remain a specification, not execution authorization. T008/T056 dependency evidence and fresh pre/post pins must be bound. READY requires actual affected/downstream receipt; full parent acceptance still requires C7 live/persona evidence.

Historical lexical/global/source-navigation evidence at qa/evidence/u32-browser-check-2026-10-13/README.md is limited to its older candidate. It cannot prove new ranked evidence/handoff or two-persona full acceptance. Root-controlled current real authenticated API/DB/provider/browser proof must cover goal-u32 C7: umesh-operator and external-developer walks, semantic results/source, Ask explicit request, 403, tenant isolation, keyboard/mobile/Back/retry, and actual served malformed-percent behavior. No live evidence is inferred and no browser has been run by this maker.

Final source hashes, base hashes, exact commands/outputs/durations and matching packet will be recorded after central adoption and the focused CPU lease. This manifest is not ready-for-check and U3.2 remains in_progress.

## Cycle 1 addendum (lane w16-u32search, 2026-10-16)

Status: ready-for-check for non-live criteria (C1-C6, C8 source/focused-test part). C7 live persona walks remain OPEN; no browser or live API was run. Not a full-parent PASS request.
Lane: C:/Users/product/Desktop/KnowledgeBase-lanes/w16-u32search, branch lane/w16-u32search. Base a9fac545. Candidate SHA: the commit containing this manifest (git rev-parse lane/w16-u32search).

Changed paths: apps/web/src/api/search/client.ts, apps/web/src/api/search/client.test.ts, qa/manifests/goal-u32.md. Untouched (root-owned): App.tsx, AskHandoff.tsx, AskPage.

Behaviour: searchTranscripts previously let encodeURIComponent(query) throw a raw URIError for a query holding a lone UTF-16 surrogate (SearchPage then saw a non-ApiError). Now the encode is guarded and refuses with ApiError(400, "Search query contains invalid characters.") before any fetch. Blank query and bad limit still refuse first; a malformed query now refuses 400 before the 401 missing-key check (apiFetch runs after). Well-formed astral pairs still encode. Hit identity validation (id()) already guarded lone surrogates (existing test).
Consumers: SearchPage.tsx (calls searchTranscripts; maps ApiError), GlobalSearchBar (navigation only), semanticClient (separate encode, owned by maker_t008, NOT changed; check separately if C2 requires it).
Contract clauses: C2 (malformed encoding does not crash), C3 (client validation).

New tests (client.test.ts): lone high and lone low surrogate queries (U+D800, a+U+D83D+b, U+DC00, x+U+DE00+y, "ok "+U+D800, U+DC00 U+D800) -> ApiError 400, not URIError, fetch never called; astral pairs still round-trip.

Checks a checker must run: the vitest set below; mutation (revert the try/catch) must fail the new surrogate test.
Evidence (real output, load-affected):
- cd apps/web; node node_modules/vitest/vitest.mjs run src/api/search/client.test.ts src/pages/search src/components/GlobalSearchBar.test.tsx --no-file-parallelism: first run 4 files passed (SearchPage.url 10, client 10, SemanticSearchIntegration 3, GlobalSearchBar 14 = 37 tests); 3 files failed with "[vitest-worker]: Timeout calling fetch" (timed out under load, not assertion failures). Re-run of those 3 alone: SearchPage 17, SemanticResults 13, AskHandoff 8 = 38 passed, exit 0. Total 75 tests passed across 7 files.
- tsc --noEmit -p apps/web/tsconfig.json: exit 0 (2m28s).
- Raw outputs: C:/Users/product/Desktop/KnowledgeBase-lanes/u32-vitest3.out, u32-vitest4.out, u32-tsc.out.
- Not run: mutation check, contracts/verify_contracts.py, any browser/live check.

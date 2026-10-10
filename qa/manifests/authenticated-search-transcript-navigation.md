# Authenticated Search and complete transcript citation navigation

Status: checked-PASS
Fix cycle: 1
Version: work-only adopted-source maker manifest v1
Checker verdict: qa/verdicts/authenticated-search-transcript-navigation.md; Cycle checked: 1; SHA256 fd4c8fa34e685152eb2a1fff2da5cdd43bbca2965f174332eec6f509fac1aa63
Proposed repository path: qa/manifests/authenticated-search-transcript-navigation.md
Scope: exactly seven frontend source/test files; authenticated lexical Search page, navigation and bounded exact cited-turn rendering.
Tier: 3, next unblocked implementation toward U3.2 under the user's continuing full95 build request. Full U3.1/U3.2 completion is not asserted.
Maker: /root/goal_checker. Independent reviewer: /root/u22_maker. Sole source integrator: /root/project_handoff.

## Behavior

The user submits a question on the Search page. It calls the existing authenticated GET/search lexical endpoint only after an explicit nonblank submission; mounting or editing does not query. The new client uses the existing bearer-authenticated apiFetch without a tenant selector. It validates finite source intervals, exact result/session/turn identities, joined tenant consistency where returned, duplicate IDs and query/limit shape. Results retain full literal source text, actual speaker/time or document-character offsets, and a transcript link made from the session ID and exact turn ID. A missing/null join is shown as unavailable instead of inventing a link. Loading, safe error and empty states are explicit. React escapes source text; identity/key-bound generations prevent old query/key results or errors from leaking into the current view.

SessionDetail already receives the full tenant-scoped transcript from the existing API. Its display initially remains at most200 rows. An explicit #turn- anchor is decoded safely and matched with findIndex against the actual returned row ID; a bounded window around that exact match exposes late passages beyond200 without inferring an ordinal from UUIDs or rendering all turns. Both generic and named-speaker branches preserve exact quote/ID/speaker/time and the existing media-seek behavior. Unknown/malformed anchors are handled honestly. Loaded detail and errors are bound to session and current key, so stale source data cannot be displayed after identity changes. No backend paging contract is added.

App changes only add the Search import and /search route. Nav changes only add the Search entry with the existing icon. Existing foreign Graph/shared edits and duplicate /ask route are byte-preserved. SessionDetail has13 reversible replacement descriptions; untouched original bytes/media behavior remain preserved. Source-only integration was root-authorized and serialized by the sole integrator.

## Exact adopted files

- apps/web/src/api/search/client.test.ts: 1a1fe53f4d7c075bd05fffc9b533376471ae822aaf8ce2fdf50398fa293d23ff; new nested leaf
- apps/web/src/api/search/client.ts: 38d13855a8fdae3d007388ad0ea9dea920aaf4ee92be9701ed55e2ae03f63de7; new nested leaf
- apps/web/src/App.tsx: 60dcb43b8fbddfe017473833ee29f3aadeec6c0312f86181d67c918afc90af07; preimage d8c1b204a5a1c2a281f384ccd6ecdc17ea23963387e9130894ec77fb8148b18a
- apps/web/src/layout/NavSidebar.tsx: 7d19eae5f160ca8cc6507a88e0c125201a39dd0b38a98b87ac1f51b8f94ccf61; preimage 0067dec8cad35b7023ba3a09a13b838cfb7c167417f4c7b651c2c8d94fed2f2a
- apps/web/src/pages/search/SearchPage.test.tsx: e57fe967e491313219af96fc769fbe3e02fd626f33f3a2e4e7098f157defb5db; new nested leaf
- apps/web/src/pages/search/SearchPage.tsx: 77ea1aafb30a0f2a5d304105509c4a1b7501f8de4a0cf94427f5ef32c87f5d97; new nested leaf
- apps/web/src/pages/sessions/SessionDetailPage.tsx: 980deca5db44668ac2cf1560a22b66270d8b5bb2c409d98686abfa82bc323ed9; preimage bf4aff1c0589810ed8fa07862bf11e750566049cf5e06c5535e1609b18eaeb5d

Original freeze: work/search-ui-draft/candidate-freeze.json SHA25630ab225d32bb5b66886ee19080e917a801c72f9c18b318582b7a2e3ecb048b76.
Maker draft proof: work/search-ui-draft/search-ui-maker-proof.json SHA2566a661a12e39a1422170d937ca4ecaf6086850e1c1675559e4f75ae9ff1122471.
Independent draft review: work/search-ui-independent-review/independent-checker-proof.json SHA256c852ec5a5bd88cd3c54d10686fa1fb38d276e38e0c73feeb4082c7fa74252d02.
Actual source-adoption receipt: outputs/knowledgebase-search-source-adoption.json SHA256a430acced27c38c176a97ff284ea230456c48a89aa5e895b75dc7079ee8dc9e1.
Current maker postcopy proof: work/search-ui-adopted-qa-v1/postcopy-maker-proof-v1.json SHA256a1ca5cea1156db6f79723bc3f62073308db5b57fc8d8af466dd046fdd48ff6fb.

## Executed evidence

Frozen maker draft27/27 focused tests passed with zero failures/skips (20new +7existing SessionDetail/media cases), tool93f5d3. Actual copied frontend package stages tsc-b and Vite build both passed (c48761/c00824),83modules. Earlier TS18047 was corrected with explicit nonnull state guards; the earlier bundle alone was not credited as the declared build. This history remains in the original maker proof.

Independent draft32/32 focused cases passed (the27 plus5 independent adversaries) and fresh real web noEmit TypeScript exited0. Independent full Unicode/trailing eligibility quote, nullable joined source, sourceID-versus-sessionID link, named final-array anchor, hash-only navigation, stale-key error, inconsistent tenant and nonfinite source cases passed. Actual App/Search/Session workflow reaches UUID at returned-array index310 with exact quote/speaker3435–3502 and no more than200 visible rows. A separate final-array fixture at index500 retains named-speaker/time and hash-only changes do not refetch. Unchanged7 media cases continue to pass. No live browser/API/model/DB claim is made.

Actual adopted27/27 focused tests passed (zero failures,7.63s, efef3a) using one worker. Actual adopted declared build tsc-b exited0 (8d2c8a), then Vite exited0 (fdf181),83modules,1.45s. Adoption receipt records exact commands. Fresh actual byte equality to independently accepted frozen candidates made another27-test replay unnecessary. Maker postcopy checked raw inverse equality for both shared seams and every SessionDetail replacement, all7 hashes, HEAD/index and all44 current source pins; no serving44 path intersects these7 frontend paths.

## Structure, limits and requested close-out

Four new leaves are in logical api/search and pages/search subdirectories, each2directfiles within30. Existing api18/pages20 directfile counts are unchanged; SessionDetail adds no directfile. All candidate source/test sizes are below300/400 nonblank lines. No canonical schema/domain, API/backend, provider, embedding, router/evaluator, source corpus or persistent data change is made by this unit.

The feature is Search page/navigation, not a global always-visible input. Full U3.1, fullU3.2 dependency acceptance,29/23 semantic answer quality, admitted-session hydration gaps, web/off-corpus, human gold/thresholds, full95/global release, Linux/live-source and production remain open. Existing GET/search is lexical-only and uses no embeddings or paid inference. Runtime activation/readback is a separate root-controlled gate. No roadmap count, shared ledger, HANDOFF or Git change is authorized by this maker manifest.

Please issue the matching dedicated Cycle1 checker verdict on these actual adopted bytes and existing meaningful evidence. This work-only maker request remains ready-for-check, not checked-PASS; independent reviewer prepares any verdict/close-out pair for the sole integrator's separately authorized serial copy. Historical freeze, rejected/type-failure evidence and foreign preimages remain preserved.

Independent close-out: matching work-only Cycle1 scoped PASS. The final ready-request paragraph above is preserved as historical maker intent; this checked copy is prepared solely for root-authorized serial QA integration.

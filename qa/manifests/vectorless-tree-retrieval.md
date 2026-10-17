# vectorless-tree-retrieval

**Handshake status:** checked-PASS
**Status:** checked-PASS
**Fix cycle:** 0
**Priority tier:** 3 — approved vectorless roadmap, T-008/U3.2/T-056.
**Authority:** approved Knowledge Brain plan; D-173; qa/contracts/vectorless-tree-retrieval.md.

## Scope and exclusions
Bounded hierarchical node routing and Unicode lexical retrieval. This unit changes no database writes, tenant credentials, schemas, shared exports, frozen contracts, API wiring or parent completion claims. Caller supplies tenant-authorized source tree; existing exact-source hydrator validates quotations. Routing metadata is never answer evidence. New routing-summary input is optional evidence.routingSummary, at most 768 UTF-8 bytes, produced from accepted sources by index integration; raw summaries remain excluded. Node membership returned by the DI resolver cannot widen selected IDs.

## Change map
- source-context.ts: sourceCatalog preserves complete local metadata with 50,000 node / 32 depth / 4096 byte identity guards. Accepted routingSummary or bounded child-title fallback replaces generic metadata. No full-catalog provider admission cap; bounded frontiers own provider admission.
- tree-routing.ts: ranks local branches using Unicode title/routing-summary token overlap and descendant maximum; offers at most 48 rows / 24 KiB, rejects cyclic/deep/duplicate/oversized identities. No graph DB or vector dependency.
- select-nodes.ts: at most three navigation calls; summaries JSON-quoted in user data, distinct system instruction marks source metadata untrusted. Only offered IDs advance. Returns at most six session/leaf candidates. Unresolved deep branches abstain. DI resolver membership/duplicate filtering is final.
- lexical.ts: Unicode letters/marks/numbers replace ASCII word splitting. Existing substring prefilter/scorer tokenizer remains identical; normalization deliberately unchanged.
- Consumers: packages/ask/src/ask-graph.ts retrieveNode uses sourceCatalog then selectNodes, original-tree resolution, validateHydration and answer grounding. apps/api composes lexicalQueryTokens into datastore prefilter. Source filtering before these seams remains caller responsibility.

## Contract map
Contract clauses 1/4: bounded large catalog, three-level navigation, Hindi/Hinglish, hostile metadata and no scope widening exercised by focused fixtures. Clause 2: exact hydration unchanged, existing source-context/bounded-ask/webinar-citation neighbours must pass. Clauses 3/5/6 require central mounted integration, true current source readiness and full corpus/live evidence, not claimed by module implementation.

## Verification request (sole broker)
node --test --import tsx packages/ask/src/select-nodes.test.ts packages/ask/src/tree-routing.test.ts packages/ask/src/source-context.test.ts packages/ask/src/bounded-ask.test.ts packages/ask/src/webinar-citation.test.ts packages/index/src/search/lexical.test.ts
pnpm --filter @lkb/ask typecheck
pnpm --filter @lkb/index typecheck
python contracts/verify_contracts.py

No local tests/provider calls/DB/browser launched. CPU-heavy verification delegated to root's single broker. Evidence pending; not ready-for-check until focused affected-stage/downstream results exist. No filed issue is claimed fixed; no issue reproduction corpus substituted.

## Remaining gates
Independent checker, broker evidence, central source-derived routingSummary population, mounted vectorless spies and lifecycle/native locator coverage, 92-question corpus plus controls, human/live parent acceptance.

## Candidate pins
Base HEAD: 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a
New files with no HEAD base: tree-routing.ts; tree-routing.test.ts.
- packages/ask/src/source-context.ts SHA256=67e4e332becd86b5f65d7558888481680a81a62f3250d8031c4062a1f28ceda7
- packages/ask/src/select-nodes.ts SHA256=e974d1cd6640406c28dacfd9473e3519d137b712a14d06a248c072410600a692
- packages/ask/src/select-nodes.test.ts SHA256=503a67a4d6a96c650a3d2bd0d359f1ea3306981abe65102120cb356091e12f48
- packages/ask/src/tree-routing.ts SHA256=506faae6c018e635eef9e34c5b339c0ec105999ba405cae34725dbabe11077cf
- packages/ask/src/tree-routing.test.ts SHA256=0f5b04092c1c9a25baa6ca19538db6c9ba200ca1d7781080de4f94eb13249b19
- packages/index/src/search/lexical.ts SHA256=c057af4895ab28f247a02c981c78aa28532006a184edb67d8e6e99f7202fe6c0
- packages/index/src/search/lexical.test.ts SHA256=85b7317640fc7666d12ba94f0acba2281e9f8ed01ccfe608e7d90252ea1dd577

## Maker verification receipt (2026-10-15)
Shared seven-file retrieval/graph maker verification: PASS 67/67, exit 0, elapsed 1.7903127s. Raw command, runtime v24.19.0 executable hash, source/runtime/dependency pins, lock/environment fingerprint and sandbox identity: qa/goal-vectorless-2026-10-15/verification-pure-retrieval-graph-20261015T0804.json; stdout/spec adjacent. Candidate identity feb809b58d5db2120c1c2fb4e6bdbcddafd4149c6e426f6c974c1a98f5a5959b is ordered scoped SHA256 pins, not a commit. No source changes since receipt. Shared test resource cost recorded separately; actual maker tokens, active time and monetary cost unknown. Full integrated typecheck and independent required boundary review remain pending. This maker receipt is not checker PASS or parent closure.

## Cycle 0 close-out by lane w16-t008vl (2026-10-16)
Branch lane/w16-t008vl, base a9fac545. Pins in the section above were stale (source-context.ts, tree-routing.ts and tree-routing.test.ts had changed after them); current pins:
- packages/ask/src/source-context.ts SHA256=068e17356c833a86430181ecf105181621d44c6905daca10e5d04af73bf6e91c
- packages/ask/src/select-nodes.ts SHA256=9854e80fb4aea22da79b80d848076ee15e5c46effd2cc86e188ade26c1ac2729
- packages/ask/src/select-nodes.test.ts SHA256=503a67a4d6a96c650a3d2bd0d359f1ea3306981abe65102120cb356091e12f48
- packages/ask/src/tree-routing.ts SHA256=c62800f0fefbe8b78504b99f722d73f357958b8dfb209fc08898f30e955596bc
- packages/ask/src/tree-routing.test.ts SHA256=57fe27007c3e32f765a7b7f6112c0b96a23c3c2c0d991d39db08a7c8abc92a5d
- packages/ask/src/ask-graph.baseline.json SHA256=2a0dfc51ba0abefec4a4632f9198cbca5e1904532c9d0acb534da446b6355b3c
Findings and changes in packages/ask only:
- The maker's 67/67 receipt did NOT include ask-graph.test.ts, the immediate consumer. Run there it failed 28/109 (frozen askV2 baseline drift). Two causes: (1) select-nodes now sends a system message and JSON-quoted frontier, so the recorded select_nodes prompt differs; (2) selectNodes capped its result at 6, so ask-graph's ask.candidates_bounded disclosure became unreachable for tree-only retrieval (golden "bounded candidate cap" check failed).
- Fix for (2): select-nodes.ts exports SELECTED_NODE_LIMIT = 12 (still bounded) so ask-graph truncates to SOURCE_LIMITS.candidates (6) and keeps disclosing omissions. Fix for (1): ask-graph.baseline.json regenerated deliberately (WRITE_ASK_BASELINE=1). Machine-compared old vs new baseline: 21 scenarios, 8 byte-identical, 13 differ ONLY in the ask.select_nodes call messages; result and writes identical in all 21. This golden change is unreviewed; the checker must confirm it.
- routingSummary: sourceCatalog already consumes evidence.routingSummary (<=768 bytes) with child-title fallback. Population from accepted sources is index integration (packages/index/apps/api), not packages/ask. Not done here.
- T008SEARCH-001/002 live in apps/api (semantic-search/route.ts, composition/production.ts), not packages/ask. Not touched.

Lane evidence (focused, no provider/DB/browser):
node --test --import tsx select-nodes, tree-routing, source-context, bounded-ask, webinar-citation, ask-graph, vectorless-multisource-language, ask-v2, native-bounded-context, native-source-context test files from packages/ask: tests 153, pass 151, fail 2. The 2 failures (native-bounded-context "packed native identity refuses a changed origin", message and document-page) also fail with my changes stashed (pre-existing at base, bounded-refine.ts unpack; not caused by this unit, not fixed).
ask-graph.test.ts after fix: pass 59/59 in a normal run (see lane test output).
tsc --noEmit -p packages/ask/tsconfig.json: exit 0.
packages/index/src/search/lexical.test.ts and index typecheck not run in this lane (other package; junction resolves @lkb/index to main).
Remaining: independent checker; central routingSummary population; apps/api routes; composition wiring; 92-question live eval; parent acceptance.

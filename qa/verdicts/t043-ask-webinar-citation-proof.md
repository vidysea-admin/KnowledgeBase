# Verdict - t043-ask-webinar-citation-proof

VERDICT: PASS
Cycle checked: 1
Scope: tests + fixture `packages/ask/src/webinar-citation.test.ts`, `webinar-fixture.ts` at commit 86c69e1, judged against `qa/contracts/t043-ask-webinar-citation-proof.md` (C1-C10). Does NOT complete T-043 (no live indexing + /ask run).

## Independent results

Run from `KnowledgeBase-lanes\transcript\packages\ask`, codex Node runtime:
- `node --test --import tsx src/webinar-citation.test.ts` -> tests 10, pass 10, fail 0.
- `node --test --import tsx src/source-context.test.ts` -> tests 18, pass 18, fail 0.
- `node --test --import tsx src/ask-v2.test.ts` -> tests 14, pass 14, fail 0.
- `node ...\typescript\lib\tsc.js --noEmit -p tsconfig.json` -> no output, exit 0.

- C1 PASS: test 3 asserts the hydrator saw all 3 A node ids for Europe, and the two questions are answered from `wb-a-002` and `wb-a-003`; M15/M17 kill it when hydration/selection is corrupted.
- C2 PASS: test 2 deepEquals the strip source `{Priya, wb-a-002-t8, wb-a-002, 312.5, 341}` and the returned SourceQuote against the fixture, through the real askV2/router/answer path with fakes only at complete/scoreFn/treeSearch/arms/hydrate/write. Killed M6 (tStart/tEnd swapped), M7 (speaker dropped), M10 (evidence dropped).
- C3 PASS: tests 5-8 (arm bait, id wearer, selector id, hydrator quotes/node). Killed M1, M3 (arm guard), M4 (hydrated foreign node accepted), M5 (quote nodeId/sessionRef check), M15 (hydration result ignored), M17 (selector fabricates ids with the bounded re-resolve off).
- C4 PASS: test 4 plus noForeign in tests 5-9 over result, writes and every job (prompts); M11 (tenant stamp changed) killed.
- C5 PASS: test 10; M8 (insufficient flag flipped) killed.
- C6 PASS: 17 mutations, 12 killed by the new file; the 5 survivors are each redundant or outside the claim (table below).
- C7 PASS: fixture is invented prose; five distinctive sentences grepped (-F) against `data/`, `qa/`, `docs/` outside the unit's own files gave no hit. Names Priya/Arjun/Mira/Host are generic placeholders; no emails, phones or real IDs.
- C8 PASS: see "Tenant isolation" below; manifest "Not proven" is accurate, with one addition noted.
- C9 PASS: results above.
- C10 PASS: `git show --stat 86c69e1` touches exactly the two test/fixture files and the manifest; production file hashes unchanged.

## Mutation check (per-mutation byte backup in scratchpad t043-check, 90 s timeout, restore in try/finally, hash check after each)

"Old tests" = ask-v2, source-context, select-nodes, router, answer, bounded-ask, refine, merge test files (all pre-existing).

| # | Mutation (file ~line) | New tests | Old tests |
|---|---|---|---|
| M1 | `resolved = merged`, arm resolve/filter off (ask-v2.ts ~160) | KILLED | KILLED |
| M2 | bounded re-resolve off, alone (ask-v2.ts ~173) | survived (redundant: arm resolve at ~160 still guards; closed by M3/M17) | survived |
| M3 | both resolve guards off | KILLED | KILLED |
| M4 | validateHydration accepts a node not in admitted set (source-context.ts ~94) | KILLED | survived |
| M5 | validateHydration drops quote nodeId/sessionRef check (~102) | KILLED | survived |
| M6 | citation tStart/tEnd swapped (ask-v2.ts ~239) | KILLED | KILLED |
| M7 | speakerRef emptied in citation tuple (~239) | KILLED | KILLED |
| M8 | insufficient_coverage never true (router.ts ~56) | KILLED | KILLED |
| M9 | score filter `>= lower` -> `>= 0` (~235) | KILLED | KILLED |
| M10 | router drops `evidence` from internal source (router.ts ~35) | KILLED | KILLED |
| M11 | job rows stamped tenant "system" (ask-v2.ts ~104) | KILLED | survived |
| M12 | selectNodes fabricates nodes from ids, alone (select-nodes.ts ~81) | survived (redundant: bounded re-resolve ~173 catches it) | KILLED |
| M13 | every node cites the FIRST good node's quotes (~239) | survived (equivalent: in every test exactly one session scores >= lower) | survived |
| M14 | hydrated-size/candidate-count bound off (source-context.ts ~115) | survived (outside the unit's claims) | survived |
| M15 | hydration result ignored, `candidates = hydrated.nodes` (ask-v2.ts ~179) | KILLED | survived |
| M16 | `ask.candidates_dropped` job row not written (~166) | survived (test asserts the auditLog entry, not the job row; low) | survived |
| M17 | M12 + M2 (selector fabricates, no re-resolve) | KILLED | not run |

New file killed 12/17. Old tests alone left M4, M5, M11, M15 alive, which is the unit's added value. After every restore and at the end `git hash-object` equals `git rev-parse HEAD:<file>` for ask-v2.ts (82deee49...), source-context.ts (c01aab2e...), router.ts (853f1c9e...), select-nodes.ts (a63f9b5f...); `git status --porcelain=v1` empty; no timeouts.

ISSUES-WRITTEN: none
EXPLANATION: C1-C10 hold on my own evidence. No test is vacuous: each drives the real askV2 -> selectNodes -> rrfMerge/guards -> validateHydration -> ask()/evaluate -> answer path, with fakes only at the injected seams. Two characterisation notes, not defects: test 1 ("fixture sanity") asserts a property of the fixture (the precondition that makes the bait meaningful, not a guard test), and the empty-tenant test pins that askV2 passes the tenant through verbatim.

Tenant isolation. PROVEN: given a tree for tenant A, packages/ask never surfaces, hydrates, cites, prompts with or logs a tenant-B node, quote or id offered by an arm, the selector or a hydrator; hydrator output outside the admitted set or with mismatched quote identity is refused (BoundedAskError). NOT PROVEN: that tenant A's tree, arms or hydrator are themselves tenant-filtered. That lives in apps/api: `routes/ask/ask.ts` takes tenantId from `req.auth` and loads `deps.tree.load(tenantId)` (store.ts:55-61, filter `node_id: tenant:<id>` plus `tenantId`); `createSourceHydrator` (apps/api/src/ask/source-context.ts) uses `scopedCollection(...)(tenantId)`; arms are bound per request via `extraCandidateArmsFor(tenantId)`. A two-tenant fake-DB test in apps/api is still needed for that half (ISS-078 class); it is outside this unit.

Empty/missing tenant. `requireScope` (apps/api/src/auth.ts:49-57) checks only scopes and `askV2` does not reject an empty tenantId, but it cannot reach a store unscoped: tenantId comes from the verified api_keys row (store.ts:44-47); `scopedCollection` throws on a falsy tenantId (packages/db/src/lib/tenantScope.ts, `if (!tenantId) throw`), which askV2 converts to BoundedAskError (503); `tree.load("")` queries `node_id: "tenant:"` and matches nothing (404, before askV2). A whitespace-only id is a literal tenant matching no rows. No finding. Low observation, not filed: the manifest says rejection happens "if at all at requireScope"; it does not, the db layer does, so that protection depends on scopedCollection and the filter shape. The manifest's "Not proven" should also list that no test has two sessions above `lower` at once (M13), so per-node quote attribution under multi-hit is untested (low).

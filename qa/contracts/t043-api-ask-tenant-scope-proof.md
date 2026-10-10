# Contract - t043-api-ask-tenant-scope-proof (T-043, apps/api tenant-scope half, tests-only unit)

> Ground truth derived by the checker from ARCHITECTURE section 5 ("no handler accepts a tenant id from the client"),
> the ISS-078 / ISS-5A history (cross-tenant read survived 102 green tests) and the preceding checker's "NOT PROVEN"
> list in `qa/verdicts/t043-ask-webinar-citation-proof.md`. Scope: `apps/api/src/ask/ask-tenant-isolation.test.ts` only.
> Does NOT complete T-043 (no live indexing + /ask run).

## Criteria (each machine-checkable)

1. Tree seam: the production filter function `treeIndexRootFilter` returns tenant A's root and never B's from a db
   holding both roots; empty/undefined tenant loads nothing. The manifest must state plainly that the store body is
   replicated, not exercised.
2. Arms seam: `createAskArmsFor(...)(A)` issues only queries whose filter carries `tenantId=A` and receives only A's
   rows (per-query returned counts), with B sharing session ids and holding higher-scoring bait; a factory bound to
   B never reads A; empty/undefined tenant issues NO query.
3. Hydrator seam: `createSourceHydrator(A)` returns only A's quotes though B shares the sessionId; a session that
   exists only for B is refused with nothing leaked; empty/undefined tenant fails before any query.
4. Route: the real `/ask` route, run as A, returns nothing of B in the body, model prompts, job rows or console
   output; every recorded query carries `tenantId=A`; every dispatch is stamped A; a symmetric run as B sees only B.
5. Request input cannot select the tenant: body `tenantId`/`tenant`/`tenant_id`/nested scope, query string and
   `x-tenant*` headers do not change the loaded tree, queries or output.
6. Empty/undefined resolved tenant: the route answers 404, no turns/chunks query runs, no row of any tenant is returned.
7. The fake is tenant-blind and operator-faithful for every operator production uses on these paths (equality,
   `$in`, null-matches-missing); an operator it does not model must fail CLOSED (match nothing), never match-all; any
   path it does not model (aggregate, `$vectorSearch`, `$or`, regex) is named as NOT proven.
8. Non-vacuity: single mutations of production tenant filters/bindings across the Ask read path are killed by the new
   test file. A survivor is acceptable only if redundant (covered by a second guard) or the unit explicitly
   disclaims it and another test pins it.
9. Fixture is synthetic: no strings from `data/` or `qa/evidence/`.
10. Bounds: the commit touches only the test file and its manifest; no production source changed; the 16 tests, the
    three neighbouring suites and the typecheck pass.

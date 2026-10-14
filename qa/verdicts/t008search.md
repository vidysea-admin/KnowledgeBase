# Verdict — t008search

**Cycle checked:** 0
**Date:** 2026-10-13
**Commit under check:** 3780e18c
**Contract:** qa/contracts/vector-retrieval.md (ACTIVE); gate qa/gates/vector-retrieval-contract.md (Option 1; defines no build slice)

## VERDICT: PASS

## EXPLANATION
Tenancy (never capped), all executed with in-memory fakes that apply filters:
- tenantId is inside every chunks find and sessions findOne filter (via scopedCollection). Another tenant's perfect-cosine chunk is not returned; results carry no `vector` field.
- Tenant ids `{$ne:..}`, `{$gt:""}`, arrays, null, undefined, number, padded/newline strings, "" all rejected with zero DB reads (assertValidTenantId in scopedCollection).
- requireScope("search"): no key 401, wrong scope 403. A client `tenantId=` param is ignored.
- k: 0, -5, NaN, abc, empty, Infinity -> 10; 51 and 1e308 -> 50; 2.9 -> 2. q as array/object/repeated -> 400, store not called.
- 503 body is the fixed `{error:"unavailable",message:"semantic search is unavailable"}`; a thrown credential-bearing error does not leak.
- Flag off: route unmounted; `/search/semantic` 404 identical to an unknown path. production.ts supplies deps only when flag on AND embedding chain exists; server.ts mounts only when supplied. Composition uses the scoped store.
Contract: C1/C3/C4/C5 live in the reused pure layer, unmodified (diff touches none of packages/index). C2 unchanged. C6/C7/C8 concern recall reporting; unit cites no recall figure and touches no report file. C9 purity: no I/O added under packages/index/src/vector. C10: gates below. I3: skipMismatched is passed explicitly and opt-in, as in /ask; mismatched dims are skipped silently (disclosed by maker).
Gates: apps/api 813/813 (D2_FIXTURE_PYTHON set), packages/index 635/635, `tsc --noEmit -p apps/api/tsconfig.json` exit 0, `lint-loc --all` 10 stages 0 failed.
Mutations (hash-verified applied, restored, HEAD blob equality confirmed on all three files): 7/8 killed. M1 chunks raw handle K(3 fail), M2 sessions raw handle K, M3 skipMismatched off K, M4 MAX_K 500 K, M5 drop requireScope K, M6 503 leaks error K, M8 drop vector-exists filter K, M7 production flag gate removed SURVIVED (filed, ISS-T008SEARCH-002).
Not blocking: no explicit q length cap (ISS-T008SEARCH-001, medium, cost class, incidentally limited by ~16KB header limit). Also noted: full-tenant chunk scan per query is brute force by D-021 design; embed runs before tenant validation (tenant comes from verified key, so not reachable by a client).

ISSUES-WRITTEN: ISS-T008SEARCH-001, ISS-T008SEARCH-002 (qa/issues.T008SEARCH.jsonl, both medium)

# Verdict - t043-api-ask-tenant-scope-proof

VERDICT: PASS
Cycle checked: 1
Scope: `apps/api/src/ask/ask-tenant-isolation.test.ts` at commit 8cac7b9, judged against `qa/contracts/t043-api-ask-tenant-scope-proof.md` (C1-C10). Tests only. Does NOT complete T-043.

## Independent results (lane `apps\api`, codex Node runtime, one command at a time)
- `node --test --import tsx src/ask/ask-tenant-isolation.test.ts` -> tests 16, pass 16, fail 0.
- `src/routes/ask/ask.test.ts` -> 3/3; `src/ask/source-context.test.ts` -> 24/24; `src/ask-arms.test.ts` -> 11/11.
- `node ...\typescript\lib\tsc.js --noEmit -p tsconfig.json` -> no output, exit 0.

## Per-criterion
- C1 PASS (bounded): tree test asserts the filter `{node_id:"tenant:tA", level:"tenant", tenantId:"tA"}` and A's root; empty/undefined load null. M8 (drop tenantId from `treeIndexRootFilter`) KILLED by 5 new tests. The test's `blindTreeStore` is a REPLICA of `createMongoTreeStore.load`; M9 (real store.ts:61 drops the filter) SURVIVES the new file and is killed only by the pre-existing text pin `tree-index-root-filter-single-source.test.ts`. The manifest says this plainly ("Not proven"). See EXPLANATION.
- C2 PASS: M3 (chunks arm unscoped), M4 (turns arm unscoped) killed (8 failures each); M16 (arms bound to "tB") killed; the empty-tenant test kills M6.
- C3 PASS: M1 (turns unscoped) 8 fail, M2 (chunks unscoped) 7 fail, M17 (hydrator bound to "tB") killed.
- C4 PASS: M13 (dispatch/job rows stamped "system") killed by the new route test (old: 1 fail in source-context.test.ts only); prompts/job rows/logs checked with `leaks()`.
- C5 PASS: M10 (body tenant), M11 (query-string tenant), M12 (x-tenant-id header) each take the tenant from request input and are killed; M11/M12 are killed ONLY by the new file.
- C6 PASS: M6 (scopedCollection falsy-tenant throw removed) killed by 2 new tests (no-query assertions), invisible to all old suites. The route-level empty-tenant 404 is produced by the tree filter returning null, not by scopedCollection; both are separately covered.
- C7 PASS with named limits: see Fake audit.
- C8 PASS: 18 mutations, 16 killed by the new file, 2 survivors (M9 disclaimed and pinned elsewhere; M15 redundant defence-in-depth). Five mutants were killed only by the new file among the suites I ran (M6, M8, M11, M12, M18).
- C9 PASS: `grep -rlF` of Zanzibar-B, b-only-session, "Funding visa decisions arrive later", "Visa forms open in October", "only for tenant B" against `data/` and `qa/evidence/` -> 0 hits each.
- C10 PASS: `git show --stat 8cac7b9` = the test file + manifest only. `git status --porcelain=v1` empty after my runs.

## Mutation table (per-mutation byte backup in scratchpad `t043api-check`, 90 s timeout per command, restore in try/finally, hash check after each)
"Old" = ask.test.ts, source-context.test.ts, ask-arms.test.ts (+ tree-index-root-filter-single-source.test.ts for M8/M9).

| # | Mutation (file:line) | New tests | Old tests |
|---|---|---|---|
| M1 | turns query unscoped (source-context.ts:171) | KILLED 8 | KILLED |
| M2 | chunks query unscoped (source-context.ts:172) | KILLED 7 | KILLED |
| M3 | chunks arm unscoped (ask-arms.ts:83) | KILLED 8 | KILLED (arms) |
| M4 | turns arm unscoped (ask-arms.ts:95) | KILLED 8 | KILLED |
| M5 | withTenant drops tenant (tenantScope.ts:18) | KILLED 11 | KILLED |
| M6 | falsy-tenant throw removed (tenantScope.ts:37) | KILLED 2 | survived |
| M7 | tenantId widened to `$in:[A,"tB"]` (tenantScope.ts:18) | KILLED 11 | KILLED |
| M8 | `treeIndexRootFilter` drops tenantId (build.ts:50) | KILLED 5 | survived (pin test passes) |
| M9 | real store.ts:61 findOne drops filter | survived | KILLED only by text pin |
| M10 | route tenant from body (ask.ts:44) | KILLED 2 | KILLED |
| M11 | route tenant from query string (ask.ts:44) | KILLED 1 | survived |
| M12 | route tenant from x-tenant-id header (ask.ts:44) | KILLED 1 | survived |
| M13 | dispatch/job stamped "system" (source-context.ts:276) | KILLED 1 | KILLED (srcctx) |
| M14 | withTenant -> `$or` widen (tenantScope.ts:18) | KILLED 11 (fail-closed, see audit) | KILLED |
| M15 | hydrator validTurn tenant check removed (source-context.ts:107) | survived (redundant: the scoped query is the primary guard; M1 is killed independently) | KILLED (srcctx) |
| M16 | arms bound to "tB" (source-context.ts:280) | KILLED 2 | KILLED |
| M17 | hydrator bound to "tB" (source-context.ts:281) | KILLED 2 | KILLED |
| M18 | route loads tree for "tB" (ask.ts:45) | KILLED 4 | survived |

Package-level mutants (M5-M8, M14) needed a resolver hook: the lane has no own `@lkb/*` links; `apps/api/node_modules/@lkb/*` are symlinks to `C:\Users\product\Desktop\KnowledgeBase\packages\*` (the MAIN checkout). My first M5-M7 attempt therefore showed false survivors (16/16 pass); I discarded it and re-ran with a scratch `--import` hook redirecting `@lkb/db` and `@lkb/index` to the lane's copies (baseline 16/16 under the hook). Nothing was written outside the lane. After every restore and at the end, `git hash-object` equals `git rev-parse HEAD:<file>` for source-context.ts (408152ac), ask-arms.ts (542cf757), routes/ask/ask.ts (f70309dd), store.ts (00cebdb3), tenantScope.ts (8387eb59), build.ts (6973bd34); no timeouts.

## Fake audit (`BlindDb`)
Blind: PASS. `matches`/`fieldMatches` contain no tenant reference; the sanity test shows an unscoped `$in` query returns both tenants' rows and the hydrator bound to B returns B's bait text. Operators production uses on the Ask path: equality on `tenantId`/`node_id`/`level` (tree), `{}`+tenantId (arms chunks/turns), `{sessionId:{$in}}`, `{sourceRef:{$in}}` (hydrator) - all modelled (equality, `$in`, null-matches-missing). NOT modelled: `$and/$or/$gte/$regex/$exists`, aggregate, `$vectorSearch`, projection, sort, limit (the fake takes only a filter). It fails CLOSED: an unrecognised operator object compares `actual === want` and matches nothing (M14 died this way), never match-all. Production uses none of those operators on this path (the vector arm is in-process cosine over a scoped `find`; no Atlas vector search), so nothing is hidden, but an `$or`-style widening would be caught only by that fail-closed accident, not by modelling. Access paths: every DB read in arms/hydrator goes through the injected `db`; unobserved paths are `createMongoTreeStore.load` (global `getDb()`, replicated), `createMongoApiKeyStore.verify` (faked), the `jobs` writer (injected `write`), and `composition/production.ts` itself (no `db` injected, so production uses `getDb()` in arms/hydrator; not exercised).

## Independent read of the Ask path (no tenant gap found)
`routes/ask/ask.ts:44` tenant = `req.auth.tenantId`, set only by `requireAuth` from `store.verify` (`auth.ts:33-45`, `store.ts:44-50` reads `doc.tenantId` of the key's hashed row); body/query/header are never consulted. `:45` `tree.load(tenantId)` -> `store.ts:61` `findOne(treeIndexRootFilter(tenantId))` (filter includes `tenantId`). `:51-56` `askV2(..., {...askDeps, ...requestDepsFor(tenantId), tenantId})`. `composition/production.ts:219` supplies `requestDepsFor`, which overrides `complete/scoreFn/extraCandidateArmsFn/sourceContext` with tenant-bound ones (`source-context.ts:264-282`); `extraCandidateArmsFor` (production.ts:227) is ignored when `requestDepsFor` exists (`ask.ts:56`). Reads: arms chunks `ask-arms.ts:83` and turns `:95`, hydrator turns `source-context.ts:171` and chunks `:172`, all via `scopedCollection(...)(tenantId)` (`tenantScope.ts:30-40`: throws on falsy tenant, merges `tenantId` last so a caller filter cannot override it). `packages/ask` contains no db access. Observation (low, not filed): `production.ts` wires query-embedding jobs with `ROUTER_TENANT_ID` ("system"), so those job-ledger rows are not attributed to the requesting tenant; a write-attribution matter, not a read leak, outside this unit.

ISSUES-WRITTEN: none
EXPLANATION: C1-C10 hold on my own evidence. The tests are not vacuous: 16 of 18 production mutations that remove, widen, rebind or externally source a tenant filter are killed, and five of those are invisible to the other suites I ran. PROVEN (against a tenant-blind in-memory db with Mongo equality/`$in` semantics): the hydrator and both arms read only the bound tenant (every recorded query carries its tenantId, returned counts are that tenant's rows only, B's shared-sessionId bait is never served); they refuse an empty tenant before any query; the route derives the tenant solely from the key (body/query/header override attempts fail); B's text is absent from the response, prompts, job rows and logs. PROVEN for the tree seam: `treeIndexRootFilter` carries the tenant and selects the right root. NOT PROVEN for the tree seam: that `createMongoTreeStore.load` actually calls it - the test uses a replicated body, so a change to the real body (M9) is not caught by this file; only the older text pin catches it. Suggested wiring (not a defect): make the store's db injectable (`createMongoTreeStore(db = getDb())`) so the real body can be driven by `BlindDb`. NOT PROVEN generally: real Mongo semantics (`{tenantId: undefined}` serialization, indexes), the real api-key store, `composition/production.ts` wiring, `compete.ts`. Weak-by-design note: the "ranking" test cannot expose a leak by returned ids alone (the unit admits this); the recorded-filter and returned-count assertions carry it. Environment note: lane test runs resolve `@lkb/*` from the main checkout, not the lane; contents were byte-identical at check time (tenantScope.ts, build.ts, db/src/index.ts).

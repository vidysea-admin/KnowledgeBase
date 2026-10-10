# t043-api-ask-tenant-scope-proof

Status: ready-for-check
Fix cycle: 1
Priority tier: 3 - next unblocked roadmap task (T-043)
Security class: YES - tenant read isolation on the Ask path (cross-tenant read class, cf. ISS-078 / ISS-5A). Takes the full check.

## Unit scope

Tests only, in `apps/api`. Follows `t043-ask-webinar-citation-proof` (checked-PASS), whose checker listed as unproven that the things `apps/api` injects into Ask are themselves tenant-filtered: the per-tenant tree load, the per-request candidate arms, and the tenant-bound hydrator. No production source changed. No defect found, so no `qa/issues.transcript.jsonl` row was filed. T-043 stays OPEN (see "Not proven").

## Step 1 findings (what already existed)

Common weakness of every pre-existing fake: each filters rows by hard-coded `filter.tenantId` or only records it, so none is a dumb matcher over the whole filter, and none holds a shared sessionId across tenants plus a higher-scoring bait.

- Arms (`createAskArmsFor`, `apps/api/src/ask-arms.ts:75-125`): PARTIALLY proven. `ask-arms.test.ts:50-60` (every read carries the tenant), `:82-130` (ISS-179 two-tenant test, ONE db, asserts returned nodes, non-vacuity checked). Its fake pre-filters on `filter.tenantId` itself (`:95-111`), the two tenants use distinct sessionIds, and there is no bait and no empty-tenant case. Added here: generic-matcher fake, shared session ids, per-query returned-row counts, empty/undefined tenant.
- Hydrator (`createSourceHydrator`, `source-context.ts:163-184`): PARTIALLY proven. `source-context.test.ts:38-50` has a foreign-tenant row and asserts the filter; `:96-101` refuses malicious returned rows. Its `fakeDb` (`:17-33`) hard-codes the `tenantId` comparison, the foreign row has no shared sessionId and no chunks, no B-only session ask, no empty tenant. `ask.test.ts:42-85` asserts `filter.tenantId === "toc"` but holds one tenant's rows only.
- Tree load (`createMongoTreeStore.load`, `store.ts:55-62`): NOT proven by any behavioural test. It calls module-global `getDb()` (not injectable, `packages/db/src/client.ts`); `tree-index-root-filter-single-source.test.ts:36-40` is a source-text pin only; `tree.test.ts:107-119` checks the filter's shape only. Newly covered for the production filter function `treeIndexRootFilter`, against a db holding both roots; the one-line store body is replicated in the test (the glue is unreachable hermetically).
- Route: `ask.test.ts` asserts `tenants == ["tenant-a"]` and ignores a body `tenantId`; nothing runs the real route over two tenants' data. `requireScope` (`auth.ts:50-57`) does not look at tenant; tenantId comes only from `store.verify` -> `req.auth` (`auth.ts:33-45`), and `ask.ts:42` reads `req.auth!.tenantId`. `scopedCollection` (`packages/db/src/lib/tenantScope.ts:30-40`) throws on a falsy tenant and merges `{...filter, tenantId}`.

## The fake and query recording

`BlindDb` in `apps/api/src/ask/ask-tenant-isolation.test.ts` is tenant-blind: `find`/`findOne` return every stored row matching the whole filter via a generic matcher (equality, `$in`, null matches missing - Mongo semantics). It contains no reference to tenants. A sanity test proves it: an unscoped query returns both tenants' rows, and the hydrator bound to B returns B's bait text. Every query is recorded as `{coll, op, filter, returned}`; tests assert each recorded filter has `tenantId == A` (the ISS-078 check) and the returned-row counts equal A's rows only. Data is synthetic: tenant B shares sessionId `s-shared` with A, has a `b-only-session`, near-identical but higher-scoring turns/chunks, and the marker `Zanzibar-B`.

## Criterion to test

| Criterion | Test |
|---|---|
| Fake is blind; bait outscores real row | "sanity: the fake is tenant-blind ..." |
| Tree loaded is A's | "tree load: tenant A gets A's root ..." |
| Empty/undefined tenant loads nothing | "tree load: empty / undefined tenant ..." |
| Arms return only A ids; B shares ids; all queries carry A | "arms: tenant A's vector + lexical arms ...", "arms: the ranking is the A-only ranking ..." |
| Factory per tenant, no cross-binding | "arms: a factory bound to tenant B ..." |
| Empty tenant: no query | "arms: empty / undefined tenant issues NO query" |
| Hydrator returns only A quotes despite B same sessionId | "hydrator: tenant A's quotes only ..." |
| Ask for B-only session refused, nothing leaked | "hydrator: asked for a session that exists only for B ...", "... mixed ask ..." |
| Empty tenant hydrator: no query | "hydrator: empty / undefined tenant ..." |
| B absent from body, prompts, job rows, logs; queries scoped | "HTTP /ask as tenant A ..." |
| Body/query-string/header tenant cannot override | "HTTP /ask: tenant-like body fields ..." |
| Symmetric (non-vacuity) | "HTTP /ask as tenant B is symmetric ..." |
| Empty/undefined resolved tenant -> 404, no turns/chunks query | "HTTP /ask with an empty or undefined resolved tenant ..." |
| Legacy arms-factory path bound to key tenant | "HTTP /ask legacy arms path ..." |

## Evidence

From `C:\Users\product\Desktop\KnowledgeBase-lanes\transcript\apps\api`, codex Node on PATH:

- `node --test --import tsx src/ask/ask-tenant-isolation.test.ts` -> tests 16, pass 16, fail 0, skipped 0, todo 0.
- `node --test --import tsx src/routes/ask/ask.test.ts` -> tests 3, pass 3, fail 0.
- `node --test --import tsx src/ask/source-context.test.ts` -> tests 24, pass 24, fail 0.
- `node C:\Users\product\Desktop\KnowledgeBase\node_modules\typescript\lib\tsc.js --noEmit -p tsconfig.json` -> no output, exit 0.

Mutation testing not run (checker's job). No D-015 corpus applies: the unit fixes no filed issue.

## Not proven

- Live Mongo: the real `getDb()`, real `find` semantics (e.g. `{tenantId: undefined}` serialization), real indexes. The matcher is a subset of Mongo semantics.
- `createMongoTreeStore.load` itself: the test replicates its one-line body; the call site is only text-pinned by `tree-index-root-filter-single-source.test.ts`.
- The real API-key store (`createMongoApiKeyStore`, `store.ts:44-50`) deriving tenantId from the key row: faked by `fakeKeyStore`.
- Ranking-level leakage: with shared session ids B's rows would map onto A's own tree node, so the load-bearing checks are the recorded filters and returned-row counts, not returned ids.
- `compete.ts` (also calls `tree.load`) and other routes are out of scope.
- T-043 stays open pending the live `sync-session --index` + `/ask` run.

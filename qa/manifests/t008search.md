# t008search

**Handshake status:** checked-PASS
Fix cycle: 0
Tier: 3 (roadmap task T-008, first slice). Touches a tenant-scoped read (checker full ceremony per tenancy rule). T-008 stays OPEN.
Lane: lane/t008search. No ledger issues fixed or filed.

## Survey
- T-008 "Vector index (`chunks`, Atlas Vector Search) + unstructured search", deps T-007 (WhatsApp -> claims ingestion review; note "needs Q4 consent decision"). The dep is ORDERING only: this slice reads existing `chunks` rows written by `indexSession`; nothing in it touches WhatsApp ingestion or claims review. Not a hard dep.
- Gate `qa/gates/vector-retrieval-contract.md`: "Option 1, both layers" = the CHECKER drafts contracts for vector-retrieval and entity-promotion. Already done: `qa/contracts/vector-retrieval.md` is ACTIVE. Option 1 defines no build slice itself; this slice builds on that contract (pure cosine layer reused unmodified; C8 keeps `/ask` hybrid out of scope).
- Existing: `packages/index/src/vector/*` (cosine, retriever), `chunks` written by `indexSession`, `/ask` vector arm (`ask/ask-arms.ts`), lexical `GET /search`. Missing: a direct unstructured/semantic search endpoint. That is this slice.

## What this adds
- `GET /search/semantic?q=&k=` (`apps/api/src/semantic-search/route.ts`): scope `search`, k default 10 / max 50, tenant only from the verified key, store errors -> 503 without detail.
- `apps/api/src/semantic-search/semantic-search-store.ts`: embeds the query (purpose "query"), reads `chunks` via `scopedCollection(...)(tenantId)` with `{vector:{$exists:true}}` (tenantId inside the Mongo filter, not applied afterwards), ranks with `rankSessionsByCosine(..., {skipMismatched:true})`, resolves sessions with scoped `findOne`.
- Flag `LKB_SEMANTIC_SEARCH=1` (exactly `1`; OFF by default). `server.ts` mounts the router only when `deps.semanticSearch` is supplied; `composition/production.ts` supplies it only when the flag is on AND an embedding chain exists. Flag off: route not mounted, other output unchanged.
- `docs/SNAPSHOT.md` regenerated via `scripts/snapshot.mjs`. New code lives in its own dir because `apps/api/src` and `routes` were at their dirsize budget.

## Not done / open
Atlas Vector Search index and `$vectorSearch` (still brute-force cosine, D-021); web UI; chunk-level (not session-deduped) results; live run against real chunks/embeddings (no embedding call or Mongo was used). Mixed-dimension corpora are skipped silently (per `skipMismatched`), as in the `/ask` arm.

## Evidence (tests use in-memory fakes only)
- `node --test --import tsx src/semantic-search/*.test.ts` (apps/api): 9 pass / 0 fail. Tenant assertion on EVERY find/findOne filter; other tenant's perfect-match chunk never returned; invalid tenantId (empty, `{$ne:null}`) refused before any read; scope 403 / no key 401 / empty q 400; flag-off route absent; throwing store -> 503 without leaking.
- Mutation: replacing the scoped chunks handle with the raw collection -> 3 of 5 store tests fail; restored, `git hash-object` equal to original.
- Full apps/api suite: tests 813 / pass 813 / fail 0. Full packages/index suite: tests 635 / pass 635 / fail 0. `tsc --noEmit -p apps/api/tsconfig.json`: no output. `node scripts/lint-loc.mjs --all`: 10 stages, 0 failed.

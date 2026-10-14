# T-008 chunk-level semantic results with turn/time/quote evidence

**Handshake status:** ready-for-check
Status: ready-for-check
Fix cycle: 1
Tier: 3 — remaining roadmap T-008 (cycle 1; closes the "chunk-level (not session-deduped) results" gap in qa/manifests/t008search.md "Not done" and the "no quote/time/turn evidence" gap in qa/manifests/t008-semantic-web-consumer.md).
Maker: lane/t008-chunk-evidence (branched from lane/codexwave1 cd843b26)
Contract: qa/contracts/vector-retrieval.md (C1 refusal, C3 determinism, C9 purity). Not edited.

## Fix cycle 1 (responds to qa/verdicts/t008-chunk-evidence.md, FAIL cycle 0)
Scope now: packages/index/src/vector/chunk-evidence.{ts,test.ts}, packages/index/src/index.ts (export), apps/api/src/semantic-search/{route.ts,semantic-search-store.ts,semantic-search-store.test.ts}. server.ts untouched. `atlas-adapter.ts` DELETED (ISS-005: D-021 rules out `$vectorSearch`; no contract/TASKS row asks for it).

Changes: `tenantId` is REQUIRED on `rankChunksWithEvidence` and `attachEvidence` (throws "tenantId is required" even for empty corpus or k=0); chunk and turn tenant checks are unconditional; empty query vector and non-finite chunk vector components refuse regardless of rank; quote is verified against the turn looked up independently from the loaded map and must belong to the chunk (`selectQuote` option is a test seam, its output still verified). Wiring: `rankChunksWithEvidence` exported from `@lkb/index`; `createMongoSemanticSearchDeps` loads turns for the best chunks' `turnRefs` via `scopedCollection<Turns>(tenantId)` (`$in` filter, tenant pinned) and adds ADDITIVE optional fields to `SemanticHit`: `turnIds`, `tStart`, `tEnd`, `quote {turnId,charStart,charEnd,text}`. Session-level fields and one-hit-per-session behaviour are unchanged (the semantic route contract is session-level; chunk-level multi-hit per session is NOT exposed by the API). Unverifiable evidence makes `search` throw -> route 503. Behind the existing LKB_SEMANTIC_SEARCH flag (route absent when off). ask-arms.ts does not exist in this lane (grep found no file); no `/ask` wiring done, listed as open.

### Counts by issue id (D-015: recorded reproductions re-run)
- ISS-T008-CHUNK-EVIDENCE-001 (3 tenancy mutants: chunk check, turn check, mapper guard): chunk check killed, turn check killed, mapper guard N/A (adapter deleted). 2/2 applicable killed.
- -002 (omitted tenantId runs unscoped; foreign chunk returned): now throws "tenantId is required" (test). 1/1 refused.
- -003 (delete verifyQuoteSpan call; delete non-empty/trim check): both mutants killed through attachEvidence with injected selector. 2/2.
- -004 (disconnected): exported from @lkb/index, wired in apps/api store; 2 new API tests (evidence present, tenant-pinned turn loads incl. other-tenant text never leaks; missing turn throws).
- -005: adapter deleted. -006 (empty query vector with empty chunk vectors; NaN row): both refused (test); mutants killed.
- Mutation run, 11 mutants on chunk-evidence.ts (per-mutation byte backup, finally restore, 120 s timeout, final `git hash-object` 1b32fe60... equals working blob, tree otherwise clean): both occurrences of the tenantId-required guard (one initially SURVIVED, test added, then killed), chunk tenant, turn tenant, verify call, non-empty/trim, empty query vector, non-finite component, quote-in-chunk: 11/11 killed.

### Evidence
- `cd packages/index; node --test --import tsx src/vector/*.test.ts`: tests 26 / pass 26 / fail 0.
- Full packages/index: tests 692 / pass 692 / fail 0.
- apps/api semantic-search tests: 11/11. Full apps/api (D2_FIXTURE_PYTHON set): tests 935 / pass 930 / fail 5; the 5 are mint-key tests in src/tenant-guards/caller-visible.test.ts that failed ONLY because the lane's temporary relative TSX_TSCONFIG_PATH broke their child processes; rerun with an absolute path: 7/7 pass, so 935/935 effective.
- ENV GAP: lane junction `apps/api/node_modules/@lkb/*` resolves to the MAIN tree packages, so apps/api tests/tsc were run with a temporary tsconfig (paths -> lane packages), since deleted. A checker must do the same.
- tsc: packages/index exit 0; apps/api (temp paths tsconfig) exit 0.
- lint-loc --all: 2 of 10 stages fail, both inherited (loc: packages/meeting-bot/py/test_sb_join_ownership.py:408; snapshot stale); dependencies (1160 modules) and dupes pass.

## Original cycle-0 notes
See git history for cycle-0 shape; `ChunkEvidenceResult` is unchanged: { chunkId, sessionId, chunkIndex, turnIds, tStart, tEnd, quote{turnId,charStart,charEnd,text}, score }.

## Live gaps (not proven)
- No run against real chunks/turns/embeddings; quote choice (sentence overlap heuristic) is unevaluated for quality.
- No real MongoDB run of the new store path; the chunk read still loads all tenant chunks (D-021 brute force).
- API exposes best chunk per session only; true multi-chunk-per-session results and `/ask` (ask-arms) wiring remain follow-ups. Web consumer does not yet render the new fields.
- Real `turns` rows have `tStart`/`tEnd` relative seconds only; wall-clock `occurredAt` not surfaced.

# T-008 chunk-level semantic results with turn/time/quote evidence

**Handshake status:** ready-for-check
Status: ready-for-check
Fix cycle: 0
Tier: 3 — remaining roadmap T-008 (closes the "chunk-level (not session-deduped) results" gap in qa/manifests/t008search.md "Not done" and the "no quote/time/turn evidence" gap in qa/manifests/t008-semantic-web-consumer.md).
Maker: lane/t008-chunk-evidence (branched from lane/codexwave1 cd843b26)
Contract: qa/contracts/vector-retrieval.md (C1 refusal, C3 determinism, C9 purity). Not edited.

## Scope (packages/index/src/vector/** only)
- `chunk-evidence.ts` — pure `rankChunksWithEvidence(queryVector, chunks, turnsById, k, opts)`, `attachEvidence`, `selectQuote`, `verifyQuoteSpan`. Chunk-level, NOT session-deduped.
- `atlas-adapter.ts` — pure `buildVectorSearchPipeline`, `collectTurnIds`, `mapAtlasResults`. Not wired anywhere.
- `chunk-evidence.test.ts` — 10 tests, in-memory only.
No API, web, DB, embedding or network use. No flag needed: nothing is wired, so existing output is byte-identical.

## Shape for the API/web follow-ups (`ChunkEvidenceResult`)
```
{ chunkId, sessionId, chunkIndex: number|null, turnIds: string[],
  tStart, tEnd,                      // min/max over the chunk's turns, seconds relative to session start
  quote: { turnId, charStart, charEnd, text },   // turn.text.slice(charStart, charEnd) === text, <=300 chars
  score }                            // cosine (brute force) or Atlas vectorSearchScore
```
API flow: embed query -> load tenant-scoped chunks (or run `buildVectorSearchPipeline(...)` via `aggregate`) -> load turns for the chunk `turnRefs` (`collectTurnIds`) tenant-scoped, as `Map<id, {_id, sessionId, tStart, tEnd, text, tenantId}>` -> `rankChunksWithEvidence` / `mapAtlasResults` with `{ tenantId, queryText }`. Any throw means evidence is unverifiable: API should answer 5xx / drop nothing silently. Web can show `quote.text` with `[tStart,tEnd]` and link `quote.turnId`.

## Refusals (all throw)
Empty/duplicate/missing `turnRefs`; turn not found; turn session != chunk `sourceRef`; tenant mismatch (when `tenantId` given); non-finite/inverted/negative turn times; empty turn text; non-finite score; quote not byte-verbatim in its turn or bad offsets; dimension mismatch / missing vector (unless explicit `skipMismatched`); bad `k`. Atlas: empty/non-string tenantId, empty or non-finite vector, limit outside 1..1000, numCandidates outside [limit,10000], empty index name. Evidence is attached to the top k only; a bad row inside it refuses, it is not skipped.

## Evidence
- `cd packages/index; node --test --import tsx src/vector/*.test.ts`: tests 26 / pass 26 / fail 0.
- Full packages/index suite (`node --test --import tsx "src/**/*.test.ts"`): tests 692 / pass 692 / fail 0.
- `tsc --noEmit -p packages/index/tsconfig.json`: exit 0.
- `node scripts/lint-loc.mjs --all`: tracker, dependencies (1161 modules, no violations) and dupes pass (a first `verifyQuote` name clash with pipeline/quote was renamed). Stages still failing are NOT from this unit: loc = `packages/meeting-bot/py/test_sb_join_ownership.py:408 (budget 400)`; snapshot = docs/SNAPSHOT.md stale versus untracked data dirs (same result with this unit stashed).
- `node scripts/eval-recall.mjs --retriever vector` NOT run: it requires real MongoDB and a Gemini embedding call; no offline-fixture mode exists. Existing baseline unchanged: data/eval/recall-report-vector.json recallAtK 0.9347826 (86/92 — a downward-biased FLOOR, C6 caveat: sibling-session ambiguity; delta +0.543 over heuristic 0.391). This unit does not touch the session-level path.
- Mutation run NOT done by the maker; checker should mutate: skip `verifyQuoteSpan`, drop session check, drop tenant check, drop top-k tie-break, remove tenant `filter`.

## Policy note for the checker
D-021 chose brute-force cosine and says `$vectorSearch` does not exist on the self-hosted mongod. The Atlas adapter is a pure unused seam (the `vectorSearchFn` injection D-021 anticipates) and does not alter D-021; wiring it requires a deployment decision.

## Live gaps (not proven)
- No real Atlas cluster / `$vectorSearch` index: the index definition (vector field, dims 3072 or 768, cosine, `tenantId` + `sourceRef` filter fields) is unwritten and the pipeline has never executed.
- No run against real chunks/turns/embeddings; quote choice (sentence overlap heuristic) is unevaluated for quality.
- `numCandidates` default untuned; Atlas score scale (0..1 normalised) differs from raw cosine, so scores are not comparable across the two paths.
- API route and web consumer not changed; the dedupe-by-session `/semantic-search` still returns session-level hits.
- Real `turns` rows have `tStart`/`tEnd` relative seconds only; wall-clock `occurredAt` not surfaced.

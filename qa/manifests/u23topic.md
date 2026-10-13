# U2.3 LLM topic extractor via the extractFn seam

**Handshake status:** ready-for-check
Status: ready-for-check
Fix cycle: 0
Task: U2.3 (roadmap tier 3). Deps: U2.2 harness (eval/extraction.ts) wired, NOT accepted.
Lane: lane/u23topic

## Acceptance status (read first)
**Acceptance WAITS on U2.2 human-adjudicated golden labels, which do not exist yet.** No quality number
(precision, coverage, hallucination rate) is claimed and no gold was invented. The harness can score this
extractor (predictedEntities adapter + a test proving the shape is accepted and stays `measured:false`
without labels); the actual scoring is owed after U2.2 labels land. Live LLM run: not performed.

## Changes
- NEW packages/index/src/tree/extract-topics-llm.ts (157 lines): `extractTopicsLlm`, `prepareTopicExtractFn`,
  `isLlmTopicsEnabled`, `topicPredictedEntities`. The seam `ExtractTopicRefs` (tree/build.ts, regenerate.ts)
  is SYNCHRONOUS, so model calls are precomputed per page and the returned sync extractFn reads them;
  uncached or edited pages use the heuristic `extractTopicRefs`.
- Flag `LKB_LLM_TOPICS=1`, OFF by default. Off: `prepareTopicExtractFn` returns `extractTopicRefs` itself and never calls the model (byte-identical).
- LLM via injected `complete(job)` (same `Job`/`CompleteResult` as claims/speakers), jobKind `topics`.
- Fallback to the heuristic on rejected call, timeout (default 30s, injectable), invalid output, or all-ungrounded output.
- Schema validation: JSON array of non-empty strings, <=80 chars, <=24 entries; grounding: each topic must appear verbatim (case-insensitive) in the page summary/keyInsights; deduped, capped at 6.
- Tenant scoping unchanged: input is the page only, cache keyed tenantId+_id, prompt carries no tenant id.
- NEW packages/index/src/tree/extract-topics-llm.test.ts (14 tests, fake LLM, no network).
- Registration: config/ai-routing.yaml `topics: [gemini, claude-code]` (+comment); one export line in packages/index/src/index.ts; packages/index/src/pipeline/notes/judge.test.ts closed-set route pin now also excludes `topics` (one-line change; u25decisions will need the same for its kind - expect a trivial merge touch).
- docs/SNAPSHOT.md regenerated via scripts/snapshot.mjs (+1 line `scripts/retention/`, pre-existing staleness that failed lint snapshot stage).
- Not touched: pipeline/speaker-tile-suggestions*, contracts, DECISIONS, hooks.

## Evidence (from packages/index in lane worktree)
- `node --test --import tsx src/tree/extract-topics-llm.test.ts` -> tests 14 / pass 14 / fail 0.
- Full suite `node --test --import tsx <all src/**/*.test.ts>` -> tests 649 / pass 649 / fail 0 (before the judge.test.ts pin edit: 648/1 fail, the route pin; fixed).
- `node .../typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0.
- packages/ai routing-config.test.ts -> pass 3 / fail 0.
- `node scripts/lint-loc.mjs --all` -> "lint:structure: OK (10 stages, 0 failed)".

## Open
- Live/real-provider run and any quality measurement: blocked on U2.2 gold labels.
- Callers (apps/api composition) are NOT yet switched to `prepareTopicExtractFn`; wiring + the live backfill precondition (ISS-C-CLAIMS-TARGETING-001, closed) is a follow-up unit.

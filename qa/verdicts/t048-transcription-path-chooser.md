# Verdict - t048-transcription-path-chooser
VERDICT: PASS
Cycle checked: 0
Commit checked: 28d15cd (lane/t048plan)
Scope: pure chooser, unwired; no model call; thresholds for the 90-minute path are unproven until the live comparison; T-048 stays open.

EXPLANATION:
- Cited numbers: ingest-chain.mjs:26 `LONG_SESSION_THRESHOLD_SECONDS = 40 * 60`; :219 `durationSeconds !== null && durationSeconds > LONG_SESSION_THRESHOLD_SECONDS ? long : short`; transcribe-long-session.mjs:43 `DEFAULT_CHUNK_SECONDS = 2400`; chunk-audio.ts:17 "Non-overlapping chunks". TASKS.md:140 "<= ~90 min", D-028 names gemini-3.8-flash and "Chunking stays as the fallback". All match. TODAY constant reproduces `>` at 2399/2400/2401 (single/single/chunked).
- Parity: 15 durations (0.001..1e7, boundaries, fractional) all match the replicated rule; chunk lists equal computeChunkBoundaries (the only difference, 1e7 s, is correctly exceeds-max-chunks). Divergence: null/0 duration. Today ffprobe failure gives null -> short single transcriber, and assertCoverage then skips (no coverage judge), so a missing duration silently goes single today with no check. New code chunks it with chunks:[] (caller must probe). Manifest states the divergence under Decisions with ingest-chain.mjs:219; it is not a headline warning (low observation).
- Model/size: gemini-3.8-flash is the named model; unlisted model -> chunked; 90 min inclusive (5400 single, 5400.001 chunked) defensible. maxSingleBytes null is flagged ASSUMPTION/owner item. Manifest does not say in so many words that the single-call path is unproven for a 90-min file (low observation; the scope line above does).
- Chunks: 3 sets x 1000 seeded durations (incl. overlap 45): coverage [0,d], overlap exactly configured, count <= maxChunks, 0 violations. Max merged-tail excess 89.26 s with minTail 90 (always < minTail; T-048 set: <= 2459.99 s). Over maxChunks -> typed exceeds-max-chunks, empty list. 13 bad threshold sets (zero/negative/NaN chunk, overlap >= chunk, bad maxChunks) -> invalid-thresholds, no hang.
- Totality: hostile inputs never threw; deterministic; frozen input fine.
- Scope: 3 files only; index.ts and D-119 files untouched; nothing imports it. Test 15/15; tsc exit 0; lint-dirsize only the unrelated packages/index/src/pipeline; merge-tree clean.
- Mutations: 5/5 killed (>=, exclusive 5400, unknown->single, overlap twice, tail gap). Harness deleted; hash equals HEAD blob.

ISSUES-WRITTEN: none

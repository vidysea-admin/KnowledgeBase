# Manifest — cifix2-lint-dupes-ask-cycle

**Handshake status:** ready-for-check
**Fix cycle:** 0
**Lane:** lane/cifix2 (base f81c8c13)
**Issue:** ISS-CIFIX-002 (budget checks ISS-CIFIX-001 are out of scope; ISS-CIFIX-003 is another lane)

## Scope
- ask-graph <-> ask-v2 cycle: AuditEntry/AskV2Deps/AskV2Result moved to packages/ask/src/ask-shared.ts; ask-v2 re-exports them (types only), ask-graph and index.ts import from ask-shared. Edge is now ask-v2 -> ask-graph -> ask-shared.
- 7 duplicate exports, none of them in a public @lkb/* barrel except FFMPEG_ENV: Assessment->IngestionAssessment (ai), Verdict->SpeakerVerdict (index/speakers-verifier), evaluate->evaluatePurge, Row->AssessRow, Candidate->PurgeCandidate (ingest retention), GraphNode->PipelineGraphNode (core/pipeline-graph, not in core barrel). FFMPEG_ENV in ingest/youtube.ts kept public through `export { FFMPEG_ENV }` (ingest barrel does export *).
- Public barrels (ask Verdict/evaluate, index GraphNode) untouched.

## Evidence
- lint-dupes: OK (1475 unique exports); was 7 violations.
- dependency-cruiser on packages/ask: no violations (101 modules). Full run in the lane still shows the cycle only through the main-tree copy of @lkb/ask (junction), plus the known esbuild Windows-only item.
- tests: ask 113/113 (incl. ask-graph.test + baseline), api ask 136/136, ai trace-langfuse 44/44, core pipeline-graph 16/16, index speakers-grounded 42/42, ingest retention 96/96.
- tsc --noEmit clean: ask, ai, core, index, ingest, api (temp paths tsconfig, deleted).

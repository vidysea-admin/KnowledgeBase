# Verdict — cifix2-lint-dupes-ask-cycle

**VERDICT:** PASS
**Cycle checked:** 0
**Commit checked:** 1ec03a28 (base f81c8c13), lane/cifix2

## EXPLANATION
1. Test count: packages/ask is 122/122 on main (364cb094) AND 122/122 in the lane. Sorted test-name lists are identical (diff empty). Nothing dropped. The manifest's "113/113" is a mis-report (stale count), not a lost test; note only.
2. Renames: grep of all of apps/*, scripts/*, packages/* finds no remaining use of an old name. The only barrel entries touching renamed modules are index's `llmVerifier/SpeakerVerifier/VerifierQuestion` (unchanged names) and ai's `export * from sink.js` (ingestion-response not re-exported). The ask `Verdict/evaluate` and index `GraphNode` barrel names are untouched (the web `GraphNode`/`Row` hits are unrelated local types). FFMPEG_ENV still exported from @lkb/ingest via `export { FFMPEG_ENV }`. tsc clean everywhere confirms no broken import.
3. askV2 public API unchanged: AuditEntry/AskV2Deps/AskV2Result are moved verbatim to ask-shared.ts, re-exported from ask-v2.ts and index.ts (type-only). `ask-graph.baseline.json` is not in the diff (byte-identical); ask-graph.test + baseline tests pass.
4. lint-dupes: lane OK (1475 unique); main still shows the violations. dependency-cruiser packages/ask: 0 violations (101 modules). Repo-wide in lane: 2 errors = esbuild unresolvable (Windows-only) + a cycle whose path is `../../KnowledgeBase/packages/ask/src/...` i.e. the MAIN tree's old code reached through the node_modules junction. It vanishes once merged because main then holds the fixed ask-graph.ts (the lane's own copy has no cycle). Mutation: pointing ask-graph's type import back at ask-v2.js made the cruiser fail with no-circular (ask-graph -> ask-v2 -> ask-graph); restored, hash equals HEAD blob.
5. tsc --noEmit (temp tsconfig paths mapping to lane sources, deleted): ai, core, ask, index, ingest, apps/api all clean. Suites in lane: ask 122/122, ai 217/217, core 380 pass/1 skipped/0 fail, ingest 340/340, apps/api src/ask 120/120, index 627/628. The one index failure ("D-015: the corpus above is byte-faithful to ISS-104's own recorded reproductions") fails identically on main: pre-existing, unrelated to this unit.

ISSUES-WRITTEN: none

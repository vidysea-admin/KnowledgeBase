# Independent verdict — t008-chunk-evidence

VERDICT: FAIL
Cycle checked: 0
Checker: independent checker (lane t008-chunk-evidence, commit 8b3f8ea7)
ISSUES-WRITTEN: ISS-T008-CHUNK-EVIDENCE-001 (high, tenancy), -002 (medium, tenancy), -003, -004, -005, -006 (file qa/issues.t008-chunk-evidence.jsonl)

## Why FAIL
Tenancy-class coverage hole (never capped): three tenant guards are not covered by any test. Mutation results below show the chunk tenant check, the turn tenant check and the mapAtlasResults tenantId guard each survive. Per contract I2 coverage is assumed absent until a mutation proves it. The code itself is correct in the probes; the tests do not prove it.

## Evidence (all run in the lane, cwd packages/index)
- Full suite `node --test --import tsx "src/**/*.test.ts"`: tests 692 / pass 692 / fail 0. `tsc --noEmit -p tsconfig.json`: exit 0. `lint-loc --all`: 2 of 10 stages fail, both the known inherited ones (loc: test_sb_join_ownership.py; snapshot stale); tracker and dependencies (1161 modules) pass, so C9 purity/depcruise OK.
- Adversarial probes (all as expected unless noted): cross-turn quote, empty quote, whitespace quote, charEnd out of range, negative offset, wrong turnId, turn from another session: all throw. NFD vs NFC: slice comparison is code-unit exact, so a normalised variant of the quote would be refused (good). 300-char cap did not split a surrogate pair in the emoji probe. Pipeline without or with an object tenantId throws. Atlas order and chunkId tie-break are deterministic. Not good: tenantId omitted on rankChunksWithEvidence runs unscoped (-002); empty query vector yields score-0 results and NaN rows scramble ordering unless in top k (-006).
- Mutations (per-mutation byte backup, try/finally restore, 120 s timeout, applied-hash check, HEAD blob check after each: no restore failures, tree clean). 18 mutants: 14 killed, 4 survived: skip verifyQuoteSpan call (tautological, -003), drop non-empty/trim check (-003), drop chunk tenant check and drop turn tenant check (-001), drop mapAtlasResults tenant guard (-001). Killed: drop verbatim compare, bounds, turnId match, session check, tie-break, duplicate turnRefs, skipMismatched default inversion, time validation, tStart min->max, Atlas filter removal, pipeline tenant guard, mapper ignoring tenant option, numCandidates bound.
- Dedupe: there is none by design (chunk-level, not session-deduped); mapAtlasResults does not dedupe duplicate chunk ids (-005).

## Key question: connected to production?
No. Disconnected seam. `git grep` finds no use outside packages/index/src/vector: not exported from packages/index/src/index.ts; apps/api semantic-search-store.ts and ask-arms.ts still call rankSessionsByCosine. D-021's brute-force path (scopedCollection chunks find, then cosine in Node) is exactly what this ranker is built for, so it is pluggable, but delivers no user value until wired. Minimal wiring (-004): export from @lkb/index; in createMongoSemanticSearchDeps load turns for the chunks' turnRefs via scopedCollection tenant-pinned, call rankChunksWithEvidence(qv, chunks, turnsById, k, {tenantId, queryText: query, skipMismatched: true}), extend SemanticHit with turnIds/tStart/tEnd/quote behind LKB_SEMANTIC_SEARCH.

## Atlas adapter
YAGNI (-005). No contract criterion or TASKS row requires it, D-021 says $vectorSearch is not available, and the manifest admits it was never executed. Recommend removing it or leaving it unexported.

## Refuse loudly
Yes for malformed evidence (verified by probes), with the tenant-optional and degenerate-vector exceptions above.

## Fix cycle 1 needs
Tests killing the three tenant survivors; tenantId required (or loudly documented) on the evidence entry points; provenance test through attachEvidence; wire or explicitly defer (-004); drop or park the Atlas adapter. Not run: eval-recall vector (needs real Mongo and Gemini).

---

# Cycle 1 (appended)

VERDICT: PASS
Cycle checked: 1
Commit checked: 9da77dd3
ISSUES-WRITTEN: none (all six cycle-0 issues closed in qa/issues.t008-chunk-evidence.jsonl)

## Evidence
- packages/index vector tests 26/26; full packages/index 692/692; tsc exit 0 for packages/index and apps/api (temporary paths tsconfig, absolute TSX_TSCONFIG_PATH, deleted). apps/api semantic-search tests 11/11. Full apps/api 935 tests, 933 pass, 2 fail, both unrelated to this unit and untouched by it: activity-health/router.test.ts (fails 3/3 in isolation, Python-fixture dependent) and usage/usage.test.ts hanging-write timeout (flaky under CPU load, passed 2 of 3 in isolation).
- lint-loc: only the 2 known inherited failures (loc, snapshot). The maker's manifest cited ISS-005 bare, which failed the tracker G4 gate; I qualified it to ISS-T008-CHUNK-EVIDENCE-005 in the manifest, and the tracker stage now passes.
- D-015 reproductions: -001 (3 tenancy mutants) chunk check, turn check killed; mapper guard N/A, adapter deleted (verified absent: no atlas-adapter.ts, no references). -002 omitted tenantId now throws (both entry points; both guard occurrences mutated and killed). -003 verifyQuoteSpan skip and non-empty/trim both killed. -004 wired (below). -005 adapter gone. -006 empty query vector and non-finite component both killed. 
- Mutations (per-mutation backup, try/finally restore, 180 s timeout, HEAD-blob check each time): 15 mutants, 15 killed, no restore failures, tree clean.
- Cross-tenant leak attempt via createMongoSemanticSearchDeps: a toc chunk referencing an other-tenant turn returned nothing: with a tenant-honouring db it throws "missing turn"; with a deliberately tenant-ignoring db on turns the ranker still throws "turn tenant mismatch" (defence in depth). Turn load goes through scopedCollection<Turns>(tenantId) with $in; unscoping it reddens a store test.
- SemanticHit gains only optional fields (turnIds, tStart, tEnd, quote); session-level fields and one-hit-per-session behaviour unchanged; route stays behind LKB_SEMANTIC_SEARCH. Contract C1/C3/C9 hold (depcruise stage passes).

## Notes and follow-ups (not blocking)
- /ask not wired (no ask-arms.ts in this lane); web does not render the new fields; API exposes best chunk per session only.
- Behaviour to be aware of: any non-finite vector component or tenant-less chunk/turn row among the best chunks makes search throw (503) rather than skip; correct per refuse-loudly, but a single bad row in the corpus will take the endpoint down. Not run against real Mongo.

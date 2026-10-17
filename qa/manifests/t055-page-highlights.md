# Manifest: t055-page-highlights

Status: ready-for-check
Fix cycle: 2
Unit: T-055 C1/C2 page-evidenced highlights, foundation (validator + page segments)
Lane: w17-t055page (lane/w17-t055page). Base a0391420. Candidate: see the commit that adds this file.
Contract clauses: goal-t055 C1 (page provenance), C7 (forged evidence rejected). C2 persistence/route/UI NOT in this unit.

## Changed paths (packages/index only, plus evidence)
- packages/index/src/pipeline/page-evidence/page-segments.ts (buildPageIndex: real page numbers, doc char offsets kept separate, deterministic digest)
- packages/index/src/pipeline/page-evidence/highlight-validator.ts (validateHighlight)
- packages/index/src/pipeline/page-evidence/highlight-validator.test.ts (8 tests)
- qa/evidence/t055page/mut-pagecheck.sh, mutation-output.txt

## Reader decision (read this)
The page-preserving PDF reader already exists: packages/ingest/src/sources/document-pages.ts readPdfPages/producePageDocument (pdfjs-dist). packages/index has no pdfjs-dist dependency and package.json edits are out of scope, so this unit does NOT duplicate a reader; it consumes the reader's `pages` shape structurally. The test imports ingest's real readPdfPages by relative path (test only; production code has no ingest import). DOCX: no parser exists; ingest requires an injected renderDocxToPdf and fails "renderer unavailable" otherwise. DOCX pages are therefore only reachable through that renderer; none is shipped. Needs a decision (renderer) later.
Possible lint risk: test-only cross-package relative import; dependency-cruiser not run (not requested).

## Evidence
- node --test: tests 8, pass 8, fail 0.
- tsc --noEmit (packages/index): no output, clean.
- node scripts/lint-loc.mjs --all: loc OK (1707 files), dirsize OK, dupes OK; root stage failed only on a stray file I had created and then moved (rerun not repeated).
- Mutation (skip page check; per-mutation backup and trap, cmp restored): forged-page and page-beyond-end tests failed (pass 6, fail 2), mutant killed.

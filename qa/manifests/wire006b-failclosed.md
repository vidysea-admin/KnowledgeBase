# Manifest - wire006b-failclosed

Status: ready-for-check
Fix cycle: 1
Lane: C:/Users/product/Desktop/KnowledgeBase-lanes/w17-wire006b (branch lane/w17-wire006b), base 306228cb. Candidate SHA: lane HEAD commit.
Task: T-007 ISS-W17WIRE006-001 and -003 (medium, tenancy class).

## Changed paths
- apps/api/src/transcript-review/router.ts: authorizeSession required; runtime 503 fail-closed when absent.
- apps/api/src/transcript-review/persist.testkit.ts: explicit allow-all fixture.
- apps/api/src/transcript-review/authorization.test.ts: new no-authorizeSession test (4 endpoints -> 503, 0 store accesses, 0 writes).
- apps/api/src/grounded-content/reader.ts: createMongoGroundedContentDeps deleted (only importer was its own test; server.ts uses trustedBrainReads). Unused imports removed.
- apps/api/src/grounded-content/reader.test.ts: raw-Mongo test replaced by absence test.
- qa/issues.W17WIRE006.jsonl: NO change from this lane (cycle 1 restored it to 306228cb content; duplicate ids broke tracker-audit; integration branch regrades -001 and appends -003).

## Checks a checker must run (from apps/api, node on PATH, timeout 600)
- node --test --import tsx src/transcript-review/{authorization,persist,service}.test.ts src/grounded-content/reader.test.ts src/visibility/read-side-quarantine{,-trusted}.test.ts src/grounded-postprocessing/transcripts.test.ts
- node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json
- grep -rn createMongoGroundedContentDeps apps packages scripts (expect only the reader.test.ts absence assertion)

## Evidence
authorization 3/3, persist 18/18, service 6/6, reader 7/7, quarantine-trusted 9/9, quarantine 17/17, transcripts 6/6, tsc clean.
Mutations (D-020, per-mutation backup+trap, hashes with core.autocrlf=true match pre-mutation): M1 restore fail-open guard -> authorization 2 pass/1 fail (killed); M2 re-add raw export -> reader 6 pass/1 fail (killed).

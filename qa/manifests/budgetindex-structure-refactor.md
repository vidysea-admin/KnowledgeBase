# budgetindex-structure-refactor

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 2 (ISS-CIFIX-001 high, CI lint:structure). Class: pure refactor, no data write / auth / tenancy. Owner chose refactor over raising budgets.
Lane: lane/budgetindex. No new issues filed.

## Scope (packages/index only)
Four budget breaches: notes/grounded-notes.test.ts 442>400, speakers-grounded.ts 371>300, speakers-llm.ts 304>300, pipeline/ 33 files>30. No behaviour change, no test expectation change.

## Files
- NEW `pipeline/speaker-rules/speakers-grounding.ts`: deterministic grounding layer cut verbatim from speakers-grounded.ts (readEntry, candidatesFor, groundCandidates, independent, normalizeWithMap, normalizeLabel, otherNamesIn, Candidate, EvidenceKind). speakers-grounded.ts re-exports every name it exported before (public exports identical; index.ts untouched).
- NEW `pipeline/speaker-rules/speakers-llm-prompt.ts`: SPEAKERS_SYSTEM_PROMPT moved verbatim from speakers-llm.ts.
- NEW `notes/grounded-notes-fixtures.ts` (shared fake-model helpers) and `notes/grounded-notes-sentence-span.test.ts` (the last 13 whole test cases, bodies unchanged).
- MOVED (git mv, import paths and relative qa/ paths adjusted) into `pipeline/speaker-rules/`: speaker-tile-fusion(.test).ts, speaker-selfid-rules.ts, speaker-selfid-allowlist.test.ts, speaker-selfid-ledger.test.ts, speaker-reported-rules.ts, speaker-name-data.ts. selfid-ledger's source walk now starts at `../..` so it still scans src/. Callers repointed: speaker-name-rules.ts, speaker-relation-rules.ts, speakers-grounded.ts, speaker-twointro.test.ts. No file outside packages/index imported a moved path (grepped apps, scripts, packages, qa code).

## Criteria and evidence
- lint-loc / lint-dirsize: none of the 4 items flagged (loc 12->9 violations, dirsize 5->4; the rest are other lanes' items). lint-dupes identical 7 before/after (Candidate now reported at its new path; it was already a dupe). dependency-cruiser shows 3 vs 2 errors in this worktree only because the node_modules junction makes ask-graph resolve into the main tree (../../KnowledgeBase/...); not caused by this change.
- packages/index full suite (`node --test --import tsx "src/**/*.test.ts"`): BEFORE (main tree HEAD 364cb094) tests 628 pass 627 fail 1; AFTER tests 628 pass 627 fail 1. The one failure is identical both sides and untouched: speaker-name-rules.test.ts "D-015: the corpus above is byte-faithful to ISS-104's own recorded reproductions".
- tsc --noEmit: packages/index clean; apps/api and packages/ask clean using a temporary tsconfig paths mapping @lkb/index to this worktree (deleted afterwards).
- Assertions: test case moves are whole-case; counts equal before/after.

## Not verified
CI itself; the remaining lint:structure failures in ask, api, meeting-bot, ingest, scripts belong to other lanes.

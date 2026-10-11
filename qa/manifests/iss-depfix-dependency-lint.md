# iss-depfix-dependency-lint
Status: ready-for-check
Fix cycle: 0
Issue: ISS-DEPFIX-001 (medium, pre-existing, introduced by 5fe97b9)

## Defect
Dependency stage (`node node_modules/dependency-cruiser/bin/dependency-cruise.mjs --config .dependency-cruiser.cjs packages apps workers`) before: 1 violation,
`apps-only-ask-ingest-index-ai-db-core: apps/api/src/join-rules/calendar-link-differential.test.ts -> packages/meeting-bot/src/send-now.ts`.
Rule: apps may import only packages/{ask,ingest,index,ai,db,core}. The differential test must import both apps/api (copy recogniser) and meeting-bot (canonical), an edge no layer may hold, so no compliant location exists inside packages/apps/workers.

## Fix
`git mv` the test to `scripts/qa/calendar-link-differential.test.ts` (existing home of cross-layer tests); two import paths re-pointed and header comment corrected (it claimed tests may cross packages). Test body unchanged: real `recognise`, `resolveEventMeetingLink`, `planSendNow`. `.dependency-cruiser.cjs` not touched; no allow-list.
Follow-up already named in the test header (unchanged): move recognisers to packages/core.

## Evidence
- Before: apps/api `node --test --import tsx src/join-rules/calendar-link-differential.test.ts`: tests 3, pass 3, fail 0.
- After: scripts/qa same command on moved file: tests 3, pass 3, fail 0.
- Dependency stage after: `no dependency violations found (797 modules, 2730 dependencies cruised)`. One run takes about 13 s here.
- apps/api `tsc --noEmit -p tsconfig.json`: exit 0 (scripts/ has no tsconfig; the moved file is run via tsx like its siblings).
- lint-dirsize OK (125 dirs); lint-dupes OK. lint-loc fails on an unrelated pre-existing item: root has 18 loose files (budget 15).

## Process note
Merges should be followed by the dependency stage (not only unit tests/tsc), or this class of break lands unseen.

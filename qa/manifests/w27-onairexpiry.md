# w27-onairexpiry: OnAir binding expiry (D-182) and ISS-WEBINARRELEASE-013 ruling

Status: checked-PASS — closed out 2026-10-26 (resume reconcile) citing qa/verdicts/w27-onairexpiry.md
Fix cycle: 0
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w27-onairexpiry (lane/w27-onairexpiry)
Base SHA: 4264418c7488d95e76bc0d86e3920efb0e0ccd72
Candidate SHA: see the lane HEAD (three commits: A decision, B code, C ledger)

## Units
- A (5b444a69) docs/DECISIONS.md: D-182, Approved-by Umesh, both Q/A pairs verbatim, fail-closed migration documented.
- B apps/api/src/source-intake/jobs/source-privacy.ts: binding rows now require exactly 8 keys incl. `expiresAt` (strict UTC ISO-8601, event end + 24h).
  `approvedSourceSession` (enqueue) refuses when now >= expiresAt; `sourceSessionStillApproved` (execution, also guards the media transport and executeJob via
  composition/integrations/source-jobs.ts) uses the same function with an optional `now`. Missing/malformed expiresAt throws -> source_session_authorization_unavailable 403.
  Legacy rows (no expiresAt) therefore fail closed for the whole bindings value. Bindings are an env JSON value (LKB_ONAIR_SOURCE_BINDINGS), not a collection:
  no schema/ file and no gen-types change exists. Also: onair-binding.test.ts (+4 tests), privacy.test.ts fixture, docs/t045-source-worker.md.
  `expiresAt` is deliberately not in bindingFingerprint (current expiry is rechecked at every execution).
- C qa/issues.WEBINARRELEASE.jsonl: ISS-WEBINARRELEASE-013 status resolved with the D-182 note (JSON.stringify, file re-parsed, 17 rows).

## Checks to run
cd apps/api; node --test --import tsx src/source-intake/jobs/onair-binding.test.ts src/source-intake/jobs/privacy.test.ts
tsc --noEmit -p apps/api/tsconfig.json; node scripts/lint-loc.mjs --all

## Evidence
See the maker reply. ISS-T045WORKER-002 floor: 4/4 in privacy.test.ts. D-020 mutation (skip expiry check) fails 2 of 8 tests.

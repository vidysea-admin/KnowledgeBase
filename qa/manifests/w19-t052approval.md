# Manifest - w19-t052approval
**Status:** checked-PASS
**Fix cycle:** 0
**Contract:** docs/DECISIONS.md D-180 (rulings 1 and 2, Approved-by Umesh); D-079 / wave-2 ruling 4 (activation only after independent checker PASS)
**Base SHA:** 41ca141c (origin/master, merged into the lane)
**Candidate SHA:** see `git log -1 lane/w19-t052approval`

## Units
- A: D-180 appended via scripts/append_decision.ps1 (commit baade90d); ISS-282 set to resolved in qa/issues.jsonl (JSON method, re-parsed: 379 rows).
- B: commit 4636ba78. Schema registration_link_approvals (+fixtures, index, generated type, unapplied migration source); store (create/get/revoke/findMatching, tenant predicate in every query); POST /registration-approvals and /:id/revoke behind requireAuth + `registration:approve` + server-configured human reviewer; resolver awaits its trusted authorize seam; registration-approval-authority.ts builds resolver and Zoom-proof authorizers that re-check tenant, expiry, revocation, 30-day bound and every hash. Activation constants remain false.

## Checks a checker must run (timeout 600 each)
- apps/api: node --test --import tsx src/registration-approvals/registration-approvals.test.ts
- packages/meeting-bot: node --test --import tsx src/calendar/registration-approval-authority.test.ts
- python schema/validate.py (needs the main-tree .venv python: system python lacks jsonschema); node scripts/gen-types.mjs --check
- tsc --noEmit -p tsconfig.json in apps/api, packages/meeting-bot, packages/core; node scripts/lint-loc.mjs --all; node scripts/tracker-audit.mjs --gate g1,g4,g5; python contracts/verify_contracts.py

## Evidence (actual, this cycle)
- api test: 9 pass / 0 fail. meeting-bot test: 7 pass / 0 fail.
- schema/validate.py (.venv): PASS 46 schemas. gen-types --check: OK 46 files.
- tsc apps/api, packages/meeting-bot, packages/core: exit 0 each. lint-loc --all: OK (10 stages, 0 failed). tracker-audit g1,g4,g5: exit 0 (advisory G4 notes only, pre-existing). verify_contracts: PASS by vacuity.
- Mutations (per-mutation backup + trap, timeout 300; post-run `git -c core.autocrlf=true hash-object` equals HEAD blob for every file):
  - M1 skip expiry predicate in store.findMatching: 8 pass / 1 fail (killed)
  - M2 drop tenant predicate in findMatching: 6 pass / 3 fail (killed)
  - M3 allow non-human (service key) in createHumanApproverLookup: 6 pass / 3 fail (killed)
  - M4 authority skips expiry re-check: 6 pass / 1 fail (killed)
  - M5 authority skips revoked re-check: 6 pass / 1 fail (killed)
- Not run: Mongo-backed migration test (needs real MongoDB); browsers.

## Notes
- Activation constants are NOT flipped; flipping requires an independent checker PASS (D-180 / ruling 4).
- ISS-282 closed citing D-180; no ISS-282 corpus re-run (precision part resolved by verdict c10022da).

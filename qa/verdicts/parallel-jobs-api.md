# Verdict — parallel-jobs-api

**VERDICT:** FAIL
**Cycle checked:** 0
**Manifest:** qa/manifests/parallel-jobs-api.md
**Contract:** qa/contracts/parallel-jobs-api.md
**Checked:** 2026-10-09
**Scope:** Independent bounded API unit, not T-057/full-feature acceptance.
**ISSUES-WRITTEN:** none — medium finding repaired inside this active unit; no new pulled seam.

## Evidence and criteria

Independent bounded router/store suite: 9 tests, 9 passed, 0 failed; exit0.
Independent scoped API TypeScript check: no diagnostics; exit0.
Exact commands, terminal output and tested source hashes are preserved in
`qa/evidence/parallel-jobs-read/api-check-cycle0.json`.

Real verified auth and jobs-only scope denials precede reads. Owner-positive paths, query/body
selector refusal, actual scoped accessor-to-adapter-to-HTTP tenant binding, explicit metadata
projection, descending sort, limit+1 truthful truncation and fixed 400/503 errors are supported.
Independent `api-independent-boundary.mjs` additionally confirms revoked/session-scope denial,
Unicode/bracket/duplicate-query refusal, every forbidden field omission and private no-store.

**C5 fails:** actual DB `listJobs` accepts the valid date-time strings
`2026-10-09t12:00:00z` / `2026-10-09t12:01:00z`, preserving them literally, while the API's
`projectJobSummary` rejects them with Invalid job summary. The independent actual-DB-reader
boundary probe exits1, after all earlier auth/query/whitelist assertions pass. This can turn
healthy stored summaries into sanitized503 instead of returning the allowed metadata.

## Required current-unit correction

Align accepted date-time casing without normalization, preserve all existing invalid-date
refusals, and add actual accessor -> adapter -> HTTP regression for both timestamp fields.
Root authorized this minimal correction as Fix cycle1; no source edit was performed by checker.
No cycle0 PASS or manifest close-out is valid. Independent recheck awaits frozen cycle1 READY.

Production/server mounting, frontend downstream and full-feature checks remain integration
obligations. No DB/provider/browser/full-suite/runtime mutation was performed.

## Cycle 1 — current scoped verdict

VERDICT: PASS
Cycle checked: 1
Manifest: qa/manifests/parallel-jobs-api.md (Fix cycle: 1; ready-for-check)
Contract: qa/contracts/parallel-jobs-api.md
Checked: 2026-10-09, after explicit root READY.
ISSUES-WRITTEN: none

Independent current-source commands, full outputs and exact source/harness hashes are in
`qa/evidence/parallel-jobs-read/api-check-cycle1.json`. The cycle0 FAIL above remains historical.

- Bounded real router/store tests: **9/9 passed**, fail0, exit0, duration2944.3619ms.
- Scoped API TypeScript check: **exit0**, no diagnostics.
- Independent checker boundary harness: **exit0**, including revoked/session-only denial before
  reads, Unicode/bracket/duplicate query refusal, complete forbidden-field stripping and private
  no-store. It also passes actual DB metadata-reader casing preservation and **actual scoped
  jobs accessor -> Mongo adapter -> real authenticated Express GET** with literal lowercase
  createdAt/updatedAt. Thus the original cycle0 reproduction is repaired without normalization.
- Frozen-contract verifier: **exit0**, explicitly no frozen contracts / PASS by vacuity.
  This result alone proves no product-quality criterion.

C1/C2 auth/query owner-positive and refusal evidence: first three router tests plus independent
boundary harness. C3 tenant/projection/sort/limit+1: actual DB-boundary router and store tests.
C4 truthful empty/below/exact/extra/cap100 pages: store truncation test and malformed envelope
refusals. C5/C6 complete projected metadata, poisoned fields, required/optional/date validation,
malformed extra fetched row and fixed store-failure responses: router/store refusal tests,
checker harness and read-only source inspection. C7 matching cycle1 handshake, scoped tests,
typecheck and exact stable source hashes are recorded. Source hashes match the frozen maker
manifest and remain unchanged after checks.

This PASS licenses **only the API unit close-out**. Production/createServer mounting, frontend
client/key-race/page evidence, broader applicable checks and full parent contract acceptance
remain outstanding. The web client casing correction is independently owned and not certified
here. No T-057 completion, release PASS, source/ledger/governance edit, live DB/provider/browser
action, full suite or deployment occurred. All bounded child checks completed; no live handles.

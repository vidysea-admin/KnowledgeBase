# Contract — parallel-jobs-web

Independent checker acceptance for the T-057 provider-audit Jobs web consumer slice.
Retains qa/contracts/parallel-jobs-read.md C6-C8; does not waive backend acceptance
or certify App/nav integration. NORMAL mode with independent checker authorized by Umesh.

## Scope

Builder ownership: apps/web/src/api/jobs.ts and jobs.test.ts,
apps/web/src/pages/jobs/JobsPage.tsx and JobsPage.test.tsx, and unit manifest.
Checker ownership: this additive contract and dedicated verdict/evidence.
Existing API client/auth/router/navigation, backend and common contract remain untouched.
These are provider-call audit records from the application jobs collection; never
describe them as an upload queue, full pipeline completion or aggregate cost analytics.

## Acceptance

1. Client calls real GET /jobs through existing apiFetch with active API key. Default
   limit 50; explicit limit is an integer 1-100. Invalid arguments refuse before fetch.
   Complete response validation rejects malformed envelope, unrecognized keys, absent
   fields, noninteger/out-of-range/mismatched limit, nonboolean truncated, excessive
   rows and inconsistent truncation. No coercion, partial results or silent dropping.
2. Rows contain only required string _id, nonempty string kind, literal status enum
   pending/processing/done/failed, valid datetime createdAt; optional string provider
   and valid datetime updatedAt. Reject null/malformed optional values, wrong status,
   arrays/primitives and poisoned fields (tenant, errors, payload, credentials, cost,
   lease/path). Reject invalid calendar dates, missing timezone and invalid times.
3. UI preserves statuses exactly, displays safe React text from accepted summaries,
   IDs/kind/provider/dates and honest absent optional fields. Explain provider audit
   semantics and required jobs permission. No raw exception/backend message or API
   key value is rendered. 401,403 and generic failures have useful sanitized states.
4. Show distinct loading, populated, empty returned ledger, filter-no-match and error
   states. Kind/status exact filters combine with AND and do not fetch. Kind options
   derive uniquely/deterministically from returned data; statuses use the literal enum.
   Counts report only visible/returned rows, never total database counts. Truncated
   responses disclose the response limit and that filters cover returned records only.
5. Refresh issues a new read with current key, conceals stale rows/errors while loading,
   recovers from failure and refuses concurrent refresh while pending. Existing
   endpoint no-store semantics remain authoritative; no additional local cache or
   status transformation. Preserve API order rather than inventing a sorting promise.
6. Replacement/logout immediately conceals old rows/errors. Logout refuses fetching.
   Superseded success AND failure cannot populate replacement or logged-out UI; the
   replacement key's positive result must render. Same-key refresh generations cannot
   accept superseded data. No auth-helper change. Test deferred requests explicitly.
7. Focused tests exercise real client validation and actual JobsPage interactions,
   including real apiFetch/fetch wrapper -> endpoint-shaped response -> rendered UI
   path. Solely stubbing listJobs in all UI cases cannot establish downstream acceptance.
   Include positive endpoint shape, malformed response, safe error and race tests.
8. Independent final frozen-source one-worker focused test run and scoped typecheck
   must exit zero. Record exact commands/results, hashes, scope/boundary/budget review
   and cycle-matched verdict. No browser/full-suite/provider/DB. A slice PASS cannot
   satisfy common C8 App/nav mounting, backend HTTP/store composition, live data or
   whole T-057 acceptance; these integration gates remain explicitly deferred.

## Handshake

Do not test or issue PASS until parent READY and manifest ready-for-check Fix cycle N.
Checker writes verdict Cycle checked N; builder closes only a matching PASS. No source
editing, shared contract relaxation, human gold/status changes or live activation.

## Cycle 1 additive datetime acceptance

Root reopened the existing unit after independently observing refusal of valid
lowercase RFC3339 datetime markers across the DB/API/client seam. Cycle 0 evidence
remains historical; current source requires a fresh cycle-matched check after READY.

9. Accept valid date-time strings using lowercase t and/or z, as well as uppercase
   T/Z, for both required createdAt and optional updatedAt. Preserve each accepted
   literal timestamp unchanged through the real client -> JobsPage render path.
   Also retain offset timestamps, valid leap dates and fractional seconds. Add
   positive lowercase-marker client and real-client/page regression cases; do not
   weaken existing impossible-date, date-only, missing-zone, invalid time, poisoned
   field/status/envelope or key-race refusal assertions. Repeat the focused one-worker
   tests and web typecheck against frozen cycle 1 identities before a current PASS.

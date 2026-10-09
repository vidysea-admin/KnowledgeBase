# Contract — parallel-jobs-read (T-057)

Tier 3 roadmap; NORMAL mode approved by Umesh. New read-only provider-audit ledger seam, zero
prior PASSes at planning. On 2026-10-09 root explicitly authorized a restrictive new `jobs`
resource scope for this endpoint. This contract is independently authored acceptance criteria,
not a checker verdict. Existing provider-write contracts remain unchanged.

## Scope and authorization

`GET /jobs` reads the standard application `jobs` collection created by the provider audit
writer. It does not claim upload queue status, pipeline completion, aggregate cost analytics,
new background work or T-057 completion. Dedicated upload queue databases are excluded.

Use existing verified API-key auth and `requireScope("jobs")`. Do not broaden `sessions`,
`keys`, `ingest` or any other scope. No auth-helper, schema, frozen-contract or enforcement
changes. Existing `POST /keys` accepts arbitrary nonempty string scopes and can grant `jobs`
within its authorized key-creation flow; this does not authorize minting keys or modifying live
data during development. Clearly explain the required permission in the Jobs UI. If adding a
Settings choice, retain existing key-management semantics and respect its seam authorization.

## Acceptance criteria

1. **Authorization before reads.** Mount behind real auth and `jobs` scope. Missing/invalid
   key produces 401; authenticated key without `jobs` produces 403 before the jobs dependency
   is called. A `sessions`-only or `keys`-only key cannot read the ledger. Owner-positive tests
   must pass, so a deny-all implementation cannot satisfy this contract.
2. **Exact tenant binding.** Reads use only `req.auth.tenantId`. Query permits only `limit`:
   reject body/query tenant selectors and unknown query keys, duplicate values, arrays/objects
   or invalid limits before invoking the read dependency. Client-supplied tenant headers cannot
   alter tenant selection. Seed existing rows for two tenants; request each as owner and prove
   the foreign rows remain absent, including when the foreign row sorts before owner rows.
   Prove filter binding at the database adapter boundary rather than only in a fake route store.
3. **Limit and truncation.** Default 50; accepted explicit value is one scalar ASCII decimal
   matching `^[1-9][0-9]{0,2}$`, numeric range 1 through 100. Fetch at most `limit+1` matching
   tenant rows, ordered by stored `createdAt` descending then `_id` descending. Return at most
   `limit`, with `truncated` true exactly when an extra matching row was observed. Test empty,
   below-limit, exact-limit and over-limit results, ties and limits 1/100. No global-count claim.
4. **Response whitelist.** Envelope exactly `{ jobs, limit, truncated }`. Each summary contains
   required string `_id`, nonempty string `kind`, enum `status` (`pending`, `processing`, `done`,
   `failed`), valid date-time string `createdAt`; optional string `provider` and valid date-time
   string `updatedAt`. No other fields. Explicit database projection excludes tenantId and all
   raw payloads, errors, model/cost/lease/credential/path fields; defensive route projection
   independently prevents injected extra fields reaching HTTP. Tests use poisoned extras at
   each boundary. Malformed required/optional summary fields fail with fixed sanitized 503,
   not an empty-success or partially healthy response. Do not spread raw documents into output.
5. **Read-only failures.** Unknown/invalid query receives fixed sanitized 400; store failures
   and malformed data receive fixed sanitized 503. Exceptions/paths/provider payloads never
   reach HTTP or UI. Successful responses send `Cache-Control: private, no-store`. Database
   code performs no insert/update/delete, queue action, provider call or background dispatch.
6. **Client and UI.** Typed client calls the real endpoint through the existing API-key wrapper
   and validates the complete envelope/row shapes before accepting data. Jobs page shows
   loading, populated, empty and error states, honest truncation and provider-audit meaning.
   A 403 explains `jobs` permission rather than showing an empty ledger. Content remains plain
   React text, never interpreted HTML. No API-key value/raw backend error is displayed.
7. **API-key race isolation.** Upon replacement or logout, old rows/error are hidden immediately
   and pending requests are invalidated for rendering. Deferred A success or failure cannot
   populate B's page or a logged-out page; B's positive result still renders. Independently test
   key switch, logout, late success and late rejection. No auth-helper change to solve this.
8. **Composition and downstream evidence.** Export the real accessor; production composition
   supplies the actual jobs store; `createServer` mounts the actual jobs router; App/nav expose
   the actual page. Verify accessor -> adapter -> real Express HTTP endpoint with an injected
   database-shaped seam, then endpoint-shaped data -> real client -> Jobs page. Isolated
   component fake tests alone are insufficient. Include actual command/output for affected
   bounded tests and applicable scoped typechecks; record exact tested source hashes. Run
   `contracts/verify_contracts.py` as applicable. Required broader checks/browser/live DB proof
   remain explicitly outstanding if not performed; never convert local coverage into release PASS.

## Handshake and constraints

Builders never edit this contract. Manifest records `ready-for-check` and Fix cycle N; independent
checker verdict records Cycle checked N, criteria evidence and scoped PASS/FAIL. Maker closes
only the matching PASS to `checked-PASS`. Failure to prove auth/tenant/race boundaries prevents
PASS. No live DB/provider/browser/full-suite actions are authorized by this planning contract.
Mutations, if separately authorized, require timeout plus byte-backup restoration on interruption,
timeout and error with byte comparison; no shared-tree live mutation is needed for these criteria.

# Contract — parallel-jobs-db (T-057 scoped acceptance)

Independently authored checker criteria for the new DB reader. Parent authority is
`qa/contracts/parallel-jobs-read.md` and its canonical machine specification,
`qa/evidence/parallel-jobs-read/contract.json`. This document adds no scope exception,
budget relaxation, schema change or full-feature acceptance.

## Scope

`packages/db/src/collections/jobs.ts` and its cohesive `jobs.test.ts`; read-only
inspection of unchanged `packages/db/src/lib/tenantScope.ts`, the provider-audit
writer, barrel export and immediate API adapter consumer. Standard application
`jobs` collection only; dedicated upload queue databases are excluded. Production
DB/provider/browser calls, full suites and shared-tree mutations are outside this check.

## Acceptance criteria

1. **DB1 — Exact runtime tenant composition.** The real accessor composes the existing
   `scopedCollection<Jobs>` and the real runtime `withTenant` path. A database-shaped
   injected seam records exact `{tenantId: owner}` filters for two owners and an absent
   owner; each owner's positive rows remain available and newer foreign rows are absent.
   A caller-supplied conflicting `tenantId` filter cannot override the bound owner.
   Empty tenant refuses before `find`; no unscoped fallback or raw handle escape.
2. **DB2 — Bounded deterministic read.** Default limit 50 and explicit integer limits
   1 through 100; invalid runtime values refuse before a collection/read call. The
   actual cursor receives sort `{createdAt:-1,_id:-1}` and limit `limit+1`; dates
   order before ID ties. Output has at most limit summaries and `truncated` is true
   exactly when an extra matching tenant row is observed. Demonstrate empty,
   below-limit, exact-limit and extra-row cases at limits 1/100, plus default 50/51.
3. **DB3 — Projection and defensive whitelist.** The cursor projection requests only
   `_id`, `kind`, `status`, `provider`, `createdAt`, `updatedAt`. It excludes tenant,
   request/response/error, lease/token/credential/path and cost fields. A deliberately
   projection-ignoring fake driver returns poisoned raw rows; the accessor still
   emits only whitelisted fields, never spreads a document. Required fields are a
   string ID, nonempty string kind, approved status and valid date-time; supplied
   optional fields must have their required string/date-time types. Invalid fetched
   rows, including the extra truncation row, reject the entire page.
4. **DB4 — Read-only failure behavior.** Only collection/find/projection/sort/limit/read
   operations occur; no write, provider dispatch, queue action or global count. Driver
   failures propagate to the API boundary instead of becoming empty-success. The
   API consumer must sanitize failure as fixed 503 without serializing raw exceptions.
5. **DB5 — Immediate downstream composition.** The single integrator exports the real
   accessor and the actual API adapter consumes that export. Record accessor ->
   adapter evidence using a database-shaped seam with real tenant composition;
   ultimately demonstrate real Express HTTP auth/scope/tenant refusal and owner
   success under the parent checker. No fake-store-only proof or missing barrel
   export may be called full integration PASS. API composition is an explicit
   deferred dependency until root READY, not an exemption from the parent criteria.

## Verification and handshake

Independent bounded affected DB tests and a scoped DB typecheck are required after
root READY, together with exact source/test hashes and verbatim command/output.
Checker must independently inspect runtime tenant/filter/projection composition,
malformed extra-row behavior and failure propagation. Record any missing evidence
as pending or FAIL, never infer it from maker prose. Applicable contract validator
output must retain its vacuity limitation when no frozen contracts exist.

Maker request: manifest `ready-for-check`, Fix cycle N. Checker response: dedicated
verdict with Cycle checked N and independently derived DB1–DB5 evidence. Scoped DB
PASS, if warranted, does not PASS the HTTP/UI feature or close T-057. Parent integration
acceptance remains mandatory. No final checks or PASS before root READY.

## Amendment log

- 2026-10-09: Initial independent CHECKERPREP, authored from the already authorized
  parent contract/machine specification while the builder is working. No tests run,
  no source/shared-contract changes, no acceptance verdict.

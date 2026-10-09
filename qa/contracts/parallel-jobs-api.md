# Contract — parallel-jobs-api (T-057)

Independent checker preparation, 2026-10-09. Tier 3 roadmap; new read-only Jobs API seam,
zero prior PASSes. This unit implements the API slice of `parallel-jobs-read.md` and
`qa/evidence/parallel-jobs-read/contract.json`; it grants no full-feature or release PASS.
Builders never edit this contract. No criteria are inferred from the building implementation.

## Scope

`apps/api/src/jobs/{router.ts,store.ts,router.test.ts,store.test.ts}` only, with maker manifest
`qa/manifests/parallel-jobs-api.md`. Existing authentication and scoped application database
helpers remain unchanged. GET `/jobs` describes provider audit records, not upload queue or
pipeline completion. `jobs` is the sole new required scope; `sessions` and `keys` do not grant it.
Production/server mounting belongs to later integration and cannot be certified by this unit.

## Acceptance criteria

1. **Real authorization before reads.** An Express harness composes existing verified API-key
   authentication with the actual Jobs router and `requireScope("jobs")`. Missing, invalid and
   revoked credentials receive 401; valid credentials lacking `jobs`, including sessions-only
   and keys-only keys, receive 403. All denials precede reader/store calls. A valid jobs owner
   receives 200, so deny-all cannot pass. Only verified `req.auth.tenantId` reaches the store.
   Caller tenant headers cannot switch it. Never mint a real key or change auth helpers.
2. **Strict scalar query before dependencies.** Only `limit` is accepted, default 50. An explicit
   value is one scalar ASCII decimal matching `^[1-9][0-9]{0,2}$`, range 1..100. Refuse duplicate
   values, bracket arrays/objects, unknown and tenant query selectors, and body tenant/unknown
   selectors before calling dependencies. Exercise 0, negative, 101, whitespace, leading zero,
   exponent, fractional, Unicode-digit and empty values; accepted 1/50/100 remain positive.
   Invalid input gets fixed sanitized 400, never caller-controlled values or paths.
3. **Bounded adapter and tenant composition.** `createMongoJobsReadDeps` defaults to the actual
   scoped application jobs reader, supports an injected database-shaped seam and validates
   tenant/limit before invoking it. Through actual accessor -> adapter -> router HTTP composition,
   seed two tenants with a foreign newest row; each owner sees only its rows. Prove the tenant
   filter at database `find`, not merely route fakes. Assert explicit projection, descending
   `{createdAt:-1,_id:-1}` sort and `limit+1` query. No dedicated upload database is consulted.
4. **Honest truncation.** Envelope exactly `{jobs,limit,truncated}`; at most limit summaries.
   `truncated` means an observed extra matching tenant row, without global-count claims. Cover
   empty, below, exact and over limit, tie sorting and 1/100 boundaries. Refuse malformed
   dependency envelopes, inconsistent limit/truncation or oversized result sets with fixed 503.
5. **Explicit whitelist at both boundaries.** Summary requires string `_id`, nonempty string
   `kind`, status pending/processing/done/failed and valid date-time string `createdAt`; optional
   `provider` string and valid date-time `updatedAt` only. Preserve literal safe values. Database
   projection and defensive HTTP projection separately omit tenantId, request, response, error,
   claimToken, leaseUntilMs, credentials, paths, model and cost fields. Poison extras at both
   boundaries. Invalid required/optional fields fail the whole response with fixed sanitized
   503, including invalid extra fetched row; no silent dropping or partial healthy success.
6. **Read-only and sanitized failures.** Store exceptions, payloads, credentials and paths never
   reach HTTP. Success sends `Cache-Control: private, no-store`. Adapter performs no insert,
   update, delete, queue action, provider call or background dispatch. Tests prove refusal and
   owner-positive paths with fixed error shapes; unknown raw data must never be spread into JSON.
7. **Bounded verification and handoff.** After root READY and matching ready-for-check manifest,
   independently run affected bounded tests and scoped typecheck; record exact command/output,
   tested source hashes and Fix cycle/Cycle checked match. Run `contracts/verify_contracts.py`
   as applicable. Missing DB barrel wiring or production mounting is an explicit integration
   dependency, not a license to modify shared files or claim complete T-057 acceptance.

## Gates and outstanding work

No tests or PASS during BUILDING; root explicitly signals READY before checker execution.
Only checker writes verdict/evidence; maker closes a matching scoped PASS to checked-PASS.
No source, DB, provider, browser, full-suite, runtime or deployment mutation is authorized here.
Independent server/production mounting, frontend/key-race downstream acceptance, broader checks
and any separately required live evidence remain obligations of the parent contract.

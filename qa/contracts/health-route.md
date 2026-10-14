# Contract — health-route (plan §10 U0.7, first half)

> **AMENDED by D-129 (2026-10-12, Approver Umesh): `/health` returns liveness only; no collection counts. See Amendment log. Criteria C1, C2, C3, C6 and I1 below are read through that amendment.**
>
> Ground truth for `GET /health` — `apps/api/src/routes/health.ts`,
> `createMongoHealthDeps()` in `apps/api/src/store.ts`, and `fakeHealthDeps()` in
> `apps/api/src/fixtures.ts`. Created and adopted by /checker in the same action: the manifest
> explicitly deferred contract-writing to the checker per the project's segregation-of-duties
> rule (ISS-006), citing the deliberately unauthenticated design as exactly the kind of choice
> that warrants a frozen invariant — this file *is* the first draft, written from the manifest's
> proposed criteria plus this checker's own independent read of the route, the store wiring, and
> `server.ts`'s mount order.
>
> **Why this contract exists:** this is the ONE deliberate exception to "every JSON/data route
> stays behind `requireAuth`" in this codebase. That exception is defensible only as long as the
> response body genuinely never carries more than aggregate cross-tenant counts. The risk this
> contract guards against is narrow but sharp: a future edit that adds a field to `HealthReport`
> (a sample document, a tenant id, an error stack trace, per-tenant breakdowns) would silently
> turn a safe ops probe into an unauthenticated data leak, and nothing but this contract would
> catch it before merge.

## Scope

`apps/api/src/routes/health.ts` (`HealthReport`, `HealthDeps`, `createHealthRouter`),
`createMongoHealthDeps()` in `apps/api/src/store.ts`, `fakeHealthDeps()` in
`apps/api/src/fixtures.ts`, and the route's mount position (before `requireAuth`) in
`apps/api/src/server.ts`. Out of scope: `/search` (plan §10 U0.7's other half — a separate,
larger unit per the manifest), and the `schema/index.json` collection-name-list mechanism itself
(governed by whatever unit originally established `schema/index.json` as the source of truth;
this contract only requires that `createMongoHealthDeps()` keep reusing it rather than a
hand-maintained duplicate).

## Criteria (each machine-checkable)

1. **[C1] Response shape is exactly `{db, collections}` — nothing else.** `HealthReport` has
   exactly two fields: `db: "ok" | "error"` and `collections: Record<string, number>`. Verified
   by reading the interface in `health.ts`; any additional field added in a future edit is a
   contract violation regardless of what it contains (see I1).
2. **[C2] AMENDED by D-129: NO counts, liveness only.** `createMongoHealthDeps()` calls only `db.command({ping:1})`; no `countDocuments`, `find`, or aggregation, and the body carries no `collections` field (tenant-scoped counts live on authenticated `GET /system-status`). [Superseded text: Counts are aggregate only — no per-tenant breakdown, no document content.**
   `createMongoHealthDeps()` calls only `db.command({ping:1})` and
   `db.collection(name).countDocuments()` with no filter argument (a bare, unscoped count), never
   `findOne`/`find`/an aggregation pipeline that could return document fields or tenant-keyed
   sub-counts. Verified by reading `store.ts` — no `.find(`, no per-`tenantId` grouping in
   `checkHealth()`.
3. **[C3] A ping failure never leaks exception detail.** The `try/catch` around
   `db.command({ping:1})` returns the fixed literal `{db: "error", collections: {}}` — the catch
   block must not read, log-to-response, or otherwise surface `error.message`/`error.stack` in
   the HTTP response. Verified by reading `store.ts`'s catch block (no bound exception variable
   used in the return value) — machine-checked by the "reports 503... when unhealthy" test
   asserting `collections` is exactly `{}`.
4. **[C4] 503, not 200, when unhealthy.** `res.status(report.db === "ok" ? 200 : 503)` — an
   unhealthy backend must be visible via HTTP status, not just body content. Machine-checked by
   `health.test.ts` and by the mutation test below.
5. **[C5] Unauthenticated by design, mounted before `requireAuth`.** `createHealthRouter` is
   registered in `server.ts` before `app.use(requireAuth(deps.keyStore))`, and the surrounding
   comment explicitly names `/health` as the one disclosed exception. Machine-checked by
   `health.test.ts`'s "no Authorization header" test plus a direct read of `server.ts`'s mount
   order.
6. **[C6] Collection list stays index-derived, never hand-duplicated.** `createMongoHealthDeps()`
   derives collection names from `schema/index.json`'s own top-level keys (filtering `$`-prefixed
   metadata keys), not a second hardcoded array that could drift. Verified by reading `store.ts`.
7. **[C7] Build stays green.** `pnpm --filter @lkb/api typecheck`, `pnpm -r typecheck`, and
   `pnpm --filter @lkb/api test` (all tests, including the 2 new `health.test.ts` tests) all pass.
8. **[C8] Mutation-provable.** Hardcoding `res.status(200)` in place of the conditional must
   redden exactly the "reports 503... when unhealthy" test and no other — proving the test
   actually exercises the unhealthy branch, not merely asserting a status coincidentally true.
9. **[C9] Structure budget.** `pnpm lint:structure` exits 0 with these files tracked in git.

## Invariants

- **[I1] The response body must never contain tenant-scoped content, only aggregate counts.**
  This is the load-bearing invariant behind the entire unauthenticated design choice. Any future
  change to `HealthReport`, `checkHealth()`, or the route handler that adds a document sample, a
  tenant id, a per-tenant count, an email/name/free-text field, or any other non-aggregate value
  is a contract break and must be rejected even if it typechecks and all existing tests pass —
  existing tests only assert the CURRENT shape, they cannot catch a new field being added safely
  in isolation. A checker reviewing such a change must treat "the current tests still pass" as
  insufficient evidence of safety here.
- **[I2] `/health` stays the only unauthenticated JSON/data route without a fresh, explicit,
  reasoned exception.** If a future unit wants to add another unauthenticated data route, that is
  a new deliberate decision needing its own manifest + checker judgment, not something to
  piggyback onto this contract's precedent silently.
- **[I3] A ping/count failure must never throw past the route handler.** `checkHealth()` always
  resolves, never rejects, regardless of the underlying Mongo error type — an ops probe that
  crashes on the failure it exists to detect is worse than useless.
- **[I4] The route stays read-only.** No write path is added to `HealthDeps` under this contract.

## Debatable-but-accepted tradeoff (recorded, not silently agreed)

Exposing "collection X has N documents" to an unauthenticated caller is not a hard security bug
(no tenant/customer identity, no content), but it does leak coarse business-volume signals (e.g.
`sessions`, `claims`, `turns` growth over time via repeated polling) to anyone who finds the URL.
This checker judged that acceptable for an internal ops-monitoring endpoint given the current
threat model (no public marketing of the URL, no sensitive-industry compliance requirement known
to this project), but flags it explicitly: if `/health` is ever exposed through a public
load balancer health-check page or similar, this tradeoff should be revisited (e.g. rounding
counts, or gating behind network-level restriction rather than an API key).

## Out of scope / ignore

- `/search` (plan §10 U0.7's other half): a separate unit, not built here.
- `schema/index.json`'s own correctness as an index-definition file: governed elsewhere.
- Any future health-check enrichment (latency, queue depth, worker liveness): not built, not
  claimed by this unit — would need its own manifest and an amendment to I1's field list here.

## Amendment log
- 2026-09-08 · routine · Contract CREATED and ADOPTED by /checker in the same action on the
  `health-route` cycle-1 check, from the manifest's proposed criteria (deferred per ISS-006
  segregation-of-duties, explicitly flagged by the maker given the unauthenticated design) plus
  this checker's own independent verification of `health.ts`, `store.ts`'s
  `createMongoHealthDeps()`, `server.ts`'s mount order, `schema/index.json`'s `$comment`, a fresh
  mutation test (hardcoded `res.status(200)`, confirmed exactly the 503 test reddens, restored,
  confirmed 2/2 green), an independent live-database reproduction via a throwaway deleted script
  (confirmed `db: "ok"` with real non-trivial counts matching the manifest's pasted figures), and
  independently re-derived typecheck/test/lint:structure results. START stands on plan §10 U0.7.
- 2026-10-12 · Approver ruling (D-129, Umesh: "Counts hatao, sirf liveness") · C2 replaced: `/health` must stop returning all-tenant collection counts and keeps only liveness (API up, DB reachable). Any criterion requiring a `collections` field in the /health body (C1 `{db, collections}`, C3 `collections: {}` on failure, C6 index-derived collection list, I1 aggregate-counts wording) is void; the body is `{db}` only. C4 (503 when unhealthy) and C5 (unauthenticated, mounted before requireAuth) stand. Closes the open part of ISS-T057SCREEN-001. Code/test changes still need their own unit.

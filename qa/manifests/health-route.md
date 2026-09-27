# Manifest — health-route

**Contract:** none existing covers this directly (plan §10 U0.7, first half). Proposed criteria
below for the checker to adopt or amend as `qa/contracts/health-route.md`.
**Goal task:** none (plan §10 U0.7 — Phase 0 finish item)
**Date:** 2026-09-08
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** none (new capability, not a bug fix)

## Why

Plan §10, Phase 0 (`U0.7 — GET /health + GET /search un-stub`): "`/health` = db ping + collection
counts." No `/health` route existed at all before this unit (not even a stub). This unit builds
only the `/health` half — `/search` is a separate, larger unit (lexical retrieval over
`turns`/`session_pages`) that this manifest deliberately does not attempt, to keep the unit
small and reviewable.

## What changed

1. **`apps/api/src/routes/health.ts`** (new) — `GET /health`, injected `HealthDeps.checkHealth()
   → HealthReport = {db: "ok"|"error", collections: Record<string, number>}`. Returns 200 when
   `db === "ok"`, **503** when `db === "error"` (a health probe's job is to make an unhealthy
   backend visible via the HTTP status code, not just the body — the standard uptime-monitor
   convention). **Deliberately unauthenticated** — mounted before `requireAuth` in `server.ts`,
   alongside the existing `*-page.ts` routes, since an ops liveness probe should not need a
   scoped API key. This is a disclosed, narrow exception to "every JSON/data route stays behind
   auth" (the comment in `server.ts` is updated to say so explicitly): safe because the response
   carries only aggregate cross-tenant counts, never tenant-scoped content.
2. **`apps/api/src/store.ts`** — `createMongoHealthDeps()`:
   - Pings via `db.command({ping: 1})` (the standard MongoDB liveness check), wrapped in
     try/catch — a ping failure returns `{db: "error", collections: {}}` rather than throwing;
     the route's whole job is to REPORT an unhealthy backend, never crash reporting it.
   - Derives the collection name list from **`schema/index.json`'s own top-level keys** (its
     `$comment` explicitly says these ARE the real Mongo collections, deliberately excluding
     `features_event`, a JSONL-line schema not a collection) — reused rather than a second
     hand-maintained list that could drift from it, same reasoning `scripts/live-verify.mjs`
     already applies to `schema/*.schema.json`.
   - Counts every collection in parallel via `Promise.all`.
3. **`apps/api/src/server.ts`** — added `health: HealthDeps` to `ServerDeps`; mounted
   `createHealthRouter(deps.health)` before `requireAuth`, alongside the page routes; updated the
   surrounding comment to name this one deliberate unauthenticated-JSON-route exception.
4. **`apps/api/src/production.ts`** — wires the real `createMongoHealthDeps()`.
5. **`apps/api/src/fixtures.ts`** — `fakeHealthDeps()`, defaulting to a healthy report with two
   fixture counts; accepts overrides so a test can simulate the unhealthy path.
6. **`apps/api/src/routes/health.test.ts`** (new, 2 tests) — healthy → 200 with real shape, no
   `Authorization` header required; unhealthy (`db: "error"`) → 503 with empty collections, not
   200.

No `stubs.ts` change — `/health` never had a stub entry (it didn't exist at all before this
unit). No `packages/*` change needed.

## Evidence

`pnpm --filter @lkb/api typecheck` — clean.
`pnpm -r typecheck` — all 10 workspace projects clean.
`pnpm --filter @lkb/api test` — 82/82 pass (80 pre-existing + 2 new health tests).
`pnpm lint:structure` — clean (229 files in budget, 251 modules / 750 dependencies cruised, 0
violations, tracker-audit gate G1 OK).
`node scripts/catalogue-score.mjs` — no diff (`/health` is infrastructure/ops, not one of the
plan §4c's 57 numbered features, so it correctly does not move the catalogue score).

**Mutation-tested with proof of application**: reverted `res.status(report.db === "ok" ? 200 :
503)` to a hardcoded `res.status(200)` (confirmed via `grep`/note the file content changed),
re-ran `health.test.ts`: **1/2 pass, exactly the "reports 503... when unhealthy" test reddened**
(`AssertionError: 200 !== 503`). Restored, re-ran: 2/2 green.

**Real live proof against the actual production database** (read-only — `ping` + `countDocuments`
only, no writes), run via a throwaway script deleted immediately after:
```
db: ok
collections with data: [ turns 2118, sessions 26, sources 26, claims 81, session_pages 24,
  jobs 226, api_keys 5, eval_runs 4, meeting_candidates 13, trusted_senders 1 ]
total collections reported: 21
```
This confirms the real `createMongoHealthDeps()` implementation — not just the fake used in
`health.test.ts` — genuinely pings production Mongo and returns real counts matching this
session's known real data (26 sessions, 81 claims, 2118 turns — consistent with figures cited
elsewhere in this session's work).

## How to verify (checker)

1. Read `apps/api/src/routes/health.ts` — confirm the 200-vs-503 status logic and that the route
   is genuinely mounted before `requireAuth` (unauthenticated).
2. Read `apps/api/src/store.ts`'s `createMongoHealthDeps()` — confirm the ping-then-count logic,
   the try/catch around the ping, and that the collection list comes from `schema/index.json`
   (not a separately hand-maintained array that could drift).
3. Run `pnpm --filter @lkb/api typecheck` and `pnpm -r typecheck` — both clean.
4. Run `pnpm --filter @lkb/api test` — 82/82.
5. Reproduce the mutation: hardcode `res.status(200)`, confirm via `git diff` the content
   changed, re-run `health.test.ts`, confirm exactly the 503 test reddens, restore, confirm 2/2
   green again.
6. **Reproduce the live check yourself** — connect to the real database (`.env`'s
   `MONGODB_URL`) and confirm `createMongoHealthDeps().checkHealth()` returns `db: "ok"` with
   non-trivial counts; do not just trust the pasted output above.
7. Confirm `pnpm lint:structure` clean and `node scripts/catalogue-score.mjs` shows no diff
   (this unit is infra, not a catalogue feature).
8. Consider whether `qa/contracts/health-route.md` is warranted (checker territory per ISS-006 —
   the maker deliberately did not draft one).

## Risk / rollback

Pure additive route, read-only against the database (a `ping` command and `countDocuments` —
never a write). The one deliberate design choice worth a human's attention on review: this route
is unauthenticated by design, disclosed explicitly in both the code comment and this manifest,
not something that crept in silently. Reversible by `git revert`.

**Status: checked-PASS**

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree

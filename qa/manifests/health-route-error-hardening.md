# Manifest — health-route-error-hardening

**Contract:** qa/contracts/health-route.md (strengthens the existing "never crash reporting an
unhealthy backend" claim to actually hold for every failure path, not just the ping)
**Goal task:** none (ledger-driven unit)
**Date:** 2026-09-08
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** ISS-070

## Why

ISS-070 (filed by the Mode B sweep that reviewed `health-route`, commit `53d73fa`):
`createMongoHealthDeps().checkHealth()` only wrapped `db.command({ping: 1})` in try/catch — the
subsequent `Promise.all(...countDocuments...)` and `readFileSync(SCHEMA_INDEX_PATH)` sat outside
any try/catch, and `apps/api` has no repo-wide error-handling middleware. `health.ts`'s own file
comment specifically claims "the route's whole job is to REPORT an unhealthy backend, never crash
reporting it" — a claim that did not hold for a transient failure occurring *after* a successful
ping (e.g. a network blip between the ping and the count starting). On the one route ops depends
on being reliably answerable, an unhandled promise rejection there is exactly the failure mode a
liveness probe exists to never produce.

## What changed

1. **`apps/api/src/health-probe.ts`** (new) — extracted `probeMongoHealth(ping, countAll):
   Promise<HealthReport>`, wrapping BOTH steps in one try/catch. Any failure from either
   degrades to `{db: "error", collections: {}}`; success returns `{db: "ok", collections}`.
   Extracted into its own module (rather than left inline in `store.ts`, which "tests never
   import" per its own header comment) specifically so this failure-handling logic is directly
   unit-testable with fakes, not only exercisable end-to-end against a real database.
2. **`apps/api/src/store.ts`** — `createMongoHealthDeps()` now calls `probeMongoHealth(ping,
   countAll)` instead of hand-rolling the try/catch itself; the ping and counting logic is
   unchanged, only where the error boundary sits moved.
3. **`apps/api/src/health-probe.test.ts`** (new, 3 tests) — happy path (both succeed → `db: ok`
   with real counts); ping failure → `db: error` (pre-existing behavior, still covered); **the
   ISS-070 regression**: a `countAll` failure AFTER a successful `ping` also degrades to
   `db: error` rather than rejecting, asserted via `assert.doesNotReject`.

`apps/api/src/routes/health.ts` and `health.test.ts` are unchanged — the fix is entirely inside
the store-layer failure boundary, not the route's own handling (which already correctly maps
`db: "error"` to a 503).

## Evidence

`pnpm --filter @lkb/api typecheck` — clean.
`pnpm -r typecheck` — all 10 workspace projects clean.
`pnpm --filter @lkb/api test` — 85/85 pass (82 pre-existing + 3 new `health-probe.test.ts`
tests).
`pnpm lint:structure` — clean (231 files in budget, 253 modules / 755 dependencies cruised, 0
violations, tracker-audit gate G1 OK).
`node scripts/catalogue-score.mjs` — no diff to the actual percentage (21.9%/30.7%, 57
features unchanged) — this is error-handling, not a new feature.

**Mutation-tested with proof of application**: reverted `probeMongoHealth` to the exact
ISS-070-bug shape (two separate try/catch blocks, the second uncovered) — confirmed via `diff`
against a pre-mutation backup that the file content genuinely changed — re-ran
`health-probe.test.ts`: **2/3 pass, exactly the new "count failure AFTER a successful ping"
test reddened** (`AssertionError [ERR_ASSERTION]: Got unwanted rejection... "transient
countDocuments failure"` — the mutation reproduces the ORIGINAL bug precisely, an unhandled
rejection escaping the probe). Restored, re-ran: 3/3 green, then confirmed
`health-probe.test.ts` + `health.test.ts` together: 5/5 green.

**Real live proof against production Mongo** (read-only): confirmed the real
`createMongoHealthDeps().checkHealth()` still returns `db: "ok"` with 21 real collection counts
(happy path unaffected by the refactor), AND separately called `probeMongoHealth` directly with
a real-shaped succeeding `ping` and a deliberately throwing `countAll`, confirming it returns
exactly `{"db":"error","collections":{}}` rather than propagating the throw — the exact failure
mode ISS-070 named, reproduced and shown fixed against the live module, not just the isolated
test file. Script run via `npx tsx`, deleted immediately after, no trace left.

## How to verify (checker)

1. Read `apps/api/src/health-probe.ts` — confirm `probeMongoHealth` wraps both `ping()` and
   `countAll()` under one try/catch.
2. Read `apps/api/src/store.ts`'s `createMongoHealthDeps()` — confirm it now delegates to
   `probeMongoHealth` rather than hand-rolling the boundary.
3. Run `pnpm --filter @lkb/api typecheck` and `pnpm -r typecheck` — both clean.
4. Run `pnpm --filter @lkb/api test` — 85/85.
5. Reproduce the mutation: revert `probeMongoHealth` to two separate try/catch blocks (ping
   guarded, counting not), confirm via `git diff` the content changed, re-run
   `health-probe.test.ts`, confirm exactly the "count failure AFTER a successful ping" test
   reddens, restore, confirm 3/3 (and 5/5 combined with `health.test.ts`) green again.
6. Confirm `pnpm lint:structure` clean and `node scripts/catalogue-score.mjs` shows no percentage
   change.
7. Ledger: ISS-070 should move to `fixed` with `fixed_date` set, citing this manifest.

## Risk / rollback

Pure code change, reversible by `git revert`. No production data touched (read-only route,
unchanged behavior on the happy path — confirmed live).

**Status: checked-PASS**

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree

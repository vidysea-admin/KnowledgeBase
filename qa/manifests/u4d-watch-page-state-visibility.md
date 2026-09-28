# Manifest — u4d-watch-page-state-visibility

**Status:** ready-for-check
**Fix cycle:** 0 of max 3
**Authorized by:** D-047 (ISS-358: extend `/watch` to read `watch_state` — option a, not R4 re-scope
or collection unification); D-048/ISS-361 (also surface `watch_heartbeat`, a third, two-part-keyed
collection, in the same pass)
**Round cap:** first unit on the U4d seam — no prior rounds to count against the class-based cap
(D-014). This is new surface, not a re-fix of a filed issue, so D-015's "measure against the
issue's own reproductions" does not apply; R8 tenancy is nonetheless treated as security-class per
D-014 and is covered by a live two-key HTTP test (see Evidence).
**Branch:** `worktree-agent-a779f0b3b445697af`
**Base:** `095585db50c83b3e931b44ae61a04a953ee85411` (tick: ADVANCED — 2 close-outs, D-053, ISS-366
repair, wave of 3 dispatched)

## What changed, file:line

All edits are in-place extensions of existing files — no new backend files, per the brief's dirsize
constraint (`apps/api/src` already at 32/31, `apps/api/src/routes/` at capacity). Two new *web*
files, justified below (web has no dirsize pressure).

- **`packages/db/src/collections/watch-state.ts:31`** — new exported `listWatchState(tenantId)`:
  returns every `watch_state` row for the tenant, newest-first by `seenAt`, capped at 200. Goes
  through the file's existing `watchState(tenantId)` tenant-scoped collection handle — same pattern
  `findWatchState`/`listSeenIds` already use in this file, no new tenancy code path.
- **`apps/api/src/routes/health.ts:85,94,97,111`** — behavior-preserving refactor, no route change:
  - `isStale` (was private) is now `export function isStale(...)`.
  - New `export const EXPECTED_WATCH_SOURCE_TYPES = ["drive", "gmail", "calendar"] as const;`
  - New `export interface HeartbeatStatus { tenantId; sourceType; lastHeartbeatAt; stale }`.
  - New `export function heartbeatStatuses(tenantId, rows, now, intervalMs, expected = EXPECTED_WATCH_SOURCE_TYPES): HeartbeatStatus[]`, extracted from what was inline `byType`/`candidates` logic
    inside `detectSilentWatchers`. `detectSilentWatchers` itself now just calls
    `heartbeatStatuses(...).filter(s => s.stale)` — same external behavior. All pre-existing
    `health.test.ts` assertions (which test only `/health`'s public JSON shape) pass unmodified —
    see Evidence.
  - Reused rather than re-declared: this is the ONE place `isStale`'s staleness predicate lives; the
    new `/watch-state` route (below) imports it via `heartbeatStatuses`, it does not reimplement it.
- **`apps/api/src/routes/watched-sources.ts:61-67,146-159`** — extended `WatchedSourceDeps` with
  three OPTIONAL fields (`listWatchState?`, `listHeartbeats?`, `heartbeatIntervalMs?` — optional so
  `fixtures.ts`'s default `fakeWatchedSourceDeps()` needs no edit; that file is at 299/300 lines with
  no headroom). New route `GET /watch-state`, `requireScope("sources")` (reuses the existing
  freeform `"sources"` scope — no schema change needed for a new scope). Returns 501
  `{error:"not_implemented"}` when the three deps are not wired (the U4c-only default), otherwise
  `{state, heartbeats}` where `heartbeats` is computed via `heartbeatStatuses` from `health.ts` — the
  exact same staleness predicate R2's alert uses, so this page can never show a watcher healthy that
  the alert already fired on as silent (the spec's own R4 restatement of R2).
- **`apps/api/src/production.ts`** — `function watchHeartbeatIntervalMs(): number` (line 54)
  extracted as the SINGLE place the 1-hour default lives; `createMongoWatchSilenceDeps` (pre-existing)
  now calls it instead of inlining `Number(process.env.WATCH_HEARTBEAT_INTERVAL_MS) || 3600000`
  itself. New `function createMongoWatchStateReadDeps()` (line 83) wires `listWatchState` (from
  `@lkb/db`), `listHeartbeats` (pre-existing, from `watch-heartbeat.ts`), and the shared interval
  function into the deps object. `watchedSources: { ...createMongoWatchedSourceDeps(), ...createMongoWatchStateReadDeps() }` — merged, replacing what was a bare
  `createMongoWatchedSourceDeps()` line.
- **`apps/web/src/api/watch-state.ts`** — **NEW FILE**, justified in its own header comment: follows
  the existing one-client-per-resource convention (`watched-sources.ts`, `meeting-candidates.ts`);
  `apps/web/src/api/` has 15 files against a 30-file budget, no dirsize pressure. Exports
  `WatchStateRow`, `WatchHeartbeatStatus`, `WatchStateResponse`, `getWatchState(apiKey)`.
- **`apps/web/src/pages/WatchPage.tsx`** — new imports, two new state variables
  (`watchState`/`watchStateError`), an independent `useEffect` (a failure here must not blank the
  watched-sources lane above it — same isolation the candidates lane already has), a computed
  `recentFailures` (failed rows, capped client-side at 20 on top of the API's own 200-row cap), and a
  new "Watcher liveness (Drive · Gmail · Calendar)" card between the watched-sources card and "Next
  up", covering: unreachable (`watch-state-unreachable`), loading (`watch-state-loading`), one row
  per expected source type with a healthy/silent badge and a plain-language sentence
  (`watch-heartbeat-row`, `watch-heartbeat-plain-language` — R7), no-recent-failures
  (`watch-state-no-failures`), and one row per recent failure with its verbatim `failureReason`
  (`watch-state-failure-row`, `watch-state-failure-reason` — R1's own requirement, now visible here
  too).
- **`apps/web/src/pages/WatchPage.test.tsx`** — new `EMPTY_WATCH_STATE` fixture, a `beforeEach` mock
  for `getWatchState`, and 5 new tests: unreachable state, loading-then-resolved, a stale heartbeat
  rendered as silent with its plain-language line, a fresh heartbeat rendered as alive, and a failed
  `watch_state` row rendering its `failureReason` verbatim.
- **`docs/features/u4-watch-dashboard/spec.md`** / **`plan.md`** — R4 amended and the U4d row added,
  pre-authorized explicitly by D-047 for exactly this edit.
- **`apps/api/src/routes/watched-sources.test.ts`** — new `fakeWatchStateReadDeps()` (tenant-
  partitioned by a `Record<tenantId, T[]>` map — not the `fakeMeetingCandidatesDeps` shape ISS-359
  flagged as ignoring its `tenantId` argument; this one truly branches on it) defined locally since
  `fixtures.ts` has no LOC headroom, and 4 new tests: 501-when-unwired, 403-without-scope, staleness-
  computed-via-`heartbeatStatuses`, and the two-tenant isolation live walk (see Evidence).

## Why not a new API route file / why `health.ts` is imported from

Both `apps/api/src` (32/31) and `apps/api/src/routes/` are already at or over `lint-dirsize` budget
(measured below — unchanged by this unit). A new `watch-state.ts` route file would add a 33rd file
to `src` or push `routes/` over, neither of which I have authority to raise myself per the brief.
`health.ts` already held the exact staleness logic R4 needs to restate (R4 explicitly requires "the
exact staleness predicate R2's alert uses"); exporting from it and importing into `watched-sources.ts`
avoids a second implementation existing anywhere, and follows the precedent already in this repo of
route files importing from each other's modules when the logic is genuinely shared.

## Verify commands (re-runnable)

```
pnpm -r typecheck
node scripts/lint-dirsize.mjs
node scripts/lint-loc.mjs
node scripts/lint-root.mjs
node scripts/lib/lint-codex-hooks.mjs
node scripts/lint-dupes.mjs
node scripts/lint-migrations.mjs
node scripts/snapshot.mjs --check
node scripts/tracker-audit.mjs --gate g1,g4
npx depcruise --config .dependency-cruiser.cjs packages apps workers
npm run test:lint
(cd apps/api && npm test)
(cd apps/web && npx vitest run)
python schema/validate.py
```

## Evidence (real pasted output)

### `pnpm -r typecheck` — clean, all 10 workspace projects

```
Scope: 10 of 11 workspace projects
apps/web typecheck: Done
packages/core typecheck: Done
packages/db typecheck: Done
packages/ai typecheck: Done
packages/ask typecheck: Done
packages/ingest typecheck: Done
packages/index typecheck: Done
apps/api typecheck: Done
packages/meeting-bot typecheck: Done
```

One fix was needed to get here and is worth recording because it is a real TypeScript gotcha, not a
logic bug: `node:assert/strict`'s `deepEqual` aliases to `deepStrictEqual`, typed
`<T>(actual: unknown, expected: T): asserts actual is T`. In the new isolation test,
`assert.deepEqual(bBody.state, [], ...)` inferred `T` as `never[]` from the bare `[]` literal, and
the `asserts actual is T` signature then narrowed `bBody.state` itself to `never[]` for the rest of
the block — breaking the following `.some((s) => s.failureReason ...)` with TS2339 ("does not exist
on type 'never'"). Fixed at `apps/api/src/routes/watched-sources.test.ts:366` by asserting on
`bBody.state.length` (narrows only that `number` property, not the array's element type) instead of
`deepEqual`-ing the array against a literal.

### `apps/api` test suite — 217/217 pass, 0 fail

```
ℹ tests 217
ℹ suites 0
ℹ pass 217
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

Includes, verbatim from the run:
```
✔ U4d: GET /watch-state 501s when the deployment has not wired the read deps (the A13-only default) (10.0926ms)
✔ U4d: GET /watch-state 403s without the sources scope (11.4419ms)
✔ U4d: GET /watch-state returns watch_state rows and heartbeat staleness computed server-side, per R2's own rule (14.9608ms)
✔ U4d/R8: one tenant's watch-state read never returns another tenant's rows -- live two-key walk (18.0029ms)
```
and every pre-existing `health.ts` test still green, confirming the `isStale`/`heartbeatStatuses`
extraction did not change `/health`'s behavior — e.g.:
```
✔ R2: a watcher whose heartbeat is older than the interval produces exactly one alert (2.1039ms)
✔ R2: the exact interval boundary is fresh, one millisecond past it is silent (0.433ms)
✔ health.ts's local isStale agrees with scripts/watch/lib/heartbeat.mjs case for case (drift pin) (4.7282ms)
```

**This is the live two-tenant walk** the brief asks for: a real Express app on a real ephemeral
loopback port (`startTestServer`), two real API keys mapped to two real tenants
(`a-key`→`tenant-a`, `b-key`→`tenant-b`) via `fakeKeyStore`, two real `fetch()` calls against
`GET /watch-state` with real `Authorization: Bearer` headers. Tenant A's response returns its one
seeded row with `failureReason: "tenant-a's own failure"`; tenant B's response returns zero
`watch_state` rows, no row anywhere in its response contains tenant A's failure text, and — because
tenant B has zero heartbeat rows of its own — every source type in its `heartbeats` array is
`stale: true` (D-048: absence is maximally stale, never borrowed from another tenant). The isolation
runs through `scopedCollection()`-shaped tenant partitioning in the fake (`Record<tenantId, T[]>`,
branching on the argument, unlike the `fakeMeetingCandidatesDeps` gap ISS-359 flagged) and through
the real route's `req.auth!.tenantId` → `deps.listWatchState(tenantId)` call, so the isolation is
proven at the HTTP boundary, not just inside a fake.

### `apps/web` test suite — 154/154 pass across 17 files

```
Test Files  17 passed (17)
     Tests  154 passed (154)
```
`src/pages/WatchPage.test.tsx (19 tests)` — the 14 pre-existing U4c tests plus the 5 new U4d tests,
all green.

### `dependency-cruiser` — clean

```
✔ no dependency violations found (378 modules, 1193 dependencies cruised)
```
No new violation from `watched-sources.ts` importing `heartbeatStatuses`/`HeartbeatStatus` from
`./health.js` (same-directory, same-layer import); `apps/* -> packages/meeting-bot` remains
untouched and forbidden per D-053.

### `lint-dirsize` — the ONE pre-existing violation, unchanged

```
lint-dirsize: FAIL — 1 violation(s)
  apps/api/src: 32 files (budget 31)
```
Same count as the brief's disclosed baseline. No new file was added to `apps/api/src` or
`apps/api/src/routes/` by this unit (confirmed: `git status --porcelain` shows only one untracked
file, `apps/web/src/api/watch-state.ts`, which is outside this budget's directory entirely).

### `lint-loc` — the 4 disclosed baseline violations, plus 1 already-flagged, none of them mine

```
lint-loc: FAIL — 5 violation(s)
  packages/index/src/pipeline/speakers-llm.ts:313 (budget 300)
  packages/meeting-bot/py/sb_join.py:437 (budget 300)
  packages/meeting-bot/src/capture/obs-windows.ts:359 (budget 300)
  scripts/lib/dispatch-state.test.mjs:332 (budget 300)
  scripts/watch/run-watch.mjs:558 (budget 300)
```
The first, second, third and fifth are the brief's disclosed baseline, verbatim.
`scripts/lib/dispatch-state.test.mjs:332` is the one the brief flagged as "not in the disclosed
baseline list — appears to have arrived via the master merge" — confirmed still present, still
unrelated to any file this unit touches. Every file this unit created or modified is well under
budget: `watch-state.ts` (db) 50 lines, `health.ts` 165, `watched-sources.ts` 151,
`production.ts` 222 (all budget 300).

### `lint-root`, `lint-codex-hooks`, `lint-dupes`, `lint-migrations`, `snapshot --check` — all match
disclosed baseline exactly

```
lint-root: FAIL — 1 violation(s)  (root has 17 loose files, budget 15 -- disclosed baseline)
lint-codex-hooks: OK (6 pair(s) compared)  -- green, as disclosed ("if it goes red, that's a regression": it did not)
lint-dupes: OK (462 unique export(s), 27 unique schema $id(s))
lint-migrations: OK (1421 file(s) scanned)
snapshot --check: FAIL (docs/SNAPSHOT.md stale, 95 lines) -- disclosed baseline
```

### `tracker-audit --gate g1,g4` — 6 findings, not the disclosed 5; **honest discrepancy, not mine**

```
tracker-audit --gate G1,G4: 6 finding(s)
  G4 ambiguous issue ref: qa/manifests/t-031-audio-watchdog.md ...
  G4 ambiguous issue ref: qa/manifests/t-033-bot-tests.md ...
  G4 ambiguous issue ref: qa/manifests/u3-notify-channels.md ...
  G4 ambiguous issue ref: qa/manifests/u4b-heartbeat-collection.md ...
  G4 ambiguous issue ref: qa/verdicts/t-031-audio-watchdog.md ...
  G4 ambiguous issue ref: qa/verdicts/t-047-controller.md ...
```
The brief disclosed 5 findings; I measured 6. None of the 6 references any file this unit touched —
all are pre-existing `qa/manifests/`/`qa/verdicts/` files citing bare `ISS-001`/`ISS-002` that need
lane-qualifying (D-019). Master has advanced since the brief was written (this worktree's base tick
is `095585d`, itself several ticks past whatever tick the brief's baseline was measured at) — most
likely a 6th manifest/verdict pair picked up the same pre-existing bare-reference pattern in the
interim. Disclosing the count mismatch rather than silently reporting "5, as expected."

### `npm run test:lint` (the `scripts/*.test.mjs` suite) — 107 pass, 5 fail, **all 5 caused by this
worktree's own uncommitted tree, not by the watch-page feature code**

```
ℹ tests 112
ℹ pass 107
ℹ fail 5
```
The 5 failures are `scripts/catalogue-cli.test.mjs`'s "clean tree" family (`--check exits 0 on a
clean tree`, two more `--check` exit-code assertions, and "the suite leaves the repo clean") plus
`scripts/snapshot.test.mjs`'s "current repo's docs/SNAPSHOT.md is <= 200 lines". The catalogue-cli
failures' own output names the exact cause: `REFUSED: <path> is not what the repository holds
(modified/untracked)` for every one of this unit's 8 changed/new files — that check is designed to
refuse scoring a dirty tree, which this worktree currently is, mid-unit, by design (not committed
yet). The `docs/SNAPSHOT.md` failure is the same disclosed baseline staleness as `snapshot --check`
above. None of these 5 exercise `watch-state.ts`, `health.ts`, `watched-sources.ts`,
`production.ts`, or `WatchPage.tsx` — they are the repo's own meta-tooling tests, unrelated to this
unit's code paths. Expected to clear once this unit is committed; the checker should re-run
`npm run test:lint` post-commit to confirm.

### `python schema/validate.py` — schema/ untouched by this unit; one pre-existing gap unrelated to
this unit surfaced by the run

```
FAIL: watch_heartbeat — missing fixture(s)
```
`git status --porcelain -- schema/` returns nothing — this unit did not add, remove, or modify any
file under `schema/`, only added a DB accessor function (`listWatchState`) that reads the
already-schema'd `watch_state` collection. The `watch_heartbeat` missing-fixture failure predates
this unit: `watch_heartbeat` "just landed on master" per the brief (U4b/D-048), and this unit did not
touch its schema or fixtures. Every OTHER collection, including `watch_state` and `watch_reports`,
validates OK. Not claiming to have fixed this; flagging it as a pre-existing gap this unit did not
cause and did not attempt to close (out of this unit's scope).

## New files created, with justification

1. **`apps/web/src/api/watch-state.ts`** — a third per-resource API client, following the existing
   one-client-per-resource convention (`watched-sources.ts`, `meeting-candidates.ts`) for a
   genuinely new resource (`watch_state`/`watch_heartbeat`, disjoint from what those two already
   read). `apps/web/src/api/` is at 15/30 files — no dirsize pressure, unlike the backend.

No other new files. `WatchPage.test.tsx`'s new tests and `watched-sources.test.ts`'s new tests and
fixture helper were added to their existing files, not split out.

## What was NOT verified

- **No test connects to real Mongo.** This is the disclosed, standing coverage gap for this repo
  (production Mongo is read-only by construction and no test may connect to it). The tenant-isolation
  proof above runs through `startTestServer`'s real in-process Express app with fake, tenant-
  partitioned deps (`fakeWatchStateReadDeps`) — it proves the route's `req.auth!.tenantId` wiring and
  the deps-interface contract are correct, but it does NOT prove `packages/db/src/collections/
  watch-state.ts`'s `listWatchState` (or the pre-existing `watchState(tenantId)` scoped-collection
  helper it calls) actually filters correctly against a real MongoDB instance — that would require a
  live or in-memory Mongo, which is out of reach here by repo policy.
- **No real browser walk of `/watch`.** The brief's Mode-D-style "real browser walk" (as U4c's own
  plan row specifies for that unit) was not performed for this addition — verification here is
  React Testing Library component tests (`WatchPage.test.tsx`, jsdom) plus the server-side route
  tests, not Playwright against a running dev server. The 5 new component tests do assert on the
  rendered DOM (data-testid based) rather than on internal state, which is the closest available
  substitute, but a real-browser persona walk (per spec.md's navigation table) was not run.
  Recommend a `/checker` Mode-D pass on `/watch` if that level of proof is required before this ships.
  Also: no test asserts on-screen console-error count for the new section (U4c's own plan row named
  this as one of its checks; this unit did not re-run it for the third section).
  - `WHATSAPP_MSG` recording/live watcher behavior was never exercised — this unit reads
  `watch_state`/`watch_heartbeat`, both already written by `scripts/watch/run-watch.mjs`, but this
  unit did not itself run that watcher against a live Drive/Gmail/Calendar account to confirm the
  written rows have the exact shape read here; it relies on the pre-existing, already-schema-
  validated `WatchState`/`WatchHeartbeat` generated types instead.
- **The `501` unwired path is real for THIS deployment's default-off state**, i.e. before
  `production.ts`'s new `createMongoWatchStateReadDeps()` merge is actually deployed/running against
  a live server, but that live-deployment smoke test was not performed here (no server was started
  against real Mongo — see above).

## Does the alert's deep link now land on a page that can show its subject?

**Yes.** Before this unit, R1's alert (`notifyPollFailed`) named a `watch_state` failure whose deep
link pointed at `/watch`, and `/watch` (U4c) read only `watched_sources`/`meeting-candidates` —
genuinely disjoint collections, confirmed by the U4c checker's own code-reading review (cited in
`WatchPage.tsx`'s own new comment). After this unit, `/watch` renders a new "Watcher liveness"
section reading `GET /watch-state`, which surfaces exactly the row R1's alert would have named
(source type, source id, failure time, and `failureReason` verbatim — R1's own three named fields),
plus the per-source-type heartbeat liveness R2's alert (once wired) would fire on, computed by the
identical staleness predicate. A reader following the alert's deep link now sees the failure that
sent them there.

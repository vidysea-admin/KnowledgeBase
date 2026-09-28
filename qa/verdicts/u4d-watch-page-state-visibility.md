# Verdict — u4d-watch-page-state-visibility

**Cycle checked:** 0
**VERDICT: PASS**
**SCOREBOARD:** typecheck 10/10 workspaces (re-run on u4d alone AND on the trial-merged tree) ·
apps/api 217/217 (re-run on u4d alone, matches manifest) · apps/web 154/154 across 17 files incl.
19 WatchPage tests (re-run on the trial-merged tree, matches manifest) · packages/core alert-sink
7/7 (R2 branch, re-run on trial-merged tree) · depcruise clean on u4d alone (378 modules) and on
the trial-merged tree (380 modules, 0 violations both) · lint-dirsize/lint-loc/lint-root/lint-dupes/
lint-migrations/snapshot---check/tracker-audit all match the disclosed baseline exactly, re-run
independently on the trial-merged tree · lint-codex-hooks OK 6/6 · schema/validate.py: RED on u4d
alone (1 pre-existing `watch_heartbeat` fixture gap, confirmed not caused by this unit), GREEN
27/27 on the trial-merged tree (R2's fixtures land) · test:lint 107/112 on the trial-merged tree,
the same 5 pre-existing failures the manifest names, all attributable to my own trial-merge
methodology leaving files uncommitted (see Trial-merge section), not to the feature code.
**CAPABILITY-COVERAGE:** R4 (both source families, restated staleness, negative paths incl.
unreachable/none-configured) COVERED · R7 (plain language on every new state) COVERED · R8
(tenancy on the new route) COVERED, live HTTP two-tenant walk re-run and independently attacked ·
R2's staleness predicate reuse (no second definition, no re-derived interval) COVERED and verified
by direct code reading, not just the manifest's claim · R1's `failureReason` surfaced verbatim
COVERED, confirmed in a real browser render, not just a DOM assertion · R5/R6/R3 unaffected
(out of this unit's edit set, confirmed by diff).
**LIVE-BROWSER:** performed — a real Express server (fake, tenant-scoped deps, no Mongo) +
a real Vite dev server + a real Chromium session via Playwright, navigated to `/watch` with a
realistic mixed dataset. See "Live-browser walk" below. Zero console errors on the exercised path.
**ISSUES-WRITTEN:** none
**EXECUTOR:** u4d-watch-page-state-visibility's own maker/builder (worktree
`agent-a779f0b3b445697af`), commit `6a28088` (manifest close-out `2518795`). I am the checker —
fresh, independent context, `self != executor` — and did not write any of this unit's code.

---

## Scope re-read against authority

Read in full: this unit's manifest, D-046, D-047, D-048, D-053, D-054, D-051 (disambiguates
`D-050-SPEAKER` vs `D-050-CODEX` — not directly load-bearing here but read per instruction),
`qa/gates/iss-358-alert-and-page-disjoint.md`, `docs/features/u4-watch-dashboard/spec.md` R1-R8,
`.claude/CLAUDE.md`, `qa/loop.md`.

- **D-047's `Changes-authorized`** names exactly `docs/features/u4-watch-dashboard/spec.md` (R4
  wording + plan's unit list) and `plan.md`. I diffed both files against base `095585d` and the
  actual edits are exactly that: R4's paragraph amended to "both source families" with the ISS-358
  history, and one new `| U4d | ... |` row appended to plan.md's table. No other line changed in
  either file. The manifest's claim of pre-authorization is correct, not just asserted.
- **D-048/D-053/D-054's standing prohibition** (detector never moves out of `health.ts`) — verified
  directly by reading `apps/api/src/routes/health.ts` in full. `detectSilentWatchers` still lives
  there, still calls the same `isStale` logic (now via the extracted `heartbeatStatuses`, filtered
  to `stale`), and the `/health` route body and status-code logic are byte-identical to before
  except for the pre-existing `watchSilent` count that already existed under D-048. No new route
  was added to `health.ts` — the new `GET /watch-state` route is in `watched-sources.ts`, as
  claimed. `isStale`/`heartbeatStatuses`/`EXPECTED_WATCH_SOURCE_TYPES`/`HeartbeatStatus` are newly
  `export`ed but nothing about their internal behavior changed — this is confirmed both by reading
  the diff (pure `export` keyword additions plus one extraction that preserves the exact same
  per-type stale computation `detectSilentWatchers` used inline before) and by the pre-existing
  `health.test.ts` cases (R2 boundary test, the cross-implementation drift pin against
  `heartbeat.mjs`) passing unmodified in the 217/217 re-run.

## Tenancy — falsification attempts (R8, security class, never round-capped)

1. **Re-ran the live two-tenant HTTP walk** (`watched-sources.test.ts`, "U4d/R8: one tenant's
   watch-state read never returns another tenant's rows") as part of the 217/217 apps/api re-run,
   independently, on the unit's own branch. Green.
2. **Traced the tenant id's only path into the route**: `apps/api/src/routes/watched-sources.ts`'s
   `GET /watch-state` reads `req.auth!.tenantId` and nothing else — no query param, no body field,
   no header is consulted for tenant identity anywhere in this route or in `WatchPage.tsx`/
   `watch-state.ts` (the web client sends no tenant id at all; tenancy is 100% derived server-side
   from the bearer key via `apps/api/src/auth.ts`'s `requireAuth`, which populates `req.auth` only
   from `ApiKeyStore.verify()` — never from client input). There is no code path in this unit
   capable of accepting a client-asserted tenant id, so the ISS-078 shape (trusting a client-
   supplied id) does not exist here by construction, not just by test.
3. **Read `packages/db/src/lib/tenantScope.ts`** in full: `scopedCollection()` still exposes no
   `raw` escape hatch (ISS-065's removal stands), `find`/`findOne`/`updateOne`/`deleteMany`/
   `countDocuments` are all `withTenant`-merged, and a missing `tenantId` throws rather than
   silently scanning. `listWatchState` (`packages/db/src/collections/watch-state.ts:31`) and
   `listHeartbeats` (`packages/db/src/collections/watch-heartbeat.ts:30`) both go through this
   accessor with no bypass — confirmed by reading both files in full, not by trusting the manifest.
4. **Checked which test double the tenancy test actually uses**: `watched-sources.test.ts` defines
   its OWN `fakeWatchStateReadDeps(stateByTenant, heartbeatsByTenant, ...)`, keyed by a
   `Record<tenantId, T[]>` map that the fake genuinely branches on (`stateByTenant[tenantId] ?? []`)
   — this is NOT `fakeMeetingCandidatesDeps`, the double ISS-359 flagged as ignoring its `tenantId`
   argument. The manifest's claim here is correct.
5. **Re-ran the isolation live in a real browser**, not just jsdom/HTTP-fetch: stood up the real
   Express app (`createServer`) with fake tenant-partitioned deps on `127.0.0.1:3300` and the real
   Vite dev server on `127.0.0.1:5173`, then drove Chromium via Playwright to `/watch` with a
   `tenant-1` key. The rendered page showed exactly `tenant-1`'s one failed row
   (`drive: f1 — failed — "401: token expired"`) and its three heartbeat rows computed from
   `tenant-1`'s own data (drive alive/5m, gmail silent/3h, calendar silent/never) — see the
   Live-browser section below for the full transcript. I did not additionally re-drive a second
   tenant through the browser (the HTTP-level live two-key test already proves cross-tenant
   isolation at the only boundary that could leak — the route/deps layer — and the browser adds no
   new code path beyond `fetch`, which both layers already exercise identically).
6. **`_id` shape (two-part heartbeat vs three-part state)**: grepped every file this unit touches
   for `_id.split`/`_id.substring`/manual `_id` parsing. None exists. `heartbeatStatuses` keys by
   the row's own `sourceType` field, `WatchPage.tsx` keys its React lists by `sourceType` and by
   `${row.sourceType}:${row.sourceId}` (constructed from named fields, not derived from `_id`), and
   the web client's `WatchStateRow`/`WatchHeartbeatStatus` types never reference `_id` at all. The
   two different `_id` shapes across the two collections cannot affect this unit's logic because
   nothing in it reads `_id`'s internal structure.
7. **The `assert.equal(bBody.state.length, 0, ...)` vs `deepEqual(bBody.state, [])` swap
   (`watched-sources.test.ts:366`)**: for a real array, `length === 0` and `deepEqual([], [])` are
   equivalent — there is no way for a JS array to report `length: 0` while holding elements. The
   test additionally keeps `bBody.state.some((s) => s.failureReason === "tenant-a's own failure")`
   asserting `false` right after, which is redundant given `length === 0` but does not weaken
   anything. I judge the manifest's own worry (flagged honestly in its own evidence section) as
   unfounded in practice: the replacement is exactly as strong as the original, not weaker.

No tenancy or auth finding. This is the class D-014 says is never round-capped, and I looked hard
before writing "none" — per this project's own verdict rule, `ISSUES-WRITTEN: none` on a correct
implementation is a complete, creditable check, not a lapse.

## Authentication / the 501 path

- `apps/api/src/server.ts` mounts `createHealthRouter` BEFORE `requireAuth` (line 66-67) and
  `createWatchedSourcesRouter` (which now includes `GET /watch-state`) AFTER it (line 72) — read
  directly, not inferred. `/health` was not extended with any tenant-scoped detail: its only new
  field under D-048 is the aggregate `watchSilent` count, unchanged by this unit. `/watch-state`
  is genuinely behind both `requireAuth` and `requireScope("sources")`, re-confirmed by the 403
  test ("403s without the sources scope") passing in my own re-run.
- The 501 path is a real `res.status(501).json(...)` gated on
  `!deps.listWatchState || !deps.listHeartbeats || deps.heartbeatIntervalMs === undefined` — the
  `=== undefined` check (not a falsy check) deliberately allows a configured `heartbeatIntervalMs`
  of `0` to still count as "wired," which is correct and slightly more careful than a naive
  truthiness check would have been. A misconfigured deployment that wires only two of the three
  deps still gets a clean 501, never an empty 200 — I re-read this condition line by line looking
  for a gap (e.g. an `||` that should have been `&&`, a dep checked with the wrong name) and found
  none.

## Trial-merge against master and against the R2 branch (`worktree-agent-a7e885f3597d16f27`)

**Against current master (`b4b1dae`):** `git merge-tree --write-tree` is a clean, conflict-free
merge (tree `68707be`). No action needed on this side.

**Against the R2 branch (`u4b-r2-alert-interface`, tip `5e3a602`, currently under check elsewhere,
NOT merged):** `git merge-tree --write-tree worktree-agent-a779f0b3b445697af
worktree-agent-a7e885f3597d16f27` reports exactly **one textual conflict**, in
`apps/api/src/production.ts` — confirmed by `git diff --stat` that this is the ONLY file either
unit touches in common (u4d also touches `health.ts`/`watched-sources.ts`/web files/db/docs; R2
also touches `packages/core/src/alerts/*`/`packages/core/src/index.ts`/schema fixtures — zero other
overlap).

**Nature of the conflict — textual, not semantic.** Both units edit
`createMongoWatchSilenceDeps()`'s body:
- u4d extracts the inline `WATCH_HEARTBEAT_INTERVAL_MS` parsing into a new top-level
  `watchHeartbeatIntervalMs()` function (so `createMongoWatchStateReadDeps()` can reuse the exact
  same number), and rewrites `intervalMs: <inline expr>` to `intervalMs: watchHeartbeatIntervalMs()`.
- R2 leaves the inline interval parsing untouched and instead replaces the body of
  `notifyWatchSilent` from a `console.error` stub to `alertSink.notifyWatchSilent(...)`, where
  `alertSink = createTelegramAlertSink()` (a new import from `@lkb/core`).

Git's 3-way merge auto-resolved the `return { ... }` object literal correctly on its own (both
changes land on different keys of the same object, and the diff hunks didn't overlap there); the
only marked conflict is around the doc-comment block and the `const parsed = ...` /
`function watchHeartbeatIntervalMs()` region, where u4d deleted the inline computation and R2 kept
it while adding a new line right after it.

**I resolved it by hand in a throwaway copy** (not on either branch, not pushed) to verify what a
real merger must do: keep u4d's extracted `watchHeartbeatIntervalMs()` function (needed by
`createMongoWatchStateReadDeps`), keep R2's `const alertSink = createTelegramAlertSink();` and its
use inside `notifyWatchSilent`, and merge the two doc comments (both are accurate and
non-contradictory — one explains the real alert transport, the other explains the single interval
source). The merged `createMongoWatchSilenceDeps()` ends up as:

```ts
function watchHeartbeatIntervalMs(): number { /* u4d's extraction, unchanged */ }

export function createMongoWatchSilenceDeps(): WatchSilenceDeps {
  const tenantIds = (...).split(",")...;
  const alertSink = createTelegramAlertSink();           // R2
  return {
    tenantIds,
    intervalMs: watchHeartbeatIntervalMs(),              // u4d
    listHeartbeats: (tenantId) => listHeartbeats(tenantId),
    notifyWatchSilent: (...) => alertSink.notifyWatchSilent(...),   // R2
  };
}
```

**Semantically these two changes are fully compatible, not contradictory.** `watchHeartbeatIntervalMs()`
computes byte-for-byte the same formula R2's inline `Number.isFinite(parsed) && parsed > 0 ? parsed
: 3600000` did — I diffed the two expressions directly. So after merging, the single-interval-source
guarantee D-048/D-047 require (writer, detector, and now the page must all agree on one number)
still holds, AND R2's real Telegram delivery still fires — neither unit's core guarantee is weakened
by the other's presence. There is no scenario where the merged code silently regresses either R2's
alert delivery or u4d's interval-sharing invariant.

**I verified this is not just a plausible-looking merge but a WORKING one**: I materialized the
resolved tree into a throwaway git worktree (fresh `pnpm install`, reusing the local pnpm store —
no package.json changed on either branch, confirmed by `git diff --stat` on both), and re-ran the
full verification suite against it:

- `pnpm -r typecheck` — **10/10 clean** (this is the one that would have caught a real semantic
  mismatch, e.g. if `WatchSilenceDeps`'s shape had diverged — it didn't).
- `apps/api` suite — **217/217**, including all 4 new U4d tests and R2's alert-sink wiring path.
- `apps/web` suite — **154/154** across 17 files.
- `packages/core` alert-sink suite (R2's own) — **7/7**.
- `depcruise` — **clean, 380 modules, 0 violations** (u4d's `watched-sources.ts -> health.ts`
  import and R2's `production.ts -> @lkb/core` import coexist with no new forbidden edge).
- `python schema/validate.py` — **27/27 GREEN**, including `watch_heartbeat` (R2's fixtures land
  on the merged tree and close the one gap u4d's own branch correctly reported as red and
  out-of-scope).
- `lint-dirsize`/`lint-loc`/`lint-root`/`lint-dupes`/`lint-migrations`/`lint-codex-hooks`/
  `snapshot --check`/`tracker-audit --gate g1,g4` — every one matches the disclosed baseline
  exactly on the merged tree; tracker-audit's 6 findings (not 5) are the same pre-existing bare
  `ISS-001`/`ISS-002` references neither unit touches.
- `npm run test:lint` — 107/112, same 5 failures as the manifest's own disclosed set
  (`catalogue-cli.test.mjs`'s "clean tree" family + `snapshot.test.mjs`'s staleness check). On
  investigation these 5 failures are an artifact of MY OWN trial-merge process leaving
  `packages/core/src/alerts/alert-sink.{ts,test.ts}` untracked and `production.ts`/
  `packages/core/src/index.ts` modified-but-uncommitted in the throwaway worktree — i.e. exactly
  the same "REFUSED: ... not what the repository holds" mechanism the manifest's own dirty-worktree
  note describes for its own mid-unit state. Once either branch is actually committed/merged for
  real (as the maker would do), this resolves — I did not charge it to either unit.

**Conclusion on the collision:** real, but shallow and fully reconcilable — one file, one function,
two non-overlapping sub-changes that a merger resolves in under two minutes with no semantic
judgment call beyond "keep both." I did not push or merge anything; this is reported for whichever
of the two units merges second (or for a human/maker doing an explicit merge commit) to apply
verbatim. The R2 branch's own checker (separate, in progress) should be told the same thing from
its side.

## Live-browser walk (jsdom vs real browser — this unit's own named gap)

The manifest disclosed no real-browser walk was performed, only React Testing Library/jsdom
component tests, and explicitly recommended a Mode-D pass if required before shipping. Per the
brief, I judged this a "not not-applicable" case (a user-facing page) and performed one rather than
only ruling on the question in the abstract.

**Setup:** a throwaway, untracked script (`apps/api/_checker-live-browser-server.mjs`, deleted
before I finished — `git status --porcelain` on the worktree is clean, confirmed both before and
after) started the REAL `createServer()` Express app on `127.0.0.1:3300` with fake, tenant-scoped
deps — no Mongo touched — seeded with a realistic mixed `tenant-1` dataset: one failed
`watch_state` row (`drive:f1`, `"401: token expired"`), and heartbeats where drive is fresh (5m
old), gmail is stale (3h old, past the 1h interval), and calendar has no row at all (must render as
"has never completed a single polling run"). Separately started the real `vite` dev server for
`apps/web` on `127.0.0.1:5173` (unmodified `apps/web/vite.config.ts`). Used Playwright to open a
real Chromium page, set `localStorage.lkbApiKey` to the fake key, and navigated to `/watch`.

**Result — real DOM, real network round-trip, zero console errors:**
- "Watcher liveness" section rendered all three source types correctly: `drive` badge "alive",
  "Last completed run ... (5m ago)", "Completed a run within its expected interval. No action
  needed."; `gmail` badge "silent", "(3h ago)", the stale plain-language sentence; `calendar` badge
  "silent", **"Has never completed a single polling run"** (the D-048 "absence is maximally stale"
  rule, rendered correctly for a source type with zero heartbeat rows, not just asserted in a unit
  test).
- The failed `watch_state` row rendered as `drive: f1` / `failed` / the real timestamp /
  **`401: token expired`** verbatim — exactly the three fields R1's alert would have named, visible
  on the page a reader following that alert's deep link would land on. This is the concrete,
  browser-rendered answer to "does the alert's deep link now land on a page that can show its
  subject" — yes, confirmed visually, not just by code reading.
- "Watched sources" (the pre-existing U4c section) correctly showed "No watched sources are
  configured yet" for the empty fixture, unaffected by the new section next to it.
- The "Next up" lane's independent-failure-isolation guarantee got an unplanned but genuine live
  exercise: my first fixture's key was missing the `gmail` scope `GET /meeting-candidates`
  requires, which produced two real 403s and two real browser console errors — and the page
  correctly rendered "Upcoming auto-records are unavailable right now (this key is missing the
  required "gmail" scope). Watched-source status above is unaffected." with the Watcher-liveness
  section fully intact above it. This is exactly the "a failure here must not blank the lane above
  it" rule from `WatchPage.tsx`'s own comment, proven live rather than only in jsdom. After fixing
  my fixture's scopes, a second navigation to `/watch` showed **0 console errors, 2 warnings**
  (the pre-existing React Router v7 future-flag warnings every other page in this app also emits —
  unrelated to this unit).

**My judgment:** jsdom/RTL component coverage plus the real HTTP-level route tests (real Express
server, real `fetch`, real tenant walk) already gave strong assurance; the live-browser pass adds
confirmation that React's real render output, real CSS-independent DOM structure, and real
network stack agree with what the component tests assert, and that no console error fires on the
new section under a realistic mixed-state dataset. Given this is an additive, read-only display
section on a page that already had its own Mode-D walk under U4c, and introduces no new
interactive control, I do not treat the manifest's own gap disclosure as something that would have
blocked a PASS even before I ran this — but I ran it anyway rather than taking that judgment call
on faith, and it confirms the feature works exactly as claimed with no surprises.

## Baseline violations — none newly charged to this unit

Re-confirmed on the unit's own branch AND on the trial-merged tree: the 5 `lint-loc` violators, the
`lint-dirsize` `apps/api/src: 32/31` (confirmed no new file added there — `git status --porcelain`
on the unit's branch shows only `apps/web/src/api/watch-state.ts` untracked, outside that budget's
directory), `lint-root` 17/15, stale `docs/SNAPSHOT.md`, and the tracker-audit's 6 (not 5)
`ISS-001`/`ISS-002` ambiguous-ref findings (none cite this unit's files) all match the disclosed
baseline exactly and are not this unit's to fix.

## What the maker must carry forward

1. **The `production.ts` collision with `u4b-r2-alert-interface` is real but small.** Whichever
   unit merges second must hand-resolve one file: keep u4d's `watchHeartbeatIntervalMs()`
   extraction AND R2's `alertSink = createTelegramAlertSink()` wiring — see the exact resolved
   snippet above. No other file conflicts. I verified the resolved tree fully typechecks and all
   suites (apps/api 217/217, apps/web 154/154, packages/core 7/7, depcruise, schema/validate.py
   27/27) pass together.
2. **`schema/validate.py`'s `watch_heartbeat` red is expected to clear automatically** once R2 (or
   any unit carrying its fixtures) lands — do not open a separate unit to "fix" it from u4d's side.
3. No tenancy, auth, or `_id`-shape defect found after deliberately attacking all three. No new
   issue filed.

# Verdict — u4b-watch-heartbeat-alert

**Cycle checked:** 0

VERDICT: PASS

## Ruling on the four-file blocker (the question this check turns on)

**Real, not a rationalization.** Independently verified against the codebase, not just the
manifest's citations:

- `ARCHITECTURE.md` lines 66-100 (§4 directory map) state, unambiguously: `schema/` is "SOURCE OF
  TRUTH" for a collection's shape; `packages/core/src/generated/<collection>.ts` is "GENERATED,
  never edited"; `packages/db/src/collections/<coll>.ts` is where `coll(tenantId).find()` lives,
  "tenant-less query = a type error"; `migrations/` is "the ONLY place shape/index changes."
- `packages/db/src/lib/tenantScope.ts` confirms the type-error claim mechanically:
  `scopedCollection(db, name)` returns a `coll(tenantId)` accessor whose signature forces the
  tenant argument at every call site — there is no generic/raw escape hatch (`raw` was removed per
  ISS-065, cited in the file's own header comment).
- I listed all four directories myself: every existing collection (`watch_state`, `watch_reports`,
  `watched_sources`, etc.) has all four artifacts — a `schema/*.schema.json`, a generated
  `packages/core/src/generated/*.ts`, a `packages/db/src/collections/*.ts` accessor, and a
  `migrations/*.cjs` entry. `migrations/20260925090000-source-watcher.cjs` (read in full) is
  exactly the precedent cited: it created `watch_state` + `watch_reports` together via
  `createCollection` + `schema/index.json`'s index specs, the identical shape the manifest proposes
  for `watch_heartbeat`.
- D-046 point 3, read in full in `docs/DECISIONS.md`, authorizes **exactly three files, all
  U4c's**, and closes with "No other new file is authorized." None of the four collection files a
  `watch_heartbeat` collection needs is among them.
- The three rejected workarounds are correctly rejected: a local JSON file would silently reverse
  D-046 point 4's own choice of Mongo; reusing `watch_reports` runs into D-046's own stated reason
  for rejecting a `watch_state` field (a prunable per-poll-history collection must not be where the
  silent-failure detector's liveness signal lives); and hand-rolling raw `db.collection()` calls
  would ship R8's tenant-scoping guarantee with none of the machinery (`scopedCollection`) that
  makes it checkable — the exact ISS-078 hazard class D-014 exists because of.

Stopping and raising a HUMAN_GATE was the correct call here, not a shortcut dressed up as
discipline. I would have failed this unit if I'd found a working accessor already in place, or if
the four files could plausibly fit inside the authorized three — neither is true.

## SCOREBOARD

| Claim | Checked | Result |
|---|---|---|
| `isHeartbeatStale` boundary: exact-interval = fresh, one ms past = stale | Ran my own independent `node -e` dynamic import (not the maker's script) | CONFIRMED. `now-last===intervalMs` → `false`; `now-last===intervalMs+1` → `true`. |
| null / undefined / unparsable input → always stale, no grace period | Same script, plus adversarial cases the manifest did not test | CONFIRMED, and safe under extra probing: `intervalMs: -1000` and `intervalMs: 0` both still resolve to `true` (stale) for any real elapsed time; a malformed date string (`"not-a-date"`) also resolves to `true`. No input drives it to a false "fresh." |
| `findStaleHeartbeats` over multiple sources flags only the stale ones | Same script, 3-row fixture (fresh/1ms-past/never) | CONFIRMED. Returns exactly the 1ms-past and never-heartbeat rows, excludes the fresh one. |
| 2-hour interval is genuinely unspecified, correctly labeled `[ASSUMPTION]` | `grep -in interval` across spec.md, plan.md, and D-046's full text | CONFIRMED. No numeric interval value appears anywhere in any of the three; "a configured interval" is the only language used. |
| `watchHeartbeatId`'s two-part `tenantId:sourceType` key vs `watch_state`'s three-part key | Read D-046 point 4 ("one row per (tenant, source)") against `watch-state.ts`'s `watchStateId` | DEFENSIBLE. D-046's own wording names the granularity; a heartbeat is about whether a polling *phase* ran, which has no natural per-item id. |
| `notifyWatchSilent` reuses U4a's exact notifier idiom (throttle, `fireAndForget`, `formatDuration`) | Read the diff against `notifyPollFailed`/`notifyUpcomingRecording`; ran `formatDuration(7200000/1000)` by hand | CONFIRMED. Same shape; `120m` is correct (7200s / 60 = 120, remainder 0). |
| R8 tenancy — throttle keys and row shape cannot leak/collide across tenants | Read `watchSilent:${tenantId}:${sourceType}` key construction and `buildHeartbeatDoc`'s proposed `_id` | NOT VIOLATED. Nothing writes to Mongo yet in this unit, so there is no live tenancy surface to breach; the *proposed* row/id/throttle-key shapes are all tenant-prefixed and there is no path in this diff that reads or writes any collection at all. R8 stays correctly unmet-not-broken. |
| Diff scope: only the 3 claimed files touched, nothing removed | `git diff 7b4ce6f...HEAD --stat` and full diff | CONFIRMED. Exactly `telegram-alerts.ts` (+13/-0 net across the interface+impl), `telegram-alerts.test.ts` (+50/-6), `run-watch.mjs` (+56/-0), plus the manifest itself. No existing function, export, or test deleted. |
| No schema/migration/db-accessor file created | `git status --short`; `node scripts/lint-dupes.mjs` (26 schema `$id`s, unchanged); `node scripts/lint-migrations.mjs` (re-run myself: see note below) | CONFIRMED — no new schema/migration/accessor file exists in the diff. |

**R2 itself: 0/1 — genuinely unmet, and the manifest says so plainly rather than claiming
otherwise.** The heartbeat is not written anywhere and nothing reads one; that is the disclosed,
correct state of this cycle, not a hidden gap I found. **Everything that COULD be built without the
missing collection — the staleness/boundary decision logic, the multi-source filter, the alert
surface and its tests — is built correctly and is independently reproducible**, which is what the
PASS is actually certifying.

## Note on `lint-migrations`

My own re-run reported **1368 files scanned**, one more than the manifest's claimed 1367. `git
status --short` is clean (nothing untracked, nothing uncommitted) in this worktree, so the
discrepancy is not this unit's diff — the script scans the entire repo tree by walk-count, and a
one-file drift in a whole-repo file count between two separate runs, in an otherwise-clean tree, is
environmental noise (e.g. a build/cache artifact outside git), not a finding. **Violation count
(what the check actually gates on) was 0 in both runs** — no migration-pattern file was added
outside `migrations/`, which is the claim that matters.

## FAILURES (if any)

None that block PASS.

## CAPABILITY-COVERAGE

6/6 rows in the manifest's table independently re-derived and hold. Of those, **rows 1, 2, 3, and 5
are backed only by an ad hoc, uncommitted `node -e` script** — there is no committed test file a
future regression would trip. I did not simply re-run the maker's paste; I wrote my own separate
verification script with additional adversarial inputs (negative/zero interval, malformed date) not
in the manifest's own list, and got matching, safe results throughout. This is real coverage today
with no safety net for tomorrow — the same gap class as `u4a`'s `ISS-357`, on the same file, for the
same disclosed reason (D-046's new-file grant does not extend to a `run-watch.test.mjs`). Filed as
**ISS-360** (medium), not blocking, per the ISS-357 precedent this repo already accepted for cycle
0. Rows 4 and 6 are backed by committed, re-run-by-me tests (`telegram-alerts.test.ts` 31/31;
`lint-dupes`/`lint-migrations` counts) and need no further note.

## LIVE-BROWSER

not-applicable (no UI surface touched — confirmed via `git diff --stat`: no file under `apps/web`
in the diff; plan.md's own U4b row says "skip (no screen)").

## ISSUES-WRITTEN

ISS-360, ISS-361

- **ISS-360** (medium) — the 5 new pure functions in `run-watch.mjs` have no committed regression
  test; see CAPABILITY-COVERAGE above.
- **ISS-361** (low, analysis) — per the dispatch brief's specific ask about ISS-358: once U4b's
  `watch_heartbeat` collection is authorized and wired, R2's alert would fire off a **third**
  collection that U4c's already-shipped `/watch` page (which reads only `watched_sources` +
  `meeting-candidates`, per ISS-358) still would not surface. Not a defect in this unit's diff — the
  collection does not exist yet — but worth tracking now so whoever answers U4b's HUMAN_GATE also
  decides whether `/watch` needs a follow-up to show heartbeat staleness, rather than resolving
  ISS-358 and this gate as two unrelated round-trips. IDs 360/361 were chosen instead of the
  otherwise-next 358/359 in this worktree's stale ledger, because `git show master:qa/issues.jsonl`
  shows master already allocated ISS-358/359 to `u4c-watch-page`'s checker after this branch
  diverged — using 358/359 here would collide on merge.

## EXECUTOR

Checker (fresh context, read-only toward the artifact), verifying `f4d90c3` in
`D:\KnowledgeBase\.claude\worktrees\agent-ade446ac412280463` (branch
`worktree-agent-ade446ac412280463`) against `docs/features/u4-watch-dashboard/spec.md` (R2),
`plan.md` (U4b row), `docs/DECISIONS.md` D-046, `ARCHITECTURE.md`, and
`migrations/20260925090000-source-watcher.cjs`.

## EXPLANATION

Every command the manifest claims was re-run independently, not trusted:
`telegram-alerts.test.ts` gave **31/31** (matches); the full meeting-bot suite gave **272/272**
across **two separate consecutive runs** (no flake either time — a stronger determinism claim than
the manifest itself made, and stronger than U4a's checker was able to get on the same suite);
`tsc --noEmit` was clean; `scripts/watch/lib/*.test.mjs` gave **45/45**; `lint-loc` reproduced the
**identical 4 pre-existing violations**, `run-watch.mjs` at exactly **572** lines as claimed;
`lint-dupes` held **26** schema `$id`s unchanged; `lint-migrations` violation count held at **0**
(file-count total off by one from the manifest's claim, judged environmental noise, not a finding —
see note above). The five new pure functions were re-derived with my own independently-written
script rather than the maker's pasted one, including boundary and null/malformed-input cases the
manifest already covered plus three it did not, and every result matched the manifest's claims.
**R2 remains unmet pending the HUMAN_GATE** — no reader should take this PASS as "the silent-failure
detector works"; it certifies that the maker correctly identified a real authorization boundary,
stopped at it rather than contorting around it, and that everything it built up to that boundary is
correct, tested (or honestly disclosed as untested), and scoped to exactly the 3 files it claimed.

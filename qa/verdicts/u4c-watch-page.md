# Verdict — u4c-watch-page

**Cycle checked:** 0

VERDICT: PASS

## SCOREBOARD

| Claim | Checked | Result |
|---|---|---|
| [R4] No persisted failure state exists on `watched_sources`; a scheduled/external run's failure is invisible, only a manual "poll now" failure shows | Yes — read `packages/ingest/src/watched/run.ts` (catch branch never calls `recordFetch`), `packages/db/src/collections/watched-sources.ts`'s `recordFetch` (only ever `$set`s `lastFetch`), `schema/watched_sources.schema.json`'s `lastFetch` shape (`fetchedAt`/`hash`/`diffFrom` only — no status/failure field at all) | CONFIRMED CORRECT, and the gap is deeper than the manifest states: even `additionalProperties: true` aside, nothing in the codebase would ever write a failure field even if the schema had one — a failed scheduled run leaves **zero** durable trace, not a partial one. Separately confirmed there is **no automated scheduler at all** for `watched_sources` (`packages/ingest/src/watched/schedule.ts`'s own comment: "a future scheduler runs `listActive`"; the only caller of `runWatchedSources` anywhere in the repo is the `POST /watched-sources/run` route, itself only called by this page's "Poll now" button) — so today "stale" is an honest signal (nothing auto-checks), not a false one. |
| [R1↔R4 cross-check, the thing that matters most] Does R1's alert read a store R4's page can show? | Yes — u4a-watch-failure-alerts landed on master **during this review** (commit `7b4ce6f`, verdict `a91fe90`, ISS-356/357 filed). Traced the real, now-shipped code: `scripts/watch/run-watch.mjs:297-305` reads the prior **`watch_state`** row (`findWatchState(TENANT,"drive",file.id)`) and calls `telegram.notifyPollFailed(...)` from inside the `--ingest` Drive-download catch block. `WatchPage.tsx` calls only `listWatchedSources`/`runWatchedSources` (**`watched_sources`**) and `listMeetingCandidates` — zero references to `watch_state` or the upcoming `watch_heartbeat` (U4b) anywhere in the diff. | **NOT the same store, and not two names for one thing — genuinely disjoint collections monitoring disjoint systems.** `watch_state` is U2's Drive/Gmail/Calendar ingestion-watcher record; `watched_sources` is T-027/A13's bookmarked-URL record. `grep`-confirmed zero file overlap between the two. **This means R1's alert (and R2/U4b's heartbeat alert, once it lands) fires on the exact incident class this whole feature exists for (Ashoka — a Drive/Gmail watcher going silent), and R4's page has no code path to show even one bit of that state.** Filed **ISS-358 (high)** — see ruling below. |
| [R5] "Next up" shows real `GET /meeting-candidates` rows (`approved`/`auto_approved`) with status-as-reason, not a fabricated richer selection reason | Yes — read `WatchPage.tsx`'s `nextUp` filter and `CANDIDATE_REASON` map, `apps/api/src/routes/meeting-candidates.ts`, and the manifest's citation of `selectAutoRecordItems` (`auto-join.ts`)/`schedule-tick.ts`/`schedule-state.json` as the real (unserved) selection engine | CONFIRMED CORRECT and CONFIRMED HONEST — the data is real (`GET /meeting-candidates`, the same route `CalendarPage` already uses), the reason string is the row's real `status`, and nothing richer is invented. **Ruling: R5 partially satisfied** — the letter (show what's coming + a reason) ships; the spirit ("why it was selected", i.e. the trust/dedup logic) is not exposed because no `apps/api` route serves it, which is correctly outside this unit's D-046 grant. Not FAIL-worthy for the same reason ISS-356 wasn't for U4a: a plan-level premise the maker caught and disclosed rather than worked around. |
| [R8] Tenancy — real server-side enforcement, not "matches siblings" | Yes — read `apps/api/src/auth.ts` (`requireAuth`/`requireScope`, tenantId comes only from `store.verify(key)`), `packages/db/src/lib/tenantScope.ts` (`scopedCollection` merges `{tenantId}` into every Mongo filter; a tenant-less call is a **TS compile error**, `raw` escape hatch removed per ISS-065), `apps/api/src/routes/watched-sources.ts` (both routes use `req.auth!.tenantId`, never body/query), and `watched-sources.test.ts:124,205` (existing cross-tenant isolation tests, re-read and confirmed present and passing) | CONFIRMED CORRECT. Also **independently proved live** (see Mode D below) with two real tenant API keys against a real fixture-backed server — tenant-2 correctly saw zero of tenant-1's `watched_sources` rows. **Bonus finding (not this unit's fault):** the *same* live walk showed tenant-2's key incorrectly seeing tenant-1's `meeting-candidates` rows — traced to `apps/api/src/fixtures.ts`'s `fakeMeetingCandidatesDeps` test double, which ignores its `tenantId` argument. **Confirmed the real production path (`packages/db/src/collections/meeting-candidates.ts`'s `listAll`, via `scopedCollection`) IS correctly scoped** — this is a test-double/coverage gap only, not a live vulnerability, and `fixtures.ts`/`meeting-candidates.test.ts` are both outside u4c's diff. Filed **ISS-359 (medium, tenancy-adjacent, not round-capped)**. |
| The `App.tsx`/`NavSidebar.tsx` authorization deviation | Yes — read D-046's item 3 ("`App.tsx` is edited in place for the route and nav entry") and plan.md's U4c row ("`apps/web/src/App.tsx` (one route + nav entry)") against the actual diff (`App.tsx` +2/-0 for the route only; `NavSidebar.tsx` +2/-1 for the nav row, reusing the already-exported-but-unused `GapIcon`) | **Ruling: within the grant's evident intent, not an unauthorized file edit.** D-046/plan.md both describe "route + nav entry" as one motion in `App.tsx` — that is simply not where this codebase's nav lives (`NAV_ITEMS` is `NavSidebar.tsx`'s own array); the drafters approximated the file structure, they did not intend to block nav reachability. R4 explicitly requires "reachable from the nav", an approved requirement the maker could not satisfy any other way. The edit is 2 lines, disclosed prominently in the manifest, reuses an existing icon, touches nothing else in the file. Judged on the rule (evident intent, minimal, disclosed), not on size, per the brief. |
| Negative paths — all four | Yes — re-ran `WatchPage.test.tsx` myself (14/14) and read every assertion: API unreachable → `watch-unreachable` renders, `watch-none-configured`/`watch-row` do NOT (mutually exclusive JSX branches on `loadError`, confirmed by reading the component, not just the test); zero sources → `watch-none-configured` with distinguishing text, no row; poll-now failure → `poll-now-error` + button re-enabled (via a held-then-rejected promise, not immediate resolution); never-polled → own testid/text, no crash. **Also proved 3 of 4 live** (see Mode D) — the unreachable path I verified by code+test reading rather than killing the live server mid-session, to avoid leaving background processes in a bad state; noted honestly rather than claimed as live-proven. | CONFIRMED — every negative-path test asserts a genuine state change (attribute/text after a real promise resolution/rejection), never mere rendering. |
| `.tsx` escapes `lint:structure`'s `loc` check entirely | Yes — read `structure.config.json`: `"loc": {"extensions": [".ts", ".py", ".mjs"], ...}` | CONFIRMED. `.tsx` is genuinely not in the list. `WatchPage.tsx` (196 lines) and `WatchPage.test.tsx` (243 lines) are never scanned by `lint-loc.mjs`. This is a real, repo-wide coverage gap (every `.tsx` page in `apps/web` is unchecked), not specific to this unit, and not fixed by this unit (correctly out of scope) — noted, not filed as a new issue since it is a pre-existing, repo-wide condition rather than something this unit introduced or could fix within its grant. |
| `lint:structure` is not green, and none of the failures belong to this unit | Yes — ran every step myself from the worktree root | CONFIRMED, see Commands Re-Run below. |
| Claimed test/type results | Yes — ran all myself | CONFIRMED, see Commands Re-Run below. |

## THE THING THAT MATTERS MOST — ruling on R4

**R4 ("is the watching alive") is satisfied for the literal collection it was written and approved against (`watched_sources`/T-027, per R6's explicit route citation), and unmet for the incident class that motivated the entire feature.** Two independent, compounding reasons:

1. Within `watched_sources` itself, a scheduled/automatic run's failure is genuinely invisible (maker's own disclosed gap, confirmed true and slightly worse than stated — see scoreboard). Low practical severity **today** only because nothing yet runs `watched_sources` checks automatically; this becomes a live gap the moment any scheduler is added to A13.
2. **The much larger gap, newly found by this review, cross-checking against the just-landed U4a sibling:** the alert this feature exists to ship (R1, now real) and the heartbeat alert still being built (R2/U4b) both key off **`watch_state`**/the forthcoming `watch_heartbeat` — the U2 Drive/Gmail/Calendar watcher, i.e. exactly the kind of watcher that died silently on 2026-09-27 (Ashoka). R4's page has **no code path to either collection**. So once U4a/U4b are fully wired, a real Ashoka-class alert will fire correctly, and the page it names as the place to land afterwards will have nothing to say about it — the page can only speak to a completely different, currently-unscheduled URL-bookmark feature.

**This is not a defect in u4c's build.** The maker built exactly what R4-R8 and D-046 authorized, well, honestly, and with good test discipline; closing gap 2 needs a new `apps/api` endpoint over `watch_heartbeat`/`watch_state` and is outside every current file grant (D-046 names exactly three new files, none of which is this). It is a spec/plan-level premise — spec.md's own intro frames the incident using `watch_state`'s vocabulary and then R4 is written as if it is the same "watched source" concept R6 cites — that was never reconciled across the three approved units, and it is exactly the kind of seam a per-unit checker looking at only one side would miss. Filed **ISS-358 (high)**, with a recommended HUMAN_GATE for Umesh (extend scope with a U4d panel once `watch_heartbeat` exists, or explicitly re-scope R4's framing so nobody mistakes this page for incident-class coverage it does not have).

**Verdict impact:** does not fail this unit. u4c cannot fix ISS-358 within its authorized scope, disclosed the piece it could see (the within-`watched_sources` half), and built a solid, well-tested, honest page against its actual, approved contract. The gap is real and consequential for the feature as a whole, not for this unit's own completeness against what it was asked to build.

## LIVE-BROWSER (Mode D)

Performed, not simulated. Built a standalone fixture-backed Express server (`buildTestDeps()` + the repo's own `fakeWatchedSourceDeps`/`fakeMeetingCandidatesDeps`/`fakeKeyStore` from `apps/api/src/fixtures.ts` — no Mongo, no production data, no `production.ts`) seeded with real-shaped healthy/stale/never-polled `watched_sources` rows and `approved`/`auto_approved`/`pending` `meeting_candidates` rows for two distinct tenants, ran it on `127.0.0.1:3300`, ran the real `apps/web` Vite dev server on `:5173` against it, and drove a real Playwright browser:

- **`vidysea-staff` persona (nav → `/watch`):** clicked the real "Watch" nav link (state change: URL → `/watch`, active nav item, no new console errors). Page rendered healthy/stale/never rows with real absolute+relative timestamps and real plain-language sentences, matching the test suite exactly.
- **R6 "Poll now":** clicked the real button; state changed to a real "Last manual poll: 0 checked, 0 changed…" summary sourced from the fake `run()`'s real (not fabricated) response, button returned to enabled — full round trip through the real Express route, not a mock.
- **R8 tenancy, live:** switched to a second tenant's real API key and reloaded `/watch` directly (`umesh-operator`-style deep entry) — correctly got "No watched sources are configured yet" with **zero leakage** of the first tenant's rows (genuine server-round-tripped proof, not a call-argument assertion). This same walk is what surfaced ISS-359 (the *meeting-candidates* fixture's tenancy bug — `watched_sources` itself was clean).
- **Console errors:** 0 new console errors attributable to `/watch` across all three loads (a pre-existing 6-error baseline exists on the Dashboard route from other pages' fixture gaps — unrelated to this unit, not investigated further as out of scope).
- **R7 (plain language, `vidysea-staff` judgment):** the stale/never sentences ("the watcher may have stopped for this source… try Poll now… credentials or reachability likely need attention" / "Try 'Poll now'; if it keeps failing, the URL or its access may be wrong") are readable and actionable without pipeline knowledge — pass, for the states this page can show (see the R4 ruling above for what it cannot show).
- **Negative paths:** zero-configured and cross-tenant-isolation were proven live; API-unreachable was verified by code+test reading only (see scoreboard) rather than by killing the live server mid-walk, to avoid leaving background processes in an inconsistent state during a review already running concurrently with other agents' work on this repo. Stated plainly rather than claimed as fully live.
- Cleaned up: stopped both servers, deleted the scratch server script, confirmed `git status --short` clean in the worktree afterward.

`LIVE-BROWSER: performed (partial — 3 of 4 negative paths + both required interactions proven live; unreachable-API path verified by code+test only)`

## FAILURES (if any)

None that block PASS for this unit's own scope. See ISS-358 (high, cross-unit, not this unit's to fix) and ISS-359 (medium, pre-existing, not in this unit's diff).

## CAPABILITY-COVERAGE

R4: covered for `watched_sources`; unmet for the Drive/Gmail/Calendar watcher class the feature exists for (ISS-358). R5: partially covered, honestly disclosed. R6: fully covered, proven live. R7: covered for the states the page shows. R8: fully covered, proven live (with a sibling-fixture gap filed separately, ISS-359). All four required negative paths: covered (3 live, 1 by code+test).

## ISSUES-WRITTEN

ISS-358 (high), ISS-359 (medium) — both filed to `qa/issues.jsonl`, ids allocated sequentially after the prior max of 357 across the union of `qa/issues.jsonl` + `qa/issues.*.jsonl`, re-verified immediately before appending to guard against the concurrent activity on this repo during this review (u4a-watch-failure-alerts, ISS-356/357, and a U4b build landed mid-session).

## EXECUTOR

Checker (fresh context, read-only toward the artifact — did not build this unit). Verified `89887e6`/`c1cb249` in `D:\KnowledgeBase\.claude\worktrees\agent-a7bfb796d6769286b` (branch `worktree-agent-a7bfb796d6769286b`) against `docs/features/u4-watch-dashboard/spec.md` (R4-R8), `plan.md`'s U4c row, `qa/gates/plan-approved-u4-watch-dashboard.md`, `docs/DECISIONS.md` D-046, and — once it landed mid-review — `u4a-watch-failure-alerts`'s real shipped code and verdict (`a91fe90`) for the R1↔R4 cross-check the brief required.

## EXPLANATION

Re-ran everything myself; nothing accepted on the manifest's word.

### Commands re-run, real output

```
$ pnpm exec vitest run src/pages/WatchPage.test.tsx   (apps/web, in worktree)
 Test Files  1 passed (1)
      Tests  14 passed (14)

$ pnpm exec vitest run   (apps/web, full suite)
 Test Files  17 passed (17)
      Tests  148 passed (148)

$ pnpm exec tsc -b --noEmit   (apps/web)
(clean, no output)

$ node scripts/lint-loc.mjs   (worktree root)
lint-loc: FAIL — 4 violation(s)
  packages/index/src/pipeline/speakers-llm.ts:313 (budget 300)
  packages/meeting-bot/py/sb_join.py:437 (budget 300)
  packages/meeting-bot/src/capture/obs-windows.ts:359 (budget 300)
  scripts/watch/run-watch.mjs:447 (budget 300)
```
Exact match to the manifest's claim — same 4 files, none touched by this unit's diff (`git diff --stat` confirms only `apps/web/*` and `qa/manifests/*` changed).

```
$ node scripts/lint-root.mjs        → FAIL — 16 loose root files vs budget 15 (pre-existing; none of the 16 named files are apps/web files)
$ node scripts/lint-dirsize.mjs     → OK (88 dir(s) within budget)
$ node scripts/lint-dupes.mjs       → OK (453 unique export(s), 26 unique schema $id(s))
$ node scripts/lint-migrations.mjs  → OK (1367 file(s) scanned)
$ node scripts/snapshot.mjs --check → FAIL — stale, entirely docs/features + qa/briefs dir-tree entries from the master fast-forward, none from this unit
$ node scripts/tracker-audit.mjs --gate g1,g4 → 5 findings, all in t-031-audio-watchdog.md / t-033-bot-tests.md / u3-notify-channels.md / t-047-controller.md — none are files this unit touched
$ pnpm exec depcruise --config .dependency-cruiser.cjs packages apps workers
✔ no dependency violations found (373 modules, 1170 dependencies cruised)
```
All match the manifest's claims exactly. Confirmed independently that none of `lint:structure`'s failures are caused by, or touch, any file this unit created or edited.

### The mid-review landing of u4a-watch-failure-alerts

While this review was in progress, `u4a-watch-failure-alerts` (a sibling unit, built and checked by a different, concurrently-running agent) merged to master (commit `7b4ce6f`, checker verdict `a91fe90`, PASS, ISS-356/357 filed). This let me verify the R1↔R4 cross-check the brief asked for against the **real shipped code** rather than only the plan-level description — the finding (ISS-358) is stronger for it: it is not a hypothetical "if U4a lands this way" but a confirmed "U4a landed exactly this way, and here is the gap." I re-checked `qa/issues.jsonl`'s max id immediately before appending my own two issues, since the ledger was being actively written to by other agents during this session.

### Net judgement

A solid, honestly-built, well-tested unit against its actual, narrow, D-046-approved scope. Every maker claim I checked held up exactly as stated, and in two places (the depth of the R4-internal gap; the App.tsx/NavSidebar deviation) the maker's own disclosure was accurate or conservative rather than overstated. The one thing that would have failed this unit — building against the wrong contract, or hiding a gap — did not happen. The one thing that makes the *feature* (not this unit) incomplete — R4's page having no visibility into the watcher class the feature exists to monitor — is now on the record as ISS-358 and is a decision for Umesh, not a defect in what u4c shipped.

# Manifest — calendar-page-freshness
**Contract:** qa/contracts/calendar-page-freshness.md (commit ef054973; criteria T1-C1 to T1-C7, T1-L1, invariants T1-I1 to T1-I4); also keeps qa/contracts/calendar-grid-ui.md true; decisions D-242 item 6, D-243 items 2 and 4, D-244 item 2 (unit T1)
**Goal task:** none
**Date:** 2026-11-25
**Fix cycle:** 0 of max 2
**Hold fix cycles:** 0 of 2
**Hold-reopens:** 0
**Resume-reset:** unused
**Capability-redispatch:** 0
Round cap: waived by D-247 (D-014 option b, Approved-by: Umesh, 2026-11-25; "T1 roko" withdraws it). Was: HUMAN_GATE pending (waiver requested 2026-11-25). Non-security class. T1 is a roadmap feature (plan section 4 row 9; D-242 item 6; D-243 item 2), not a findings round, but the delivery gate counts 11 prior PASSes on CalendarPage.tsx / CalendarPage.test.tsx. The check is not dispatched until a DECISIONS entry with Approved-by: Umesh records the waiver; without it the unit is withdrawn and filed file-don't-fix.
**Dual check:** no
dual-note: the contract sets one checker (Tier L, trigger concurrency/timing/race: a repeating timer, an in-flight request that can outlive a sign-out or unmount, a slow response that can overwrite a newer one). No API, auth, tenancy or data-write code changes (nothing under `apps/api`), so none of the security triggers of a dual check applies. The client-side rule that one key's meetings never render for another key is an existing invariant this unit keeps (T1-C5), not a new trust boundary. The checker recomputes `tick.mjs --route`; it may only raise this.
**Persona walk:** skip (no screen, flow or user type added; one out-of-date notice line on the existing Calendar page, same page, same controls, same user types)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Executor rationale:** one spec-complete unit, one hook file plus the page and its test file, one builder.

## What changed
Worktree `D:/KnowledgeBase/.worktrees/t1-calendar-fresh`, branch `wave/t1-calendar-freshness`, base `3357556d7eb068013ef0e1b04112fe989991b0a7` (`docs/cloud-run-golive`), head `7832d789e8e57fa16e63513e0222fc8d3486568b` (two commits: 42973c6a the unit, 7832d789 one more test). Exactly three files (`git diff --name-only 3357556d..HEAD`): nothing under `apps/api`, nothing under `apps/web/src/api`.
- apps/web/src/pages/calendar/useUpcomingMeetings.ts (NEW, 123 lines, the one new hook file the contract allows beside `useOptedOutIds.ts`; `.ts` is budgeted at 300 non-blank lines by `scripts/lint-loc.mjs`). Why the page cannot hold it: the timer, the visibility pause, the in-flight guard, the backoff and the key guard are about 110 lines of effect code with their own refs; `CalendarPage.tsx` already holds 337 lines of rendering and three fetch effects.
  - `:18-19` constants `REFRESH_PERIOD_MS = 60_000` and `REFRESH_BACKOFF_CAP_MS = 300_000` ([ASSUMPTION], below).
  - `:72` the timer: `schedule(ms)` sets one `setTimeout` from the END of each request (`finally`, `:103-104`), so the gap between the end of one request and the start of the next is the period and a slow request is never stacked on.
  - `:76-77` the in-flight guard (`inFlight`) in `run()`, and `:110` in `resume()`; `:76` also stops a cancelled or dead run.
  - `:72` and `:57-61` the visibility pause: a timer that fires while `document.visibilityState === "hidden"` starts nothing and leaves no timer (the schedule is parked); `:57-61` ONE `visibilitychange` listener added once per mount (effect with `[]`), removed on unmount; `:110` `resume()` runs one refresh at once only when the schedule is parked (no pending timer, none in flight), so a return inside the period runs nothing extra and a return after missed timers runs exactly one; `:113` a page mounted in a hidden tab starts nothing until it is visible.
  - `:82` malformed body check (`Array.isArray(data.meetings)`), `:87-101` failure handling: after a first success the last list stays and ONE `stale` notice is set (`:99-100`, replaced, never stacked); before any success the old behaviour (`rows: null` + `error`, `:94-97`). `:35-45` the notice text: 503 says "The calendar service is unavailable right now (503). The list shown is the last one received and may be out of date."; 429, 401/403, network (0), 5xx, other and unreadable body have their own text. A plain 200 with `worker.status: "stale"` is a success (the banner updates from `worker`, T1-C1), not a failure.
  - `:90` backoff `min(300 s, 60 s * 2^failures)` (120, 240, 300, 300 ...), reset to 60 s at the first success (`:83`); `:93` a 429 with `Retry-After` waits at least that long; `:92` 401 and 403 set `dead` and no refresh follows for that key (`:104`).
  - `:114-119` cleanup on unmount and on key change: `cancelled = true`, `clearTimeout`, the refresher deregistered. `:81` and `:88` a response arriving after cleanup is dropped before any state write, and `:104` schedules nothing. Each state carries its `owner` key; the page's existing owner guard is kept.
  - `:47-50` `sameData`: a refresh whose rows and worker are identical keeps the previous state object, so nothing re-renders.
- apps/web/src/pages/CalendarPage.tsx (edited in place, +12 -12): the one-shot meetings effect (old `:66-75`) is replaced by `const meetingState = useUpcomingMeetings(apiKey)` (`:44`); the `owner` derivation of `meetings`, `meetingsError`, `worker` is unchanged and gains `staleNotice` (`:51`); the notice renders at `:188-192` (`data-testid="calendar-refresh-stale-note"`, `role="status"`, text plus `Last updated <time dateTime=...>`), outside the `view !== "list"` guards so it shows in every view. The degraded note and the empty notes are untouched and are not triggered by a failed refresh because `error` stays null and the rows stay. The sessions effect and the Gmail-candidate effects are untouched (D-244 item 2).
- apps/web/src/pages/CalendarPage.test.tsx (tests appended in one new `describe("T1 calendar page freshness")`, 35 tests; the only changed existing lines are the four import lines gaining names `act, cleanup, fireEvent`, `useLocation`, `afterEach`, `useAuth`; no assertion edited or removed, T1-I1).
- Not edited: `apps/api`, `apps/web/src/api/calendar.ts`, `apps/web/src/api/client.ts`, any consent file, any package manifest. No package added; the lockfile restore was `pnpm install --frozen-lockfile --offline` inside the worktree (no junction or copy of the main tree's `node_modules`); no `.env` opened; no network.
- Test seam: the real page, the real hook, the real `listUpcomingMeetings` and `apiFetch` run; only `globalThis.fetch` (per-URL scripted responses; the plain `/calendar/upcoming` calls are counted with their start time and `authorization` header), the clock (`vi.useFakeTimers`, system time fixed) and `document.visibilityState` plus `visibilitychange` events are faked. The sessions and Gmail-candidate lists stay mocked with `vi.spyOn` as in every other block of the file; the meetings seam is never mocked in the new block (`vi.mocked(calendarApi.listUpcomingMeetings).mockRestore()` first). The key change uses the real `AuthProvider.setApiKey` through a probe component.
- falsified (unchanged): none; every falsification ran in a throwaway COPY (see "Mutation run integrity").
- [ASSUMPTION] (the contract's own, kept): the 10-minute bound (D-242, D-243); the 30-120 s band with a 60 s default; the hidden-tab pause (T1-C3); doubling with a 300 s cap and stop on 401/403 (T1-C4).
- [ASSUMPTION] (D-244 item 2, Approver question 1): only the upcoming meetings list refreshes, every 60 s while the tab is visible; the sessions list and the Gmail candidates stay fetched once. Not decided here. Reply words stay "T1: refresh sessions and candidates too".
- [ASSUMPTION] a page mounted in a hidden tab starts no request until it becomes visible, then runs one at once. This reads T1-C3 ("while hidden no request is started") strictly and T1-C5 ("the new key starts with one immediate fetch") as "immediate once the tab is seen". The alternative (always fetch once at mount even when hidden) is a one-line change in the hook; no test fixes it other than the one named "a page mounted in a hidden tab".
- [ASSUMPTION] doubling is counted in failures: the first failed refresh waits 120 s, then 240 s, then 300 s; a failure of the FIRST load with no earlier success also counts and keeps retrying on that schedule, so a transient first-load failure recovers without a reload (the degraded note then clears).
- [ASSUMPTION] a malformed 200 body (not JSON, or no `meetings` array) is a failure like any other; on the first load it shows the existing "failed to load upcoming meetings" degraded note (before this unit it would have set `rows` to `undefined` and thrown in render).
- [ASSUMPTION] on a 401 the existing sign-out handling still runs (the key is cleared and the person is signed out); there is then no list to keep on screen, so T1-C4 (a) is shown for 403 and the other failures, and the 401 test asserts the sign-out and the end of refreshing.

## Differences from the contract
- T1-C6 says the grid scroll position is unchanged. jsdom has no layout, so the test asserts the stronger structural fact that makes it true: the same grid DOM node, the same chip node and the same focused element before and after a refresh with changed data, and a byte-identical page for identical data. Scroll itself is NOT-MEASURED here (live check).
- The contract's runner note says at most one new hook file if the builder "proposes it first". The brief allowed it; this manifest is the proposal's record (target `apps/web/src/pages/calendar/`, reason above).
- Nothing else differs. No API change, no new endpoint, no new header (T1-C7).

## Verification scope
Policy-Version: proportional-verification/2026-11-22.19
Tier: L (concurrency/timing/race; one checker, trigger as the contract sets it)
Round: 3 files (1 new hook, 1 page edited in place, 1 test file extended), 11 criteria and invariants (T1-L1 live-only), est 2 h
slow-plan: one test process at a time; the page test file takes about 25 s per run (collection included); the 10-mutant batch took about 14 minutes.
Criteria: `T1-C1`, `T1-C2`, `T1-C3`, `T1-C4`, `T1-C5`, `T1-C6`, `T1-C7`, `T1-I1`, `T1-I2`, `T1-I3`, `T1-I4` (T1-L1 is live-only, see NOT-MEASURED)
Owners: one builder owns the hook, the page and the test file (no file has two owners).
Fan-out: none; SERIAL: one unit, one builder, the test file and the hook share every helper.
Base / checked state: base 3357556d; head 7832d789 (7832d789e8e57fa16e63513e0222fc8d3486568b); worktree clean; blobs `CalendarPage.tsx:b915a29ba2e6a4132948c9b2096cec8766df0dae`, `CalendarPage.test.tsx:746a57be0da675224648c43b53282d249a8088a7`, `useUpcomingMeetings.ts:4ac293ee3deeb7ccf364b1bd093fc025de290198`, `api/calendar.ts:14ee40bf52b3b282c561f576ed804d64bda20fa4` (unchanged); each equals `git rev-parse HEAD:<file>`.
Route: `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --route 3357556d..7832d789 --root "D:/KnowledgeBase/.worktrees/t1-calendar-fresh"` was not run by the builder; the checker recomputes it (contract: it may only raise the tier).
Gate answers: none; consent is out of scope (D-210); no production write, no push, no deploy, no `.env` read, no network, no install beyond the offline frozen restore of the locked packages in two worktrees (the builder's and the throwaway copy), no junction created by hand, no process killed.
Affected tests / full-suite trigger: `CalendarPage.test.tsx`, `pages/calendar/*.test.*` (OptOutControl, OptOutTruth, calendar-model, join-link), `pages/join-rules/enforcedVariant.test.tsx` (renders the calendar opt-out), `App.readonly.test.tsx` (mounts `/calendar`), `config/runtime.wiring.test.tsx`. No builder runs a full suite; `suite_runs=0`; the full-suite trigger is the checker's. ISS-453 (open, medium, test-flake: 6 CalendarPage tests fail in the FULL web suite on this host, each passes alone) names `CalendarPage.test.tsx`; this unit only appends a block that restores real timers and the visibility property in `afterEach` and never edits an existing test, so it neither fixes nor claims to fix that flake, and the checker's full-suite run may show the same shifting set. ISS-446 (Dashboard `GET /keys`) is not touched.
Random tests and seeds: none; fixed fixtures, a fixed fake system time (2026-09-25 09:00 local), no real timers.
Red-first: the 35 new tests were written first, against the unchanged page, and run: `CalendarPage.test.tsx -t "T1 calendar page freshness"`: 72 tests (38 existing skipped), 34 new at that moment, 33 failed and 1 passed; the 1 pass was the opt-out test, vacuous without a refresh, so it was given an assertion that the refresh really ran (`starts` has 2 entries and the new meeting is on screen) and the pass-before is now a fail-before. Every failure was for the right reason: `expected [ <ts> ] to have a length of 2 but got 1` (no second request ever starts), `expected 1 to be greater than or equal to 9`, `expected [..] to have a length of 22 but got 2`, `expected 0 to be greater than 0` (a timer was never created), `expected <div data-testid="event-detail"> to be null` (no refresh to drop a removed selection). Then the hook and the page edit; the first green run had 1 failure (the 401 case in the shared table, because the existing sign-out handling clears the key, see the [ASSUMPTION] above), moved to its own test. The hide/show-during-a-pending-request test was added after the mutation design showed the in-flight guard needed a test of its own, and was committed as 7832d789.
Pre-check[T1-C1]: 7832d789 npx vitest run src/pages/CalendarPage.test.tsx -t "T1-C1" -> 6 passed, 67 skipped, 0 failed (cwd apps/web; month, week, day and list views each show the added, the changed and the removed meeting after exactly one period and not 1 ms earlier; empty 200; stale 200 banner) t=25 blobs=useUpcomingMeetings.ts:4ac293e,CalendarPage.test.tsx:746a57b
Pre-check[T1-C2]: 7832d789 npx vitest run src/pages/CalendarPage.test.tsx -t "T1-C2" -> 5 passed, 68 skipped, 0 failed (10-minute window: count within 9..11, every gap 30..120 s, sessions and candidates called once; two pages 22; slow request blocks; tab toggle during a pending request; the plain GET with the one `authorization` header, which is also T1-C7's test and so appears under both filters) t=25 blobs=useUpcomingMeetings.ts:4ac293e
Pre-check[T1-C3]: 7832d789 npx vitest run src/pages/CalendarPage.test.tsx -t "T1-C3" -> 4 passed, 69 skipped, 0 failed (hidden 10 minutes: no request, then exactly one on return and the schedule resumes; return inside the period runs nothing extra; hidden mount; listener add/remove counts equal and one add across a key change) t=25 blobs=useUpcomingMeetings.ts:4ac293e
Pre-check[T1-C4]: 7832d789 npx vitest run src/pages/CalendarPage.test.tsx -t "T1-C4" -> 15 passed, 58 skipped, 0 failed (network outage, 500, 503, 429, two malformed bodies, 403: list, selection, view kept and one notice carrying the last-success `<time dateTime>`; 503 wording; no stacking and clear on success; 120/240/300/300 then 60; Retry-After 200 s; 401 and 403 stop; a first load that is refused keeps the degraded note and recovers) t=25 blobs=useUpcomingMeetings.ts:4ac293e
Pre-check[T1-C5]: 7832d789 npx vitest run src/pages/CalendarPage.test.tsx -t "T1-C5" -> 2 passed, 71 skipped, 0 failed (unmount: `vi.getTimerCount()` back to its baseline of 0, listener add and remove counts equal, a late response sets nothing, schedules nothing, writes nothing to the console; key change: old timer gone, slow old-key response dropped, old-key meetings never on screen for the new key, one immediate fetch for the new key) t=25 blobs=useUpcomingMeetings.ts:4ac293e
Pre-check[T1-C6]: 7832d789 npx vitest run src/pages/CalendarPage.test.tsx -t "T1-C6" -> 3 passed, 70 skipped, 0 failed (identical data: byte-identical body HTML, same focus, same URL; changed data: same grid node, same chip node, still focused, detail panel open, no loading state; an open opt-out confirmation survives and Cancel then works; a removed selection closes the panel without any message) t=25 blobs=useUpcomingMeetings.ts:4ac293e
Pre-check[T1-C7]: 7832d789 npx vitest run src/pages/CalendarPage.test.tsx -t "T1-C7" -> 1 passed, 72 skipped, 0 failed (every `/calendar/upcoming` request: URL ends in `/calendar/upcoming`, method GET, headers exactly `["authorization"]`) t=25 blobs=useUpcomingMeetings.ts:4ac293e
Pre-check[T1-C7]: 7832d789 git diff 3357556d..HEAD -- apps/api -> ok, empty (0 bytes); `git diff --name-only` lists only the three web files t=1
Pre-check[C1]: 7832d789 npx vitest run src/pages/CalendarPage.test.tsx -t "\[C1\] three views" -> 3 passed, 70 skipped, 0 failed (calendar-grid-ui [C1], kept by T1-I1; the existing tests, unchanged) t=25 blobs=CalendarPage.tsx:b915a29
Pre-check[C7]: 7832d789 npx vitest run src/pages/CalendarPage.test.tsx -t "\[C7\] honest empty" -> 2 passed, 71 skipped, 0 failed (calendar-grid-ui [C7] honest degraded states, kept by T1-I1; the existing tests, unchanged) t=25 blobs=CalendarPage.tsx:b915a29
Pre-check[T1-I1]: 7832d789 npx vitest run src/pages/CalendarPage.test.tsx -> 73 passed, 0 failed (the 38 existing tests unchanged plus 35 new); npx vitest run src/pages/calendar src/pages/join-rules/enforcedVariant.test.tsx -> 6 files, 178 passed (run on 42973c6, before the one added test, which touches no source) t=60
Pre-check[T1-I1]: 7832d789 npx tsc --noEmit -p tsconfig.json -> exit 0, no output (cwd apps/web) t=30
Pre-check[T1-I2]: 7832d789 git diff 3357556d..HEAD -- apps/web/src/pages/calendar/useUpcomingMeetings.ts apps/web/src/pages/CalendarPage.tsx (read through, not machine-checked) -> ok, `rows` is set only from a response body (`useUpcomingMeetings.ts:86`) or to null; no literal meeting in either source file; fixtures live in the test file only t=1
Pre-check[T1-I3]: 7832d789 node scripts/lint-loc.mjs; node scripts/lint-dirsize.mjs; node scripts/lint-dupes.mjs -> OK (1933 files within budget), OK (307 dirs), OK (2327 unique exports); run on 42973c6, the later commit changed only the test file t=10
Pre-check[T1-I4]: 7832d789 git diff --name-only 3357556d..HEAD -> ok, the three web files only; no consent file and no bot file touched t=1
Pre-check[affected]: 42973c6 npx vitest run src/App.readonly.test.tsx src/config/runtime.wiring.test.tsx -> 29 passed, 0 failed (cwd apps/web) t=30
Tests[T1-C1]: CalendarPage.test.tsx::"[T1-C1]" — first fetch L0, later L1 (one changed meeting, one removed, one added) shown after exactly one period (and still L0 at period minus 1 ms) in the month, week, day and list views, no remount; a 200 with an empty list empties the calendar and raises no notice; a stale 200 updates the worker banner and keeps the meetings
Tests[T1-C2]: CalendarPage.test.tsx::"[T1-C2]" — 10 fake minutes: 11 requests, every start-to-start gap in 30..120 s, sessions and candidates called once each; two mounted pages 22; a never-answering request keeps the count at 1 for 10 minutes and the next one starts one period after the late answer; hide then show with a request pending adds none; the request is `GET .../calendar/upcoming` with exactly the `authorization` header
Tests[T1-C3]: CalendarPage.test.tsx::"[T1-C3]" — hidden for 10 minutes starts nothing, return starts exactly one and the schedule resumes at one period; return after 20 s of a 30 s absence runs nothing extra and the timer fires on time; a hidden mount starts nothing until visible; the listener is added once (also across a key change) and removed on unmount
Tests[T1-C4]: CalendarPage.test.tsx::"[T1-C4]" — table over network error, 500, 503, 429, malformed (not JSON), malformed (no `meetings`), 403: list, selection and URL kept, no loading, no degraded note, no empty note, exactly one notice with a `<time dateTime>` equal to the first success; 503 text; notice not stacked and cleared; wait 120/240/300/300 then 60; 429 `Retry-After: 200` honoured to the millisecond; 401 and 403 stop (401 also clears the key); first-load failure keeps today's degraded note and recovers
Tests[T1-C5]: CalendarPage.test.tsx::"[T1-C5]" — unmount: timer count back to baseline, listener add equals remove, late answer sets nothing and schedules nothing, no `console.error`; `setApiKey("key-B")` while a key-A answer is pending: old meetings absent at every observed moment for key B, one key-B request, the late key-A answer changes nothing, no key-A request after the switch
Tests[T1-C6]: CalendarPage.test.tsx::"[T1-C6]" — identical data leaves the page byte-identical; changed data keeps view, date, filter, URL, selection, detail panel, focus and the same grid and chip nodes; opt-out confirmation survives; a removed selection closes the panel without an error
Tests[T1-C7]: CalendarPage.test.tsx::"the request is the plain GET /calendar/upcoming through apiFetch" — URL, method, headers of every request; structural: no file under `apps/api` or `apps/web/src/api` in the diff
Tests[T1-I1]: CalendarPage.test.tsx — the 38 existing tests unchanged and green; `pages/calendar/*.test.*` and `enforcedVariant.test.tsx` green
Tests[C1]: CalendarPage.test.tsx::"[C1] three views, in the URL" — calendar-grid-ui [C1], the existing 3 tests, unchanged and green (T1-I1)
Tests[C7]: CalendarPage.test.tsx::"[C7] honest empty and degraded states" — calendar-grid-ui [C7], the existing 2 tests, unchanged and green; with T1-C4 they show a first-load failure still ends in the degraded note (T1-I1)
Tests[T1-I2]: structural — the hook sets rows only from a response; no fixture in source
Tests[T1-I3]: structural — three lint scripts green, one new `.ts` file of 123 lines, no `*_v2` or duplicate function
Tests[T1-I4]: structural — no consent file and no bot file in the diff
Falsification[T1-C1]: copy-mutant `sameData(prev, meetings, worker, apiKey) ? prev :` -> `prev !== null ? prev :` (a refresh result is never applied after the first load) -> killed by 13 tests: the four views of "[T1-C1]", the empty 200, the stale banner, and more (green before 35/0, restored, byte-compare equal)
Falsification[T1-C2]: copy-mutants (a) in-flight guard removed from `run()` and `resume()` -> killed by "hiding and showing the tab while a request is pending starts no second request"; (b) `REFRESH_PERIOD_MS` 60_000 -> 10_000 (below the 30 s floor) -> killed by 21 tests including "over 10 minutes the request count is within 9..11" and "two pages mounted double the count"
Falsification[T1-C3]: copy-mutant the timer callback ignores the tab (`if (!isHidden()) void run(); }, ms);` -> `void run(); }, ms);`) -> killed by "hidden: nothing starts however long it stays hidden ..."
Falsification[T1-C4]: copy-mutants (a) a failed refresh blanks the list (`if (lastUpdatedAt === null) {` -> `if (true) {`) -> killed by 9 tests, the C4 table; (b) no growth of the wait (`wait = REFRESH_PERIOD_MS`) -> killed by 3 tests, the 120/240/300 sequence, the stacking test and the 429 test; (c) 401 and 403 no longer set `dead` -> killed by the 403 "no further refresh for that key" test
Falsification[T1-C5]: copy-mutant the post-await `if (cancelled) return;` removed (a late answer of a replaced key writes state) -> killed by the key-change test (the new key's meetings vanish when the old answer lands)
Falsification[T1-C6]: copy-mutant in `CalendarPage.tsx` the opt-out control's `key={selectedMeeting.id}` -> `key={selectedMeeting.id + String(meetings?.length ?? 0)}` (a changed list remounts the control) -> killed by "an open opt-out confirmation survives a refresh". Honest limit: the state-reuse short cut in `sameData` is an optimisation whose removal changes no visible byte, so it has no mutant that a DOM test can kill; "identical data changes nothing" is held by the byte-identical-HTML assertion, which passes with or without it
Falsification[T1-C7]: copy-mutant `apps/web/src/api/calendar.ts` `apiFetch("/calendar/upcoming", apiKey)` -> `apiFetch("/calendar/upcoming?discovery=1", apiKey)` (the refresh would ask for the discovery path that 503s on a stale snapshot) -> killed by 33 tests, among them the plain-GET test
Falsification[T1-I1]: none — the existing 38 tests are the check; the 10 mutants above each ran the new block only
Falsification[T1-I2]: none — structural
Falsification[T1-I3]: none — structural
Falsification[T1-I4]: none — structural
Mutation run integrity: ONE script (`mutate-t1.mjs`, kept in the session scratchpad) ran the 10 mutants one at a time in the throwaway COPY `D:/KnowledgeBase/.worktrees/t1-calendar-fresh-mut` (a second git worktree, detached at 7832d789, its own `pnpm install --frozen-lockfile --offline`), after a baseline run and before a final run; each mutation had its own byte backup taken just before it, a restore in a `finally` that also fires on SIGINT and SIGTERM (no EXIT trap), a byte compare after each (all 10 `equal=true`), the test command under a 420 s timeout, and the previous script run ended before the next began. Baseline 0 failed and final (restored) 0 failed. At the end `git hash-object` equals `git rev-parse HEAD:<file>` for the three files the batch touched: `useUpcomingMeetings.ts` 4ac293ee3deeb7ccf364b1bd093fc025de290198, `CalendarPage.tsx` b915a29ba2e6a4132948c9b2096cec8766df0dae, `api/calendar.ts` 14ee40bf52b3b282c561f576ed804d64bda20fa4. No mutation was run in the builder worktree, and no Node or test process was killed. The copy contains links (the package manager's `node_modules` links), so it is left in place for the checker or the main session to remove with `git worktree remove`; the main-tree rule is to unlink junctions first (memory note: rm -rf follows junctions).
Metrics: start=2026-11-25T00:00:00Z end=unavailable wall_min=unavailable agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=10 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-11-22.19 check_s=0 mutants=10 defects=0

## How to verify (commands + expected)
All from `D:/KnowledgeBase/.worktrees/t1-calendar-fresh`, test commands from `apps/web`.
- `npx vitest run src/pages/CalendarPage.test.tsx` -> expected: 73 tests, 73 pass (38 existing, 35 new); add `-t "T1-C4"` and so on for one criterion.
- `npx tsc --noEmit -p tsconfig.json` -> expected: no output, exit 0.
- `npx vitest run src/pages/calendar src/pages/join-rules/enforcedVariant.test.tsx src/App.readonly.test.tsx src/config/runtime.wiring.test.tsx` -> expected: 8 files, 207 pass.
- `git diff --name-only 3357556d..HEAD` -> expected: the three files above only; `git diff 3357556d..HEAD -- apps/api` -> expected: empty.
- `node scripts/lint-loc.mjs; node scripts/lint-dirsize.mjs; node scripts/lint-dupes.mjs` -> expected: all OK.
- Mutants: each mutant in "Falsification" is a one-line edit; apply it in a COPY (not the worktree), run the test file with `-t "T1 calendar page freshness"`, expect the named tests red, then discard the copy.

## Actual outputs (from maker's own run)
On 7832d789:
```
CalendarPage.test.tsx (whole file)     : Tests 73 passed (73)
  -t T1-C1 / C2 / C3 / C4 / C5 / C6 / C7 : 6 / 5 / 4 / 15 / 2 / 3 / 1 passed, 0 failed (C2 and C7 share one test)
  -t "T1 calendar page freshness"       : Tests 35 passed | 38 skipped (73)
tsc --noEmit                            : exit 0, no output
red run, new tests on the old page      : 72 tests, 33 failed, 38 skipped (34 new at that moment; the 1 pass made non-vacuous afterwards)
mutation batch (copy)                   : BASELINE 0 failed; 10 mutants each killed (fail 1 to 33); FINAL (restored) 0 failed;
                                          hash-object == HEAD blob for the three touched files; all 10 restore byte-compares equal
pages/calendar + enforcedVariant        : 6 files, 178 passed (on 42973c6)
App.readonly + runtime.wiring           : 2 files, 29 passed (on 42973c6)
```

## Capability coverage (each new claim -> its isolating falsification)
| Claim | Test | Falsification |
|---|---|---|
| A change appears on the open page after one period | T1-C1 (4 views) | a refresh result never applied |
| At most one request in flight | T1-C2 tab toggle while pending | in-flight guard removed |
| Request rate inside 30..120 s, 9..11 per 10 minutes | T1-C2 | period 10 s |
| Nothing starts while the tab is hidden | T1-C3 | timer ignores the tab |
| A failed refresh keeps the list, never blanks it | T1-C4 table | failure blanks the list |
| The wait grows and honours Retry-After | T1-C4 | no growth of the wait |
| A dead credential is not retried | T1-C4 (403) | `dead` not set |
| A late answer of a replaced key is dropped | T1-C5 key change | cancelled check removed |
| A refresh does not close an open control | T1-C6 | control remounts on a changed list |
| The refresh is the plain GET | T1-C7 | request asks for the discovery path |

## Live browser evidence
Not run. T1 touches the Calendar page, so the contract requires a real browser check (Mode D), owned by the checker; this unit ran only jsdom tests with a faked clock. No browser was started, no meeting, no network.

## NOT-MEASURED
- T1-L1 (live-only): on the hosted app, with the Calendar page open and signed in, a new event and a changed event in Umesh's Google Calendar appear within 10 minutes of the edit with no reload; the end-to-end bound also depends on the bot's publish interval, which is unverified (`LKB_ATTENDANCE_INTERVAL_S` and its 300 s default were not found by the contract maintainer). The page leg alone is at most 120 s (60 s by default); the rest is the bot's.
- The real browser's behaviour of `visibilitychange` and of timers throttled in a background tab (browsers may delay a timer in a hidden tab, and a laptop that sleeps delays all of them); jsdom fires the event by hand. The page is built so that a late timer is harmless (one request, then the normal schedule).
- The grid scroll position across a refresh (jsdom has no layout); the structural proxy (same DOM nodes) is measured.
- The page under React StrictMode double-mount (development only): each of the two effects would start its own first request; the first is cancelled by cleanup. Not run.
- A real 429 or 503 from the deployed API; both are faked at `fetch`.
- The full web suite (ISS-453 flake) was not run (suite_runs=0).

## Filed, not built
- The sessions list and the Gmail candidates are still fetched once (D-244 item 2, Approver question 1; reply words "T1: refresh sessions and candidates too").
- A manual "refresh now" control (the contract allows, does not require).
- The first-load failure retrying on the backoff schedule is this builder's reading; if the Approver prefers the degraded note to stay until a reload, it is one condition in `useUpcomingMeetings.ts` (`failures` and `schedule` in the `finally`).
- ISS-453 (CalendarPage tests failing in the full suite on this host) is open and unchanged by this unit.

## Status: ready-for-check

# Contract — calendar-page-freshness (unit T1, plan live check row 9, D-242 item 6, D-243 items 2 and 4)

> Status: adopted by /checker 2026-11-25. SOURCE: OWNER WORDS plus MAKER-DERIVED numbers. The default put to Umesh was "Naya ya badla hua meeting hosted page par 10 minute ke andar dikhe" (inbox 2026-11-25, answer 4);
> his reply was about two clashing meetings being joined in parallel and did not object to the bound, so D-242 item 6 and D-243 item 4 keep it as "[ASSUMPTION] a new or changed meeting is visible on the open page within
> 10 minutes with no reload". That label stays on every criterion below that rests on it. Plan check: row 9, "Hosted `GET /calendar/upcoming` returns 200 with Umesh's next meeting within 10 minutes; the Calendar page
> shows it" (`qa/contracts/go-live-acceptance.md` G09 holds the first-load half).
> What the code does today (read by the checker 2026-11-25, nothing run): `apps/web/src/pages/CalendarPage.tsx:66-75` calls `listUpcomingMeetings(apiKey)` once in an effect whose only dependency is `apiKey`; there is no
> timer, no visibility handling and no refetch. On failure the same lines set `rows: null` with an error, so a failed fetch today is rendered as "this lane is empty because the calendar connection is down"
> (`CalendarPage.tsx:186-192`). The sessions list (`:58-64`) and the Gmail candidates (`:77-83`) also fetch once and are not part of this unit. The request is plain `GET /calendar/upcoming` with no query
> (`apps/web/src/api/calendar.ts:6-8`).
> What the API does for that plain request (`apps/api/src/routes/calendar.ts:115-119`): `deps.inventory(tenantId)` returns 200 with `{meetings, worker}`; `worker.status` is `fresh` while the bot's snapshot is under
> 10 minutes old and `stale` after, still with the last-known meetings and still 200 (`apps/api/src/composition/integrations/capture-policy.ts:32,98`); the 503 for an old snapshot exists only on the discovery paths
> (`:117` with `discovery=1`, `:155` with `changedSince`, `:159` acquire). A plain request answers 503 only when there is no snapshot at all (`capture-policy.ts:135`) or something throws (`calendar.ts:122-123`, body
> `{error:"discovery_unavailable", message:"Calendar discovery unavailable"}`). The page already renders a `worker.status !== "fresh"` banner (`CalendarPage.tsx:193-199`).
> Rate limit: 60 requests per minute per signed-in user, keyed on the user (`qa/contracts/api-rate-limit.md` L2-C2, D-229).
> The bot publishes its snapshot on its attendance tick; the design read reports the interval as `LKB_ATTENDANCE_INTERVAL_S`, default 300 s. That variable and default were NOT found by the checker in `scripts/webinar`,
> `scripts` (mjs, ts, sh, js) or `docker/meeting-bot`; treat the 300 s as unverified (see T1-C1 and "Needs the Approver" 2).
> Files: `apps/web/src/pages/CalendarPage.tsx` and its tests; at most ONE new hook file beside `useOptedOutIds.ts` in `apps/web/src/pages/calendar/` if the builder proposes it first (edit-in-place rule: the proposal names the
> target and why the page cannot hold the logic; `scripts/lint-loc.mjs` budgets `.ts` files at 300 non-blank lines and ignores `.tsx`, `structure.config.json:5-10`, so a new `.ts` hook file is budgeted and the 317-line `.tsx`
> page is not). `apps/web/src/api/calendar.ts` may change only additively. Nothing under `apps/api`.
> Runner and seam: `vitest` with fake timers, the network edge faked (`fetch` or `apiFetch`), the real page, the real hook. A test that `vi.mock`s the refresh hook or the page's own fetch helper proves nothing about it
> and does not count. A real browser check is required (UI surface touched, Mode D); the live row is T1-L1.

## Tier and check
Tier L. Trigger: concurrency/timing/race (a repeating timer, an in-flight request that can outlive a sign-out or an unmount, a slow response that can overwrite a newer one; policy Tier table). ONE checker. Not a dual
check: no security, auth, tenancy or production-write trigger of the .8-3 kinds, because no API, auth or data-write code changes; the client-side rule that one signed-in key's meetings never render for another is an
existing invariant this unit must keep (T1-C5), not a new trust boundary. `tick.mjs --route` is recomputed by the checker; it may only raise this. Mode D: the checker drives its own browser against the page.
Unit checks run no full suite; the pre-push check is the behaviour-scoped set plus collection (.13-1). The files are identical on `wave/b4-recorder-state`, `wave/b10-failure-alert-mail`, `release/kb-golive` and
`docs/cloud-run-golive` (last commit on `CalendarPage.tsx` 2074f299, on `calendar.ts` and `CalendarPage.test.tsx` f6bf0597).

## Criteria
- **[T1-C1]** A change shows on an open page without a reload. With the page mounted and a first fetch returning list L0, a later fetch returning L1 (a meeting added, one whose time or title changed, one removed or
  marked cancelled) is rendered, in the month, week, day and list views, after the refresh period of T1-C2 and no later, with no navigation and no remount (fake clock: advance by the period, flush, assert the DOM). The page-side
  worst case is therefore one period, and with the bot's tick at the design read's 300 s default the end-to-end worst case is tick + period + network, under the 10-minute bound [ASSUMPTION: 10 minutes, D-242/D-243; the 300 s
  is unverified]. A refresh that returns an empty list from a 200 empties the calendar (a real removal); that is not a failure.
- **[T1-C2]** Bounded refresh rate. The period between the end of one upcoming-meetings request and the start of the next is at least 30 s and at most 120 s, default 60 s [ASSUMPTION: the band and the 60 s default; no source
  states one; chosen so the page leg stays far inside 10 minutes and uses about 2% of the per-user limit]. At most one such request is in flight per page: while one is pending no second one starts, however slow it is. Over a
  10-minute fake-clock window with a healthy API the request count is between 9 and 11 inclusive at the default; with two pages mounted the count doubles and the test says so. The refresh adds no request to the sessions or the
  Gmail-candidates calls. No retry loop: a failed request is followed only by the next scheduled attempt (T1-C4), never an immediate retry.
- **[T1-C3]** No refresh while hidden [ASSUMPTION: proposed by the checker, no source states it]. While `document.visibilityState === "hidden"` no upcoming-meetings request is started (a request already in flight may finish).
  When the tab becomes visible again and the last attempt started more than one period ago, exactly one refresh runs at once (not one per missed period), then the normal schedule resumes; when it was less than one period ago,
  nothing extra runs. The `visibilitychange` listener is added once per mount.
- **[T1-C4]** A failed refresh never blanks the page and never poses as an empty calendar. After a first success, any refresh failure (network error `status 0`, 5xx including 503, 429, a malformed body, 401, 403):
  (a) leaves the last good list on screen, same events, same selection, same view; `meetings` is never set to null and the page never goes back to a loading state; (b) shows one visible out-of-date notice that says the list
  may be out of date and when it was last updated (a `<time dateTime>` of the last success), clears it at the next success, and does not stack a second notice per failure; (c) does NOT render the existing "Upcoming meetings
  are unavailable ... this lane is empty because the calendar connection is down" note or the "no upcoming meetings" empty note on account of the failure; (d) for a 503 the notice names the cause in words a person can act on
  (the calendar service is unavailable right now, 503, and the list shown is the last one received), not the bare server text `Calendar discovery unavailable` alone; (e) after a 429 the next attempt waits at least the
  response's `Retry-After` (`ApiError.retryAfterSeconds`, `apps/web/src/api/client.ts:80-93`), and after other failures the wait grows by doubling up to 300 s and returns to the normal period at the first success
  [ASSUMPTION: doubling with a 300 s cap]; (f) after 401 or 403 no further refresh is started for that key (a dead credential is not retried every minute; the existing sign-out handling is untouched). A first load that fails
  with no earlier success keeps today's behaviour exactly (the degraded note of `calendar-grid-ui` [C7]).
- **[T1-C5]** No timer, listener or late write is left behind, and keys never mix. On unmount: the pending timer is cleared (`vi.getTimerCount()` returns 0 for this page's timers), the `visibilitychange` listener is removed
  (add and remove spy counts equal), and a response that arrives after unmount sets no state (no React warning, no render). When `apiKey` changes (sign-out, another user): the old timer is cleared, a response still in flight
  for the old key is dropped, meetings of the old key are never rendered for the new key at any moment (the existing `owner` guard at `CalendarPage.tsx:45-52` is kept and tested with a slow old-key response arriving after the
  switch), and the new key starts with one immediate fetch. A slow older response never overwrites a newer one.
- **[T1-C6]** A refresh does not disturb what the person is doing. Across a refresh the active view, the date range, the filters, the URL query, the selected event and its open detail panel, keyboard focus and the scroll
  position of the grid are unchanged, and the page does not re-enter a loading or skeleton state. A refresh that returns identical data causes no change a person can see. If the selected meeting is gone from the new list the
  detail panel closes without an error (`CalendarPage.tsx:149` already derives it from the list). The opt-out and Gmail-review controls keep working during and after a refresh.
- **[T1-C7]** The API contract is not touched. The diff changes nothing under `apps/api`; the refresh calls `GET /calendar/upcoming` with the same path, no query string (never `discovery`, `changedSince`, `sync`: those
  paths return 503 on a stale snapshot), no new header and no new endpoint, and reads the same response shape (`{meetings, worker}`); the worker banner is updated by each refresh because `worker` comes from the same response.
  The request goes through the existing `apiFetch` with its existing CSRF and 401 handling.
- **[T1-L1] [LIVE-ONLY]** On the hosted app (live check row 9): with the Calendar page open and signed in, add an event to Umesh's Google Calendar, and change another event's time; with no reload both appear on the page
  within 10 minutes of the edit [ASSUMPTION: bound]. The checker records the edit time and the time the page showed it, and reads the bot's actual publish interval from the running service, because the page cannot fix a
  slower bot. Until it runs, the end-to-end claim is NOT-MEASURED.

## Invariants
- **[T1-I1]** `qa/contracts/calendar-grid-ui.md` still holds: [C1]-[C9] and [I1]-[I5] (one timeline, filters, time zone, keyboard access, the list view, real data only). In particular [C7] honest degraded states and [I1] no new
  data source. Its existing tests pass unchanged (no edited or deleted assertion in `CalendarPage.test.tsx` or `apps/web/src/pages/calendar/*.test.*`).
- **[T1-I2]** Real data only: no seeded or placeholder meeting is ever shown to make a refresh look populated (`calendar-grid-ui` [I3]).
- **[T1-I3]** `node scripts/lint-loc.mjs`, `lint-dirsize` and `lint-dupes` stay green; no `*_v2`, `*_new` or duplicate function (edit in place).
- **[T1-I4]** Consent code is untouched (D-210). The bot's publishing interval, join timing and the two-slot work are not touched.

## Out of scope / ignore
The bot's publishing interval and its setting; join timing; the two-slot scheduler (B9, P1); any change to what the API returns, to the 10-minute worker window, to the rate limiter or to the 503 rules; server push,
websockets, service workers; refreshing the sessions list or the Gmail candidates (see "Needs the Approver" 1); the wording and styling of the notice beyond T1-C4 (b) and (d); a manual "refresh now" control (allowed, not required).

## Needs the Approver
1. **Should the other two lists on the page refresh as well?** The page also shows past sessions and the "Needs review" Gmail candidates, each fetched once. His words and the plan row are about meetings in the
   calendar, so this contract refreshes only the upcoming meetings. Default taken: yes to meetings only; the others stay as they are. Reply words: "T1: refresh sessions and candidates too" if he wants them.
2. **The 10-minute bound is end-to-end, and the page owns only its leg.** The page leg is at most 120 s by T1-C2. The rest is the bot's publish interval, which the checker could not find in the repo. If the bot
   is slowed beyond roughly 8 minutes (the contract's margin, 600 s minus 120 s), the bound breaks whatever the page does. Not an ask; recorded so the live check T1-L1 reads the real interval.
3. The tab-hidden pause (T1-C3) and the retry growth (T1-C4 e) are the checker's proposals ([ASSUMPTION]); he can veto either. No answer is needed to build.

## Stop rule
One acceptance check per unit, fixed before the work. A finding outside T1-C1 to C7, T1-L1 and T1-I1 to I4 is filed in the ledger, not built. A finding of class cross-user display (T1-C5) is never round-capped. Two failed
checks go to Umesh as a decision.

## Amendment log
- 2026-11-25 · routine · created by the checker from D-242 item 6, D-243 items 2 and 4 and plan row 9 (instruction: write the T1 contract). Design-read facts verified against the code: the one-time fetch at
  `CalendarPage.tsx:66-75` and the 60-per-minute per-user limit were confirmed. CONTRADICTED: "the API serves the bot's snapshot only while it is under 10 minutes old, else 503 (`capture-policy.ts:32, 98, 155-159`)" is true
  only for the discovery, `changedSince` and acquire paths; the page's plain request gets 200 with `worker.status: "stale"` and the last meetings (`calendar.ts:115-119`, `capture-policy.ts:98`), and 503 only when no snapshot
  exists (`:135`) or the lookup throws (`calendar.ts:122-123`). Consequence recorded in T1-C4 and T1-C7. NOT FOUND: `LKB_ATTENDANCE_INTERVAL_S` and its 300 s default. [ASSUMPTION] tags kept: the 10-minute bound
  (D-242, D-243), the 30-120 s band with a 60 s default, the hidden-tab pause, the doubling retry with a 300 s cap, stopping on 401 and 403.

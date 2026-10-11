# calendar-unknown-tombstone-non-interference

Status: ready-for-check
Fix cycle: 0
Priority tier: 2 - open HIGH ledger issue ISS-T036CAL-011 (pre-existing, found by the t036 checker, cycle 3)
Security class: an outsider can stop the bot from recording the user's legitimate meetings (denial of the product's core function). FULL ceremony; never round-capped.
Lane: lane/tombstone (base 01635f6). New issues go to qa/issues.tombstone.jsonl as ISS-TOMBSTONE-NNN (filed: ISS-TOMBSTONE-001, the residual).
Reserved files (D-119): the HOLD there covers U4.1/T-051/T-052 (upload worker, STT, scripts/upload). calendar-client.ts and the calendar folder are not reserved. Checked.

## NOT DONE / UNVERIFIED (read first)
- No live Google Calendar run, no network. The shape of Google's cancelled-event resource is taken from the repo's fixtures and mapper behaviour (the adapter retains "validated id-only cancelled tombstones", recurrence fields and `updated`). A live check must confirm: (a) what a cancelled invite that was never accepted actually returns on `events.list` with `showDeleted` (id only, or id + start/summary/conferenceData); (b) whether `meetingUrlSource` is "conference" for a cancelled invite's carried link; (c) that the usual outsider shape (send, cancel before tick) carries a start. (a) decides how often the residual below is reachable.
- RESIDUAL (not fixed, filed): an id-only unknown tombstone still holds every UNLINKED Gmail row. See "Residual".
- A stored unknown-tombstone row never expires (pre-existing: nothing clears it); its hold on unlinked Gmail rows therefore persists until a state reset. Expiry needs a state-shape change; left to the Approver (ISS-TOMBSTONE-001 fix_direction).
- Not touched: apps/api, apps/web, packages/core, qa/contracts, verdicts, TASKS.md, enforcement paths. `packages/meeting-bot/src/alert-who-production.test.ts` has 2 failures at this base (skip-reason vocabulary 14 vs 15): pre-existing, unrelated, it is the t036 merge close-out edit that "follows" on the main line.

## The ORIGINAL hazard (what `unknown-tombstone` guarded)
Introduced by the webinar reconciliation unit (D-060, manifest qa/manifests/webinar-release-repair-plan.md, "Independent acceptance floor": "known id-only cancellation after prior live Calendar/Gmail => actual existing selector zero launches; unknown tombstone empty effective feeds/gate"; "unknown or ambiguous relationships durable unresolved") and ISS-WEBINARRELEASE-013 (the actual adapter->selector failure: a cancelled event's Gmail copy was still launched). Precisely: a meeting can be cancelled before this client ever stored its live Calendar event. The tombstone then names an id nothing on record has, so it cannot be bound to a scheduled job; a Gmail copy of the same meeting (no calendar twin on record, so no alias link) may still be schedulable, and the bot would join a cancelled meeting. The original rule answered by making ALL state unresolved: legacy scope emptied every event; available scope marked every unlinked Gmail row `unproven-calendar-history`. The rule is blanket because it was written when the tombstone's possible reach was not analysed, not because a Calendar row could be the victim.

## What a tombstone carries in this mapper
`normalizeOccurrence` keeps, for a cancelled calendar row, whatever the event resource supplied: `id` (always), and when present `title`, `startTime`, `endTime`, `organizer`, `meetingUrl` (+ `meetingUrlSource`), `recurringEventId`/`originalStartTime`, `providerUpdated`. Fixtures show both id-only tombstones (`{id, cancelled:true}`) and detailed ones. An unknown tombstone becomes an unaccepted row with `unresolved: "unknown-tombstone"`, no aliases, no providerIds (so it cannot link to anything); its snapshot is stored.

## The new rule
1. An unknown tombstone is recorded and listed (inventory reason `unknown-tombstone`) but is NOT a blocker: `newStartsBlocked` ignores that one reason (all other unresolved reasons still block in the legacy scope). It is never a feed row in either scope.
2. Its consequence is scoped to what it could be the cancellation of: only an UNLINKED Gmail row (no calendar twin on record), because only that row can be a live copy of a meeting whose Calendar event was never stored. New module `packages/meeting-bot/src/calendar/tombstone/unknown-tombstone-reach.ts` decides by what the tombstone itself carries:
   - trusted conference link + start -> only unlinked Gmail rows holding that exact meeting identity;
   - a start but no trusted link (including a free-text link: sender-controlled, never an identity, same principle as ISS-T036CAL-010) -> only unlinked Gmail rows starting at that exact instant;
   - nothing usable (id only, or a link without a start) -> every unlinked Gmail row (the residual).
3. Held rows get `unproven-calendar-history` and a transition (`unresolved`), so a Gmail job already scheduled for them is unscheduled. The same logic now runs in the legacy scope (previously its answer was to empty everything).
Why this still guards the hazard: the hazard needs a Gmail copy with no calendar twin; that class is exactly what is held (narrowed by identity/start where the tombstone says which meeting it was). Rows proven by a stored id or by conference data are known; an unknown tombstone cannot be the cancellation of something already on record (a cancellation of a KNOWN id takes the unchanged known path).

## What an unknown tombstone can and cannot affect now
Cannot: any calendar row (trusted, legacy, recurring, cancelled), any Gmail row linked to a calendar row, `newStartsBlocked`, the feeds' emptiness, state of other rows, other reasons' blocking. Can: unlinked Gmail rows as in rule 2, and itself (listed, not scheduled). Unchanged paths: known cancellation (cancelled transition, linked Gmail copy cancelled, `candidates[].cancelled`), parent/child recurrence cancellation, ambiguous-provider, contradictory/missing revision, source discontinuity.

## Residual (ISS-TOMBSTONE-001, medium, open, security class)
Exact reach: an UNKNOWN tombstone with no start (id only, or a link but no start) holds all UNLINKED Gmail rows (e.g. email-only webinar registrations with no calendar event) in both scopes, persistently (stored row, no expiry). It never touches a calendar row or a linked pair and never blocks starts. With a start: only that start (or that identity). I could not narrow the id-only class without reopening "join a cancelled meeting" (nothing in an id relates it to a Gmail row); expiry would need a stored first-seen tick. Also, an outsider who knows a victim's Gmail-only meeting start (or url+start) can craft a tombstone holding exactly that row: bounded to rows an outsider can name.
Indirect effect (note): holding an unlinked Gmail row removes it as an overlap competitor, so a linked row that had lost an overlap to it can now be scheduled (frees, never unschedules). The property below places unlinked rows in slots that overlap nothing else to measure the direct effect; this is the only interaction found.

## Fresh state / state reset
Before (base 01635f6): on the first tick after a reset every cancelled event in the window is unknown: legacy scope emptied ALL events (`newStartsBlocked`), available scope held every unlinked Gmail row, and the stored tombstone kept that going on every later tick. After: calendar rows and linked pairs run; only unlinked Gmail rows attributable by the tombstones' start/identity are held (the id-only residual holds all unlinked). Test "fresh state / state reset".

## D-015: ISS-T036CAL-011 recorded reproduction (verbatim shapes), before / after
Ledger recorded no concrete rows, only: calendar c0 (conference) + Gmail g0 (approved, unlinked) + each of three unknown cancelled shapes (minimal id/cancelled; a cancelled invite with details; one with a free-text link). Reproduced on the base code (module loaded from `git show HEAD:...calendar-client.ts`, deleted afterwards) and on the fix, c0 + unlinked g5, tombstone details from an unrelated meeting:
```
BASE 01635f6 legacy    no tombstone: cal=[c0] gmail=[g5] blocked=false
BASE 01635f6 legacy    minimal / details / free-text: cal=[] gmail=[] blocked=true   (x3)
BASE 01635f6 available no tombstone: cal=[c0] gmail=[g5] blocked=false
BASE 01635f6 available minimal / details / free-text: cal=[c0] gmail=[] blocked=false (x3)
NEW legacy    minimal: cal=[c0] gmail=[]  blocked=false     (residual: id only holds the unlinked g5)
NEW legacy    details: cal=[c0] gmail=[g5] blocked=false
NEW legacy    free-text: cal=[c0] gmail=[g5] blocked=false
NEW available minimal: cal=[c0] gmail=[]  blocked=false     (residual)
NEW available details / free-text: cal=[c0] gmail=[g5] blocked=false
```
ISS-T036CAL-011: 12/12 (scope x tombstone shape x mode) cells: calendar rows (c0, c1) and the linked pair (c1/g1) have an outcome (scheduled, skipped, feed rows, transitions, inventory, stored occurrences) byte-identical to the run without the tombstone. Recorded cases left open: none among those measured, EXCEPT g5 under the minimal shape, named as the residual above (the ledger's own g0 is unlinked, so under the minimal shape it stays held).

## Property
P1 (non-interference), 400 seeds x 2 scopes x 2 modes x 2 ticks = 3200 runs, 953 unknown tombstones (8 shapes: id only; copied start/title/organiser; full trusted-identity copy; free-text link copy; link without start; unknown recurring parent; location source; blank placeholder), shuffled fetch order, second tick keeping the stored tombstones: violations 0. P2 (known cancellation never ignored, whatever surrounds it): 1076 runs, 840 with the victim cleanly cancelled, violations 0. A first P1 run reported 10 violations: all one case, an unlinked Gmail row (held, as documented) that had been beating a linked row in the overlap contest; the generator now keeps unlinked rows overlap-free (see "Indirect effect").

## Existing assertions changed
Only one test, `packages/meeting-bot/src/calendar/webinar-policy.test.ts` "known actual-wire and id-only cancellations preserve metadata and block stale Gmail selector", last 3 lines:
- OLD: unknown `{id:"unknown",cancelled:true}` => `newStartsBlocked` true, `calendarEvents` [], `candidates` []; replay of the state still blocked.
- NEW: `newStartsBlocked` false, `calendarEvents`/`candidates` deep-equal the run without it (the proven pair `cal-a`+`mail-a`), inventory still lists `unknown-tombstone`; replay still not blocked.
- Why: this is the defect itself (ISS-T036CAL-011): the tombstone sits beside a PROVEN pair (stored id + shared conference identity) which it cannot be the cancellation of. The hazard (unlinked Gmail copy of an unstored cancelled meeting) is guarded by the new tests, and the neighbouring assertion in "available-source coverage" (`orphan-mail` held as `unproven-calendar-history` by an id-only tombstone) passes unchanged.
Everything else passes unchanged.

## Mutations (own harness, per-mutation byte backup, finally-restore, bytes verified; harness deleted)
14 run, 14 killed. M1 unknown tombstone blocks all (legacy defect): recorded repro, legacy test. M1b holds linked Gmail rows: recorded repro, hazard 1. M2 ignore entirely (also narrow class): hazard 2, residual, fresh. M3 known cancellation no longer applied: recorded repro, hazard 1. M3b known-id binding skipped (`if (false) targets`, parent/child cancellation): existing webinar-policy test "recurring siblings, immutable original date and parent cancellations". M4 identity tombstone matched by start only: "reach by what the tombstone carries" (sameStartOtherLink). M5 linked Gmail copy survives known cancellation: hazard 1, P2. M6 identity from a free-text link: "reach..." (freeOtherLink). M7 exclusion in one scope only: hazard 2, reach, residual. M8 fresh-state tombstones block everything: recorded repro, hazard 2, reach. M9 500 tombstones change state: hazard 1 (500 noise), "1, 2 and 500". M9b quadratic (reach rebuilt per Gmail row): the linearity assertion in "1, 2 and 500". M10 start-only tier dropped: reach, fresh. M11 tombstone listed as a feed row in legacy: recorded repro. Exact failing-test names per mutation were printed by the harness.

## Scope / files
- `packages/meeting-bot/src/calendar/calendar-client.ts` (256 non-blank lines, +6/-4): import, `reach` replaces `orphan`, `unproven-calendar-history` for any scope when reached and unlinked, `if (unresolved) continue`, `newStartsBlocked` ignores `unknown-tombstone`.
- NEW `packages/meeting-bot/src/calendar/tombstone/` (new subfolder; calendar/ loose files unchanged): `unknown-tombstone-reach.ts` (34), `tombstone-fixtures.ts` (38), `unknown-tombstone-non-interference.test.ts` (136), `unknown-tombstone-property.test.ts` (93).
- `webinar-policy.test.ts`: the one assertion change above. `qa/issues.tombstone.jsonl`: ISS-TOMBSTONE-001.

## Evidence (commands run from C:\Users\product\Desktop\KnowledgeBase-lanes\tombstone\packages\meeting-bot; node from the codex runtime)
`node --test --import tsx src/calendar/tombstone/unknown-tombstone-non-interference.test.ts src/calendar/tombstone/unknown-tombstone-property.test.ts src/calendar/webinar-policy.test.ts`:
```
ISS-T036CAL-011: 12/12 (scope x tombstone shape x mode) cells: calendar rows and the linked pair identical to the run without the tombstone
P1: 400 seeds x 2 scopes x 2 modes x 2 ticks = 3200 runs (354 seeds with tombstones, 953 tombstones); violations: 0; unlinked Gmail rows held (documented reach): 492
P2: 1076 known-cancellation runs (840 with the victim cleanly cancelled); violations: 0
ℹ tests 29  ℹ pass 29  ℹ fail 0
```
One at a time, each `node --test --import tsx src/calendar/<file>.test.ts`: webinar-policy 19/19, schedule-state 18/18, auto-join 39/39, schedule-tick 14/14, join-rules-select 11/11, join-rules-optout-identity 22/22, link-source-allowlist 4/4, link-source-reconcile 7/7, link-source-alias 9/9, all fail 0. `src/alert-who-production.test.ts` 2/4 (pre-existing, see above).
`node C:\Users\product\Desktop\KnowledgeBase\node_modules\typescript\lib\tsc.js --noEmit -p tsconfig.json` (packages/meeting-bot): exit 0. `node scripts/lint-dirsize.mjs`: `lint-dirsize: OK (124 dir(s) within budget)`.

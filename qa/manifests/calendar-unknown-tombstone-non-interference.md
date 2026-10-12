# calendar-unknown-tombstone-non-interference

Status: ready-for-check
**Handshake status:** checked-PASS (cycle 2)
Fix cycle: 2
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

## Fix cycle 1 (responds to verdict FAIL, cycle 0, commit checked 2a19974)

### What changed
- `tombstone/unknown-tombstone-reach.ts` rewritten: no exact-start or exact-identity selector remains. Unlinked Gmail rows are held by a finite WINDOW. Tombstone with a usable start S: rows starting within +-24h of S (covers every timezone misreading; self-expiring). Tombstone without one (id only, all-day, recurring instance, link only): rows starting in [T-24h, T+14d], T = Google `updated`, else the first tick that saw it. The tombstone's link is no longer consulted (a trusted link's start covers the same rows). Calendar rows, linked pairs and `newStartsBlocked` are untouched as before.
- `calendar-client.ts` (+2 lines): a NEW unknown tombstone with no `updated` is stamped with `checkedAt` as `providerUpdated`/`revision` (first-seen; no state-shape change, stored state stays valid; a refetch does not move it).
- Tests rewritten/added in `unknown-tombstone-non-interference.test.ts`; `Row` renamed `TombstoneRow` (ISS-TOMBSTONE-006).
- New issue: ISS-TOMBSTONE-007 (residuals). Existing ledger rows not touched.

### Assumptions (policy; the Approver may change them)
- HOLD_HORIZON_MS = 14 days, START_WINDOW_MS = LEAD_SLACK_MS = 24h (constants in the reach module). Fail-closed choice for a start-less tombstone: hold anything that can start between 24h before its cancellation and 14 days after; beyond that a Gmail-only copy of such a cancelled meeting is joinable (ISS-TOMBSTONE-007 d).
- A pre-fix stored tombstone with no clock at all still holds near... every unlinked row with a start (no expiry), fail closed (007 b).

### Reproduction counts (recorded cases re-run verbatim, 2 scopes x 2 modes cells)
- ISS-TOMBSTONE-001: 2/2 refused (recorded case, both scopes: g5 and g6 held, g1 and c0/c1 run).
- ISS-TOMBSTONE-002: 16/16 refused (+1 min, 10:30Z, same instant written +05:30, EST misread 05:30Z vs 16:00Z).
- ISS-TOMBSTONE-003: 20/20 refused (zoom /j/ vs /w/?tk=, meet(1) vs meet(0) same start, same url Gmail +1 min, same url+start, ?pwd variant).
- ISS-TOMBSTONE-004: 6/6 as specified (hold near-term; tombstone absent on ticks 1-4 and hold ends by horizon: a row 20 days out is not held at +5 days, a new row 41 days out runs at +40 days) plus the baseline-of-old-deleted-events case (Google `updated` in August holds nothing) and the first-seen stamp not moving on refetch.
- ISS-TOMBSTONE-005: left OPEN, named: the start-copy attack still holds the victim's unlinked row inside the 24h window (now bounded and expiring). Narrowing it needs an organiser/sender match (Approver decision, see 007).
- ISS-TOMBSTONE-006: fixed; `scripts/lint-dupes.mjs` now reports 5 violations, all pre-existing, none for `Row`.
- ISS-T036CAL-011 recorded reproduction (12/12) and properties P1 (3200 runs, 0 violations) and P2 (1076 runs, 0 violations) still pass.

### Verdict merge conditions
1 fixed (near-miss and differently-formed-link tests exist; the 5-minute-window and exact-start mutations are killed). 2 fixed by expiry (stamp plus horizon); a documented operator release is NOT added (state reset still clears everything). 3 done. 4 NOT done: the D-060 floor amendment for the changed `webinar-policy.test.ts` assertion needs an Approver-recorded entry (Umesh); I did not touch docs/DECISIONS.md. 5 NOT done: no live Google check.

### Evidence (commands run from packages/meeting-bot with `node --test --import tsx <file>`)
- unknown-tombstone-non-interference.test.ts: pass 12, fail 0. unknown-tombstone-property.test.ts: pass 2, fail 0. webinar-policy.test.ts 19/19, schedule-state.test.ts 18/18, auto-join.test.ts 39/39.
- `node tsc.js --noEmit -p tsconfig.json` (packages/meeting-bot): exit 0.
- Mutations (own harness, untracked, deleted; per-mutation byte backup restored in finally; `git hash-object` of the reach file after = d00864e9c80574ad810fa42b3769f24f31665ec9 = the committed blob): start window 5 min KILLED; exact start only KILLED; no horizon KILLED; span never holds KILLED; no lead slack KILLED; no-clock row holds nothing KILLED (after adding the no-clock test; it first SURVIVED).

## Fix cycle 2 (responds to verdict PASS cycle 1 with merge conditions 4 and 5 open and ISS-TOMBSTONE-008)

Approver ruling 2026-10-12 "Amend + live check allow", recorded as D-129 (D-060 floor amended for the one webinar-policy cancelled-tombstone assertion, proven pair only; one read-only live check) and clarified by D-130. Merge condition 4 is satisfied by D-129 (no other D-060 assertion is amended; I changed none: webinar-policy.test.ts is untouched this cycle, 19/19).

### Step 1: live check (merge condition 5) - done, evidence qa/evidence/tombstone-live-shape-2026-10-12/summary.md
Read-only `calendar events list` x2 with the repo's pinned gws CLI (no token or secret printed or stored; no event created, changed or cancelled). Query B (the adapter's baseline shape, showDeleted, no time filter): 211 items, 15 cancelled. Field presence on the 15: start/end/iCalUID/updated/htmlLink 15/15 (none id-only), recurringEventId + originalStartTime 11/15, recurrence 4/15, organizer/summary/attendees/conferenceData/hangoutLink 4/15 (never without start). Limit: a never-accepted outsider invite was not observed (none can be created under a read-only check); the incremental-sync (syncToken) form of a deletion was not observed.
Consequence: the common cancelled event is a BARE START (start, end, iCalUID, updated); id-only was not seen; organizer/title/link are the exception. The cycle-1 start-less blanket was the unusual shape, and the match keys available are link identity, organiser/title and start (iCalUID is not carried by the adapter or by core: outside this unit).

### Step 2: the fix (ISS-TOMBSTONE-008)
`tombstone/unknown-tombstone-reach.ts` rewritten. A tombstone holds an UNLINKED Gmail row only through a match:
- LINK: its trusted (Google conference data) link and the row's link name the same meeting (zoom /j/ vs /w/?tk=, meet code, pwd/tk stripped), whatever the start; window [min(S,T)-24h, max(S,T)+30d]. A free-text link is never an identity.
- HOST: its organiser is the row's sender (an outsider cannot be) and (same normalised title, or the row starts within 24h of its start, or it names neither start nor title); same window. Covers a cancelled series master and a rescheduled copy.
- START: a start S and the row within +-24h of S, unless the tombstone names an organiser that is not the row's sender (nor its domain) and shares neither title nor link (another party's meeting).
- NEAR: a tombstone with no start and nothing to match (id only) holds only rows starting in [T-24h, T+48h]. Kept solely because webinar-policy.test.ts "available-source coverage" (a D-060 assertion D-129/D-130 do not amend) requires an id-only tombstone to hold `orphan-mail`; Google sent none of these live (0/15). Setting NEAR_AHEAD_MS and NEAR_BEHIND_MS to 0 makes it hold nothing, which needs a further Approver amendment of that assertion.
Everything else holds nothing and stays listed as `unknown-tombstone` in the inventory (the log). Each hold ends with its window. `calendar-client.ts` is unchanged this cycle (first-seen stamp kept).

### Reproduction counts (recorded cases re-run; 2 scopes x 2 modes cells; all on the current code)
- ISS-T036CAL-011: 12/12 cells unaffected; P1 3200 runs, P2 1076 runs, 0 violations.
- ISS-TOMBSTONE-001: 2/2 (recorded case: g5, g6 held, g1/c0/c1 run).
- ISS-TOMBSTONE-002: 16/16 refused. ISS-TOMBSTONE-003: 20/20 refused (the link forms are now matched by meeting identity, not URL+start).
- ISS-TOMBSTONE-004: 6/6 as specified. One expectation CHANGED by design: a new id-only row six days out is no longer held (matches nothing); it is the cycle-1 14-day blanket being removed.
- ISS-TOMBSTONE-005: left OPEN, named: a bare-start tombstone with no organiser still holds the unlinked row within 24h of its start; a detail-bearing outsider tombstone copying a start no longer does (8/8 cells free).
- ISS-TOMBSTONE-006: fixed (cycle 1); lint-dupes still the same 5 pre-existing violations, none ours.
- ISS-TOMBSTONE-007: (a)-(d) superseded by 009.
- ISS-TOMBSTONE-008, direction 1 (no outsider suppression): 30/30 unrelated rows run (start-less outsider invite with unrelated title/organiser vs rows +3d/+13d/+14d/+20d; id-only vs +3d/+13d; invites renewed with fresh ids at day 0 and 13 vs a day-20 row; a detail-bearing outsider copying the victim's start). Direction 2 (no fail-open): 44/44 cells held for the recorded gap shapes when the tombstone carries a trusted link, or host + title (copy +-25h/+30h, link-only +13d/+15d/+16d, recurring instance +30d incl. originalStartTime-only, cancelled master later instance +21d, rescheduled copy +3d). NAMED, NOT held (36/36 pinned): the same gaps for a BARE tombstone (start only) or id-only: there is nothing in it to match on. Filed as ISS-TOMBSTONE-009 (medium, open).

### Evidence (from packages/meeting-bot; node --test --import tsx <file>)
unknown-tombstone-matched-hold.test.ts (NEW) 10/10; unknown-tombstone-non-interference.test.ts 11/11 (the no-clock test moved to the new file, the id-only and link-only expectations updated as above); unknown-tombstone-property.test.ts 2/2; webinar-policy 19/19; schedule-state 18/18; auto-join 39/39; schedule-tick 14/14; join-rules-select 11/11. `node tsc.js --noEmit -p tsconfig.json`: exit 0. lint-dirsize OK (124 dirs). lint-dupes: 5 pre-existing violations, none ours.
Mutations (harness tombstone-c2 inside the worktree, deleted; per-mutation byte backup restored in finally; pre/post hash of the reach file equal): 13 run, 13 killed after adding two tests (first run: host match removed SURVIVED, killed by "host and title without any link ..."): link match removed; host match removed; other-party contradiction removed; id-only window 14d; matched horizon unbounded; start window 1 min; free-text link trusted; zoom path forms not collapsed; host alone holds; no-clock matched row holds nothing; id-only window removed; start-only never holds; title alone holds. Final: `git hash-object` of the reach file equals the committed blob.

### Not done / open
- ISS-TOMBSTONE-009 open (bare-start and id-only residual; needs iCalUID/UID through apps/api and core, outside this unit). ISS-TOMBSTONE-001, -005, -007, -008 ledger rows: statuses not changed here.
- Constants are assumptions for the Approver: 24h windows, MATCHED_HORIZON_MS 30d, NEAR [-24h, +48h].
- No sender-binding for the bare-start tier (a bare invite has no organiser to bind).

# Verdict: calendar-unknown-tombstone-non-interference

VERDICT: FAIL
Cycle checked: 0
Commit checked: 2a19974 (lane/tombstone, base 01635f6)
Scope: fixtures only. The shape of Google's cancelled-event resource is assumed from fixtures and the mapper; it must be confirmed live. No network, browser or database was used.

## EXPLANATION

Direction 1 (outsider) is closed for calendar rows and linked pairs. Direction 2 (do not join a cancelled meeting) is re-opened by the narrowing, which is FAIL-level.

DIRECTION 2 (original hazard, ISS-WEBINARRELEASE-013 / D-060 floor). Built through real recon() + selectAutoRecordItems, 2 scopes x everyWebinar T/F (the four cells were identical in every case). Baseline with no tombstone: scheduled. Per tombstone shape beside an unlinked, approved Gmail copy of the cancelled meeting:
- id only: held (protected). All-day start (date only, unparseable): held. Recurring instance with only originalStartTime: held. Free-text link with or without start: held when start equal or absent.
- start only, same instant (including the same instant written +05:30): held. Offsets are normalised by `time()`.
- start only, Gmail start +1 min or 30 min off: SCHEDULED, i.e. the bot joins a cancelled meeting. Gmail starts are scraped from mail text by extractSessionDateTime and any timezone other than IST/UTC/GMT is read as IST (an "EST" mail yields 05:30Z for a 16:00Z meeting), so calendar and Gmail starts routinely differ. The base blocked all of these. Start equality is not a safe selector. ISS-TOMBSTONE-002 (high).
- trusted link + start: held only for the same normalised URL+start. Gmail zoom.us/w/ID?tk= against tombstone zoom.us/j/ID: SCHEDULED; same start with a different URL: SCHEDULED; same URL, Gmail +1 min: SCHEDULED. The identity tier drops the start fallback. ISS-TOMBSTONE-003 (high; whether a cancelled resource retains conferenceData is unconfirmed).
- known cancellation (id on record) still unschedules the meeting and its linked Gmail copy: confirmed (my 1,000 known-cancel runs, 0 violations; mutation killed).
Ruling: start-carrying tombstones must fall back to a broad hold unless identity is proven, or the match must be windowed; either way the broad hold needs an expiry.

DIRECTION 1 (outsider). The recorded ISS-T036CAL-011 reproduction (12/12 cells) reproduces. My independent property (2,000 seeded cases x 2 scopes x 2 modes = 8,000 runs, 8 tombstone shapes copying starts/titles/organisers/links of trusted rows, shuffled fetch order) shows calendar rows and linked pairs byte-identical with and without tombstones, newStartsBlocked unchanged, 0 violations; 500 tombstones took 32 ms (linear).
Residual: an id-only tombstone holds ALL unlinked Gmail rows. Over 5 ticks, both scopes, the tombstone leaves the fetch result after tick 0 and the hold stays on every tick, and 40 days later: one cancelled invite from any sender blocks email-only meetings permanently. Fresh/reset state: the available-scope baseline has no time filter, so every old deleted event is an unknown id-only tombstone; on a new deployment, or after any 410 reset, no email-only meeting is joined until those cancelled events disappear from the Calendar (effectively never). ISS-TOMBSTONE-001 is re-rated HIGH (ISS-TOMBSTONE-004): the unlinked-Gmail class is the Gmail source's purpose, so it is the main case, not an edge (prevalence not measured). The unit may not PASS with it open: the HIGH issue's main path remains.
Start-copy attack (shape ii): reproduced; an outsider tombstone carrying a public webinar's start holds the unlinked Gmail row for it, all 4 cells (ISS-TOMBSTONE-005, medium; subsumed by 004 while id-only holds everything).

Changed assertion (webinar-policy.test.ts, "known actual-wire and id-only cancellations ..."): the old expectation (blocked, empty feeds, replay blocked) beside a proven pair is the literal D-060 acceptance floor text ("unknown tombstone empty effective feeds/gate", repair plan line 210). Relaxing it is semantically right for the proven pair, but it changes an acceptance-floor assertion and no DECISIONS entry amends the floor. It needs an Approver-recorded supersede (Umesh) before merge, not a silent test edit.

Gates: unknown-tombstone tests 8/8 and 2/2; webinar-policy 19/19 (29 across the three files); schedule-state 18, auto-join 39, schedule-tick 14, join-rules-select 11, optout-identity 22, link-source alias 9 / allowlist 4 / reconcile 7: all pass. `tsc --noEmit -p packages/meeting-bot`: exit 0. `lint-dirsize`: OK. calendar/ loose files 29 (limit 30). calendar-client.ts 257 lines. `lint-dupes`: FAIL, 6 violations; 5 pre-existing on the base (fixed on main by 06d24fb), 1 new: `export 'Row'` in tombstone-fixtures.ts (ISS-TOMBSTONE-006). `git merge-tree` against codex/machine-migration-2026-10-09: clean, no conflicts.
Mutations (13, own harness, per-mutation byte backup, finally-restore, each restored file's hash equals HEAD): 12 killed, 1 SURVIVED. The survivor is the start match made approximate (+-5 min): no test has a near-miss, which is contract item 5. Killed: unknown tombstone blocks starts (M1), ignored entirely (M2), start-only holds nothing (M3), identity by start only (M4), free-text link as identity (M5), hold on linked pairs (M6), known cancellation leaving the linked copy (M7), id-only residual removed (M8, killed by a D-060 test), one scope only (M10), held rows in feeds in legacy (M11), unlinked never held (M12), any-start match (M13).

ISSUES-WRITTEN: ISS-TOMBSTONE-002 (high), 003 (high), 004 (high, re-rate of 001), 005 (medium), 006 (medium)

## What of ISS-T036CAL-011 is closed
Closed: trusted Calendar rows, linked pairs and `newStartsBlocked` are no longer affected by an outsider's unknown tombstone (both scopes, both modes). Not closed: the unlinked Gmail class (email-only registrations) is still blocked by one id-only tombstone with no expiry, and the narrowing newly lets a cancelled meeting's Gmail copy be joined when the tombstone carries a start or link that does not match exactly. ISS-T036CAL-011 cannot be marked verified.

## Merge conditions (all required)
1. Fix ISS-TOMBSTONE-002/003: no exact-start or exact-identity selector alone; add a near-miss test and a differently-formed-link test that kill the approximate mutation.
2. Fix ISS-TOMBSTONE-004 or obtain an explicit Approver decision (Umesh) accepting the permanent id-only hold; at minimum an expiry (stored first-seen tick or providerUpdated bound) and a documented operator release.
3. Rename `Row` (ISS-TOMBSTONE-006) so lint-dupes adds no violation.
4. Approver-recorded amendment of the D-060 floor for the changed webinar-policy assertion.
5. Live confirmation of Google's cancelled-resource shape (id-only vs start/conferenceData).
Contract: qa/contracts/calendar-unknown-tombstone.md.

---

# Cycle 1 (re-check of fix commit bf6da56, lane/tombstone)

VERDICT: PASS
Cycle checked: 1
Commit checked: bf6da56 (base 01635f6; the lane is behind main and imports resolve through shared junctions; no failure was traced to that)
Scope: fixtures only. No network, browser or database. Google's cancelled-resource shape is still assumed.

## EXPLANATION

Contract items 1-5 hold for the stated criteria. This is the unit's PASS only; it cannot merge on this verdict alone (merge conditions below).

Counts re-derived (real recon() + selectAutoRecordItems, 2 scopes x 2 modes): ISS-T036CAL-011 12/12 (maker 12/12); ISS-TOMBSTONE-001 2/2; -002 16/16 (4 recorded probes x 4 cells, ledger shapes replayed verbatim); -003 20/20 (5 probes x 4); -004/001 6/6 (5-tick, 40-day and fresh-state cases), plus my own: an old-dated tombstone holds nothing, and the first-seen stamp survives refetch and a JSON round trip of state; -006 fixed (lint-dupes 5 violations, none for Row, all pre-existing; the rename touches only the tombstone folder). P1 3200 runs and P2 1076 runs: 0 violations. Not replayed as a refusal: ISS-TOMBSTONE-005 (left open, see below). Tests: non-interference 12/12, property 2/2, webinar-policy 19/19, schedule-state 18/18, auto-join 39/39; tsc exit 0.

FAIL-OPEN (a cancelled meeting's Gmail copy still joined; checked with the selector at the meeting's own tick, tombstone no longer fetched): start-carrying tombstone, copy +23h held, +25h and -25h NOT held, +30h joined; id-only, copy +13d held, +15d/+16d joined; recurring-instance tombstone (originalStartTime only) with copy +30d joined; cancelled master with the series first start, later instance +21d joined; rescheduled copy +3d joined. Held: all-day, different id and title with start within 24h, EST misread. These gaps are the price of contract item 4 (expiry); they were previously covered by a permanent blanket. Filed as ISS-TOMBSTONE-008 (medium).

SUPPRESSION BY AN OUTSIDER. Calendar rows, linked pairs and newStartsBlocked are never affected. Unlinked Gmail rows: a start-less cancelled invite holds EVERY unlinked Gmail row starting in [T-24h, T+14d] regardless of title, organiser or sender (organiser evil@attacker.example, title "spam", unrelated meeting +3d: held); a start-carrying one holds everything within +-24h of its start. A held row is lost for good (the hold depends on the row start, not on current time). Expiry is real: the stamp is set only for a key absent from stored state, is stored in the persisted occurrence (snapshot.providerUpdated and revision), is not moved by refetch (days 1/5/13, 20-day refetch, JSON round trip), and an old Google `updated` holds nothing. But it is renewable: each NEW cancelled id gets its own T, so one send-then-cancel every 14 days or less suppresses all email-only meetings continuously (day 13 new id re-held a day-20 row; still held at day 14.5 and day 30). Bounded in time per invite, not removed. Not FAIL-level: the contract's boundedness criterion (a stored tombstone must not hold forever) is met, and binding the hold to the sender is an Approver decision the maker flagged (005, 007). Sharper form filed as ISS-TOMBSTONE-008.

Mutations (7 own, harness tombstone-chk-mut, per-mutation byte backup, finally-restore; every touched file hash equals HEAD, git status clean): 6/7 killed: drop expiry (Infinity), start window 24h to 1 min, drop first-seen stamp, invert span comparison, re-stamp every tick, horizon 14d to 365d. SURVIVED: lead slack 24h to 0 (rows starting just before the cancellation time no longer held; the maker reported a lead-slack mutation killed, mine or its test scope differs). Low, note only: no test pins the pre-cancellation lead.

ISSUES-WRITTEN: ISS-TOMBSTONE-008 (medium). Verified fixed: ISS-TOMBSTONE-002, 003, 004, 006. ISS-TOMBSTONE-001 stays open (reduced to the windowed hold; covered by 005/007/008). ISS-T036CAL-011 stays OPEN (not verified: residuals above plus the merge conditions).

## Merge conditions (carried from cycle 0, quoted)
- "4. Approver-recorded amendment of the D-060 floor for the changed webinar-policy assertion." NOT done (no DECISIONS entry; the maker says so). This BLOCKS merging: the changed assertion is the D-060 acceptance floor text and needs an Approver entry (Umesh). Not waived.
- "5. Live confirmation of Google's cancelled-resource shape (id-only vs start/conferenceData)." NOT done. It BLOCKS merging as written, and decides how reachable the start-less blanket (008) is.
Conditions 1, 2 (expiry; the "documented operator release" is not added, a state reset clears) and 3 are met. Open for the Approver: constants (14d / 24h) and whether to bind the hold to the sender (008).

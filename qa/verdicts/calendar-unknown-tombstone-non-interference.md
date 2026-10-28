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

---

# Cycle 2 (re-check of fix commit 7fc113f, lane/tombstone)

VERDICT: PASS
Cycle checked: 2
Commit checked: 7fc113f (parent 9e0450a). Fixtures only; no network, browser, database or Google call.

## EXPLANATION

Re-derived through real recon() + selectAutoRecordItems. Replays: ISS-T036CAL-011 12/12; TOMBSTONE-001 2/2; -002 16/16; -003 20/20; -004 6/6; -008 outsider suppression 30/30 none; -008 matched shapes 44/44 held, bare/id-only 36/36 not held (nothing to match). Tests: matched-hold 10/10, non-interference 11/11, property 2/2, webinar-policy 19/19, schedule-state 18/18, auto-join 39/39; tsc 0.

(1) Organiser and host+title (own probes). Outsider organiser + different title + victim's start: NOT held. Outsider organiser + copied public title + start 10 days away + no link: NOT held (title alone never matches; host is needed). Host as organiser with another title, row +3d: NOT held. So an outsider cannot hold a legitimate meeting by start alone WHEN Google sends an organiser. Weaknesses: (a) a bare-start tombstone has no organiser (11/15 live), so START applies to any sender: a bare start equal to the victim's start, or 23h off, holds the row (ISS-TOMBSTONE-005, unchanged, named by the maker); (b) a copied title cancels the other-party guard, so outsider organiser + copied title + victim's start is held (no more reach than the bare form); (c) HOST compares Google's organizer with row.senderEmail and does not require senderAuthenticated; an iCal ORGANIZER spoofed to equal the host plus a copied title would hold the host's same-title rows for up to 30 days. Gmail/Google sender checks are the barrier; not reproducible offline. Filed in ISS-TOMBSTONE-010.

(2) Id-only residual. Measured: any unlinked Gmail row starting in [T-24h, T+48h] is held whatever its title or sender (T-23h..T+47h held; T-30h, T+49h, T+60h free); one fresh id-only cancelled invite every <=72h holds email-only meetings continuously. Reachability: the live check was baseline only (0/15 id-only), but production uses syncToken incremental sync (gws-calendar.ts), whose documented deleted-entry form is id plus status; an outsider invite created and cancelled between two ticks would arrive so. Not observed live. Rating MEDIUM (bounded to 72h windows, needs repeated sends and an unconfirmed shape; HIGH if an id-only outsider tombstone is confirmed in sync mode). The deviation is forced by the unamended D-060 assertion 'available-source coverage'; NEAR constants to 0 removes it but needs a further Approver amendment. Left to the Approver.

(3) Changed -004 expectation: legitimate. It used to assert a row six days out is held by an id-only tombstone (14-day blanket); it now asserts it is free. That narrows an outsider-exploitable hold; the imminent [T-24h, T+48h] hold, the 40-day expiry and the first-seen pins are still asserted. Cost: a fail-open for a genuinely cancelled meeting whose unlinked copy is more than 48h away (ISS-TOMBSTONE-009), accepted and named.

(4) ISS-TOMBSTONE-009 likelihood: moderate-low. With start always present live, a cancelled meeting's copy at the same time (or within a 20h timezone misread) is held. Not held: rescheduled copies, later instances of a cancelled series, id-only tombstones with a copy beyond 48h; each also needs the calendar event never stored live and the Gmail copy unlinked. Rare, not common.

(5) Merge conditions. 4: satisfied as written: D-129 (scope corrected by D-130) records the Approver amendment of exactly the changed assertion ('known actual-wire and id-only cancellations ...', the only webinar-policy edit in the lane diff). 5: satisfied as written for the baseline shape (summary.md: 15/15 carry start/end/iCalUID/updated; 4/15 organiser/title/conference data; none id-only). Not covered: never-accepted outsider invites and the syncToken deletion form (ISS-TOMBSTONE-010). Conditions 1-3 met in cycle 1.

(6) Merge prediction: git merge-tree --write-tree --name-only lane/tombstone 70b7b0ef (main checkout HEAD): clean, no conflicting files (tree 0f6d12e2).

(7) Mutations (own, per-mutation byte backup, restore after each, git hash-object == HEAD:file 89810236 after each; harness deleted; status clean): drop organiser check -> matched-hold red; widen start window 24h to 7d -> both suites red; id-only hold forever (NEAR_AHEAD huge) -> both suites red. 3/3 killed (organiser-drop killed by one test only).

ISSUES-WRITTEN: ISS-TOMBSTONE-010 (medium). Verified fixed: ISS-TOMBSTONE-008 (blanket and renewable hold removed for organiser/link/title-bearing shapes; residuals in -009/-010). ISS-T036CAL-011 stays OPEN (bare-start 005, id-only NEAR, -009, -010). ISS-TOMBSTONE-005 remains open.

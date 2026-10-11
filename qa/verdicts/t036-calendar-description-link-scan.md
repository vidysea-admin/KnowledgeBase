# Verdict: t036-calendar-description-link-scan

VERDICT: FAIL
Cycle checked: 0
Commit checked: 9bc316c (branch lane/t036cal, base 8520fa8)
Scope: fixtures only; not validated against live Google Calendar; field presence (`description`/`location` in the default event resource) and real HTML shapes unverified. No network, browser or DB used.

## EXPLANATION

Why FAIL: one HIGH finding on the trust path, plus four medium findings. The extractor itself is careful and most of what was asked passes; the unit fails because it makes outsider-chosen text joinable with no provenance and no gate.

### 1. Trust and provenance (HIGH, ISS-T036CAL-001)
- Trace (probe, not reading): `resolveEventMeetingLink` returns `{url, source:"description"}`; the mapper in gws-calendar.ts keeps `link.url` and DROPS `link.source`. The mapped event is indistinguishable from a conference-data event. `schedule-tick.ts:203` runs production with `everyWebinar:true`; `auto-join.ts:78` treats every calendar organizer as `senderVerified:true`. Fed to `selectAutoRecordItems`: title "Free Webinar: Win a prize", organizer attacker@evil.com, description "Join our Webinar: https://zoom.us/j/123456789?pwd=zz": everyWebinar true -> toSchedule 1, skipped none; everyWebinar false -> untrusted-sender; same event with no link (the pre-change shape) -> no-join-link.
- (a) Reachable today? For Gmail candidates yes (ISS-376, open); for Calendar events, only for conference data (outsider ICS invites put the Zoom/Teams link in LOCATION/DESCRIPTION, not conferenceData). (b) This unit WIDENS it: events that were unjoinable become auto-recorded in production mode, from a channel with no sender authentication at all, where the Gmail side now requires authenticated sender or approval (D-122 ruling 1). (c) No provenance marker; default today is "joinable". Ruling: a unit on this path cannot PASS without the marker.
- Cycle 1 must add: `meetingUrlSource: "conference"|"location"|"description"` on `UpcomingMeeting` (set from `link.source`), tested in the mapper and over HTTP; the manifest statement that free-text links must not be auto-joined without the Gmail-equivalent trust gate; and a safe default (the scheduler loader ignores non-conference sources, or free-text links go under a separate non-joinable field). The trust policy itself need not be built here. Contract: qa/contracts/calendar-free-text-links.md.

### 2. Wrong-meeting extraction (own probes: 37 named cases, 400 generated fuzz inputs, 0 violations of "output is one of the planted join URLs and canonical-recognised")
Pass: href judged not text (`<a href="https://evil-zoom.us/j/123456789">https://zoom.us/j/111111111</a>` -> none; href zoom/text evil -> zoom); redirect unwrap only `https://www.google.com/url?q=` (other host, google.com without www, nested -> none); `&amp;amp;` decoded once (becomes `&amp;`); forwarded plus previous link, personal-room signature, "moved from old + new" -> ambiguous (safe, recall loss); join + registration -> join; registration only -> registration-only; join + /rec/ link -> join; /u/ dial-in ignored; location single wins over description; location 2 links -> ambiguous; Teams long URL, Meet in text, markdown, angle form fine; link split by newline or `<br>` -> none; HTML comment ignored; http, `//`, `javascript:`, userinfo, port, trailing dot, host-in-path, `zoom.us\@evil.com` -> none.
Findings: dedupe keeps the first variant, so `https://zoom.us/j/999999999 https://zoom.us/j/999999999?pwd=SECRET` returns the passcode-less URL (reverse order keeps pwd): deterministic but wrong choice (ISS-T036CAL-003). Zoom `/s/…?zak=TOKEN` host start link accepted and returned (ISS-T036CAL-005). Text inside `<script>`/`display:none` is scanned (same attacker control as visible text; note).

### 3. Duplicate recogniser (ISS-T036CAL-002, -004)
Differential, 1315 constructed URLs (12 accepted hosts + 25 hostile hosts x 35 paths x schemes) against `planSendNow`/`meetingIdentity`: 121 accepted by both with identical identity in all 121; 0 accepted by canonical only (4 apparent ones were leading-space artefacts and `registration` classification of Zoho register URLs, intended); 42 accepted by the copy and refused by canonical: 38 embedded-redirect (`?redirect=https://evil.com`, `?url=//evil.com`, `?next=%2f%2fevil.com`, `?x=https%3A%2F%2Fevil.com`, double-encoded) and 2 `https:/zoom.us/...` hrefs normalised by URL. The manifest's claim that the join path applies `hasEmbeddedRedirect` downstream is false for the auto path (only `planSendNow`, called only by send-now-command.ts). Drift guard: mutating the copy to accept an extra host (zoomgov.com) or `endsWith("webex.com")` (accepts evilwebex.com) SURVIVES all 28 tests. Ruling: a second recogniser list is acceptable in a PASSed unit only with a differential test over a shared corpus in the same unit; the move to packages/core need not come first.

### 4. Host safety: suffix/prefix, userinfo, backslash, encoded slash, IDN/fullwidth, zero-width, port, trailing dot, http, javascript:, data:, protocol-relative, uppercase: none accepted beyond what the canonical accepts (uppercase and fullwidth dot normalise to the real host, same as canonical).

### 5. Privacy: sentinels (fake passcode, email, text) planted in description/location: absent from the API rows, from the thrown error ("Calendar discovery unavailable") and from `meetingLinkIssue` (enum values only: ambiguous, registration-only). A `pwd=` inside an extracted link is returned only in `meetingUrl`, as for conference links.

### 6. Default parity: new mapper vs `git show 8520fa8:apps/api/src/gws-calendar.ts` over the same fixtures: conference-bearing events byte-identical (even with description/location present); events with no text byte-identical; `meetingLinkIssue` appears only on ambiguous/registration-only rows. apps/web types: plain TS interfaces, no strict schema, unknown key ignored.

### 7. Bounds: 1 MB text, 1 MB with link at end/start, 10,000 URLs, 10,000 unclosed `<a`, 100k `<`, 20,000 nested divs, `</a` x30k, entity floods, 100k URL, 40k `](`: all under 30 ms, no crash, linear (unclosed `<a` 2k = 10 ms, 8k = 18 ms). Note: text beyond 100,000 chars or the 200th candidate is ignored, so a second join link past those bounds is not seen.

### 8. Placement: join-rules is a misnomer (calendar link extraction is not a join rule; apps/api/src is 31/31). No import cycle: the extractor imports nothing; gws-calendar imports it. Note only.

### 9. Gates: calendar tests 14/14, extractor 14/14, gws-gmail 25/25, `tsc --noEmit -p tsconfig.json` (apps/api) clean, dirsize/loc fail only on unrelated packages/index/src/pipeline and sb_join.py. Diff touches only the 6 intended files. `git merge-tree` with codex/machine-migration-2026-10-09: clean (tree 41701cf, no conflicts); join-rules has 11 files after merge (limit 30).

### 10. Mutations (own harness, per-mutation byte backup, finally-restore, hash equals HEAD blob after every run, harness deleted): 15 run; 12 killed, 3 survived. Killed: description-over-conference (extractor test), visible text used, redirect unwrap any host, registration treated as join, ambiguity first-wins, zoom host endsWith, sentinel text in `meetingLinkIssue` (calendar test), dedupe keep-last (killed only because the existing test pins first-wins), zoom id digits 5->1, userinfo allowed, desc-beats-location, http allowed. SURVIVED: extra host added to copy (M10a), webex `endsWith` (M15), `/s/` removed (M14, no test pins it either way).

ISSUES-WRITTEN: ISS-T036CAL-001 (high), ISS-T036CAL-002, -003, -004, -005 (medium); in qa/issues.t036cal.jsonl.

## Merge conditions (cycle 1)
1. ISS-T036CAL-001: `meetingUrlSource` on the mapped event, tests, manifest statement, safe default. Required.
2. ISS-T036CAL-002: embedded-redirect refusal in the copy with the 38-URL corpus; fix the manifest sentence.
3. ISS-T036CAL-004: differential test over a shared corpus (copy-join implies canonical-join, same identity) plus webex/zoom suffix cases; this kills M10a and M15.
4. ISS-T036CAL-003 and -005 (passcode-preferring dedupe; refuse /s/ and zak=) with tests; may be verified inside the same cycle.


---

# Cycle 1

VERDICT: FAIL
Cycle checked: 1
Commit checked: 5fe97b9 (branch lane/t036cal, base 8520fa8)
Scope: fixtures only; not validated against live Google Calendar; field presence (`description`/`location` in the default event resource) and real invite HTML unverified. No Google call, browser, database or build; local loopback test server only. `@lkb/core` junctions verified first (both point at C:\Users\product\Desktop\KnowledgeBase\packages\core, untouched); type-check and runtime used a temporary `paths` tsconfig onto this lane's core, deleted afterwards.

## EXPLANATION

Why FAIL: the HIGH attack of cycle 0 is closed, and I could not get a free-text link scheduled by any route. But the fix introduces one new HIGH regression in the persisted-state path (ISS-T036CAL-006) and leaves existing tests red (ISS-T036CAL-007). Both are narrow; the next cycle is small.

### 1. The attack is closed, end to end (own probe through the real functions)
API mapper (`listUpcomingGwsMeetings` with a fake `gws` run) -> real Express route over loopback -> real `createHttpCalendarLoader` -> `selectAutoRecordItems`. Outsider event "Free Webinar: Win a prize", organizer attacker@evil.com, six carriers: description plain, location plain, description anchor, location anchor, Google redirect wrapper (text and anchor). Also the same six with a trusted organizer.
- everyWebinar true/false x organizer trusted/untrusted: 12 free-text events x 4 modes: never scheduled; every one skipped `unverified-link-source` (48/48 asserted). Conference twins (hangoutLink, conferenceData entry point): scheduled as before (every-webinar; trusted non-every-webinar; untrusted non-every-webinar stays untrusted-sender, unchanged).
- Conference plus free text in one event: the returned URL is the conference one and the source says conference (4/4).
- Paths tried to schedule a free-text link anyway: (a) missing source: our mapper sets the source whenever a url exists (asserted over 20 rows); legacy/missing is read as conference by design; a stripped source in a hand-edited persisted state file schedules (needs local file access; noted). (b) allow-list: 29 bad values (`"Description"`, `"desc"`, `1`, `null`, `["description"]`, `""`, padded or cased `conference`, 32-char, zero-width, NUL, newline, objects, booleans) through both the direct loader path and `reconcileWebinarSources`: non-strings, control characters and >32 chars are REJECTED closed (whole reconciliation throws); every other string is kept as-is and skipped. None dropped, none scheduled, 0/58 runs. (c) Gmail-linked copy: a Gmail row linked to a free-text calendar event inherits that URL AND its source and is skipped (approved authenticated row and pending row alike); a Gmail row with a different meeting of its own is scheduled on its own trust and the calendar item is skipped; a Gmail row cannot carry a source (allow-list rejects the key), so no relabelling. Note (usability, safe direction): an approved Gmail webinar whose calendar twin has the link only in the description is now skipped. (d) persistence: source survives JSON round trip and a later tick where the event is absent (still `description`, still skipped). (e) other feeders: Gmail candidates carry no source and keep their own trust rules (unchanged, ISS-376 open); the attendance selector in run-pipeline (`selectVerifiedCalendarMeetings`) does not read the source but a free-text event is skipped `needs-review` there because its fingerprint (raw observation has conference data only) never matches; `selectEventsToAutoJoin` has no production caller. Both noted as ISS-T036CAL-009 (low).

### 2. Operator-visible behaviour
Skipped item text is truthful and URL-free ("link found in the invite text, not verified, so the bot will not join it automatically; if you trust the invite, send the bot to it manually (send-now)"); sentinels (text, e-mail, passcode, zak) absent from rows, errors, enum fields and tick logs; an invalid source string is not echoed. brain.ts, telegram `NOTIFIABLE_REASONS` and run-pipeline `OPERATION_REASONS` all derive from or list the 15th reason and compile. The attention-alert formatter has no case for it: it is ignored as `no-alert-for-reason:unverified-link-source` (no alert, no title shown). run-pipeline turns only five reasons into operations, so no operation/Telegram alert either: an attacker spamming invites produces log lines only (note, no alert noise). Web shows "unverified link source" neutrally.

### 3. Recogniser parity
Differential test 3/3. My own fresh corpus (different seed and construction): 15,182 URLs including a regenerated embedded-redirect family of 7,904 (19 key names x 13 value forms x all platforms; the cycle-0 verdict did NOT record its 38 URLs and its harness is gone, so they cannot be run verbatim: the recorded 6 plus this family were run instead), host tricks (userinfo, ports, IDN and fullwidth dots, trailing dot, encoded dots, `@`, backslash), path tricks, schemes: both accept 560 with equal identity and URL; canonical-only 118 (copy stricter); copy-only 0. Through the resolver (description/location, anchors, markdown, angle, Google wrapper; 5,372 returned links): all canonical-accepted, none with zak. The two cycle-0 survivors (extra host zoomgov; webex endsWith) are killed by the differential. The differential imports packages/meeting-bot by relative path, i.e. this worktree's files; `git diff 8520fa8 5fe97b9` on platform.ts and send-now.ts is empty.

### 4. D-015 counts
001: 12 events x 4 modes = 48/48 not scheduled (plus 4/4 of the row's own probe shape in the maker's test). 002: 6/6 recorded URLs refused (recognise, description, location, anchor); the 38 are unrecoverable (see above), family run instead. 003: plain-then-pwd and pwd-then-plain both return the pwd URL; pwd=A vs pwd=B ambiguous in both orders (3/3). 004: 4/4 refused (zoomgov, evilwebex x2, us02web.zoomgov). 005: 11/12 shapes never returned; the 12th, `?zak` with no `=` and no value, is returned but carries no token (the claim "no URL containing zak is ever returned" is slightly broader than the rule; harmless). Host plus join of one meeting returns the join link without the token; host alone gives `host-start-link`.

### 5. The four changed assertions
Extractor "first URL kept" now uses one passcode in both URLs: legitimate (two different passcodes are now ambiguous, pinned by a new test). Leakage regex `"(description|location)"` -> `"(description|location)":`: not weakened in effect (it was a key check; the new enum VALUES legitimately match; the sentinel assertions on the free text remain and my own sentinel run is clean). Parity test gains `meetingUrlSource: "conference"`: correct for the shape, but it hides ISS-T036CAL-006 (the persisted comparison). SKIP_REASONS 14 -> 15: correct; but two more hard-coded 14s exist (ISS-T036CAL-007).

### 6. Default parity
Old `auto-join.ts` from 8520fa8 loaded in a temp module vs new: 864 full selections (288 times x everyWebinar true/false/undefined; 500 seeded events, 150 candidates, mixed sources, trusted/untrusted, duplicates, cancelled, bad URLs) byte-identical; 864 items scheduled in total, no `unverified-link-source`. Selection parity holds; persisted-state parity does NOT (ISS-T036CAL-006).

### 7. Type safety
tsc exit 0 for packages/core, packages/meeting-bot and apps/api against this lane's core via a temporary paths tsconfig (total `Record<SkipReason,...>` in brain.ts and skip-describe.ts compile). Negative control: apps/api against MAIN's core fails only at brain.ts:31 (unknown key), as expected before the merge. On the trial-merged tree the same three type-checks are clean.

### 8. Merge readiness
`git merge-tree` with codex/machine-migration-2026-10-09 (a3ad969): clean, tree 4352065. Trial merge (`--no-commit --no-ff`, aborted, worktree clean): SKIP_REASONS has 15 values; brain.ts and skip-describe.ts totals include the new one; dirsize OK; apps/api/src/join-rules 12 files (limit 30); packages/meeting-bot/src/calendar unchanged by this lane (26 entries as at base; 27 on the merged tree from main). But the merged tree has 4 red tests: alert-who-production.test.ts (2, main-only file) and skip-reason-vocabulary.test.mjs (2): ISS-T036CAL-007.

### 9. Gates
Extractor 17/17, differential 3/3, calendar 15/15, gws-gmail 25/25; meeting-bot auto-join 39/39, schedule-tick 14/14, webinar-policy 19/19, schedule-state 18/18, join-rules-optout-identity 22/22, join-rules-select 11/11, alert-title-policy 12/12 and telegram-channel 6/6 (against the lane's core), api brain 11/11; scripts/webinar/skip-reason-vocabulary 1 of 3 pass (2 FAIL). `lint-dirsize` and `lint-loc` fail only on packages/index/src/pipeline and sb_join.py (unrelated).

### 10. Mutations (own harness, per-mutation byte backup, finally-restore, 240 s kill, hash equals HEAD blob after every run, harness deleted)
17 run, 17 killed. M1 non-conference scheduled in every-webinar mode; M2 invalid source dropped by the allow-list; M3 location source lost in mapper; M4 source lost in Gmail-linked copy; M5 conference+free text returns free text; M6 embedded-redirect check removed; M7 webex endsWith; M8 passcode-less duplicate kept; M9 zak accepted; M10 reason mapped to no-join-link; M11 normalizeCandidate drops source; M12 normalizeCalendarEvent drops source; M13 `/s/` accepted again; M14 mapper hard-codes conference; M15 null treated as missing; M16 case-insensitive compare; M17 extra host zoomgov. Note: M2 (the dangerous seam) is killed only by my probe, not by the lane's suite (ISS-T036CAL-008).

### 11. The new HIGH finding (ISS-T036CAL-006)
Through `prepareWebinarSourceState` (the production webinar-release path): a persisted state written by the pre-unit mapper shape, then the same event (same `updated`) from the cycle-1 mapper (now carrying `meetingUrlSource: conference`) -> `contradictory-revision`, event absent from `calendarEvents`, transition `unresolved`, and it stays dropped on later ticks until the event is edited. With legacy scope all new starts are blocked. Fail-closed, so no wrong join, but after deploy every already-known upcoming webinar would stop being auto-recorded. Whether production has such a persisted state is not verified here.

ISSUES-WRITTEN: ISS-T036CAL-006 (high), -007 (medium), -008 (medium), -009 (low); ISS-T036CAL-001..005 marked `verified-cycle1` in qa/issues.t036cal.jsonl.

## Merge conditions (cycle 2)
1. ISS-T036CAL-006: persisted comparison unchanged for existing rows (prefer: mapper emits `meetingUrlSource` only for location/description, missing = conference), with a prepareWebinarSourceState test (old state + same-revision event still scheduled, no unresolved/transition); update the contract item 1 accordingly.
2. ISS-T036CAL-007: fix the two literals in scripts/webinar/skip-reason-vocabulary.test.mjs; rebase onto main and add the unverified-link-source fixture and EXPECTED row in alert-who-production.test.ts; paste the green runs.
3. ISS-T036CAL-008: add the allow-list variants test (never dropped, never scheduled).
4. Keep: provenance field, skip in any mode, differential test, recogniser parity, passcode and host-start rules (all verified).

## Standing statement for the owner
Free-text calendar links are found but never auto-joined. Whether they may ever be auto-joined, and how a calendar event is approved (no approval path exists for calendar events), is the Approver's decision (Umesh); nothing in this unit decides it, and ISS-376 (record-every-webinar skips the sender-trust check for Gmail candidates) remains open and separate.


---

# Cycle 2

VERDICT: FAIL
Cycle checked: 2
Commit checked: fbb4cfc (branch lane/t036cal, on top of checker commit fadfd19)
Scope: fixtures only; not validated against live Google Calendar; real invite HTML and the default event resource fields unverified. Loopback test server only; no Google call, browser or database. `@lkb/core` junctions re-verified (both point at C:\Users\product\Desktop\KnowledgeBase\packages\core, untouched); type-check and runtime used temporary `paths` tsconfigs inside the worktree, deleted afterwards.

## EXPLANATION

The cycle-2 changes are correct and safe: 006 to 009 are verified and no path schedules a free-text link. The verdict is FAIL for one HIGH finding that cycles 0 to 2 all left in place and that I should have found in cycle 0: an outsider can block a legitimate conference meeting (ISS-T036CAL-010).

### 1. The new reconciliation rule (provenance ignored in identity; fresh snapshot stored)
Through `prepareWebinarSourceState` (production path) then `selectAutoRecordItems`: full table {absent, conference, location, description, garbage} persisted x fresh x {same url, different url} x {same revision, newer revision} = 100 cells: scheduled url always the fresh one; a free-text effective source is never scheduled (0 violations); same revision with a different url stays `contradictory-revision` (dropped, not scheduled); stored source always equals the fresh source except the guard (fresh copy with no source never relaxes a stored free-text source for the same url, confirmed for two consecutive ticks). Specific cases: persisted conference U1, fresh description U2 (same or newer revision): not scheduled, stored description. Persisted description, fresh conference same url: scheduled (Google vouches). Same-revision duplicates in one fetch (meetings plus sourceEvents), 5 orders: the less trusted source wins every time, nothing scheduled. Gmail-linked downgrade: a Gmail row (pending, unauthenticated, free-text link) with the same meeting does NOT touch the calendar event (separate occurrence): legit conference event still scheduled, Gmail row skipped `duplicate-session`; Gmail row for another meeting at the same time loses `overlap-lost`. Newer-revision, different url, fresh source absent is scheduled: only an old API build or a hand-made row can produce an absent source; noted, not outsider-reachable.

### 2. Persisted state and real contradictions
006 reproduction verbatim, 3 further ticks: event stays, no unresolved inventory reason, no transitions. 50 legacy events: 50 events after the new tick, deep-equal apart from the added field. Real contradiction detection intact: same revision with a different title or a different start time is still `contradictory-revision`; a newer-revision title change is accepted; a cancellation yields a `cancelled` transition. Mutations on the dispute set and on the title in the comparison are killed.

### 3. Attack and parity
Cycle-1 48-case probe re-run (6 carriers x 2 organizers x every-webinar true/false x trusted/untrusted): 48/48 not scheduled, all `unverified-link-source`; the conference twin scheduled. Default parity against the 8520fa8 selection: 864 full selections identical, 856 items scheduled.

### 4. ISS-007 and the alert ruling
Vocabulary test 3/3 on the lane. Alert decision: a free-text skip raises no alert and no Telegram operation (formatter ignores it by name; run-pipeline creates operations for five reasons only). Ruling: acceptable and correct against invite spam; the cost, for the owner: a legitimate meeting whose organiser put the link only in the description is neither recorded nor alerted, and is visible only in the operator's skipped list and the tick log (the skip line says to use send-now). Merge edit validated by simulation on a trial merge with main 3c7a8e8 (merge-tree clean, tree 421bfa2): the UNEDITED `packages/meeting-bot/src/alert-who-production.test.ts` fails exactly 2 of 4; with the three edits below it passes 4/4. Note the file is `packages/meeting-bot/src/alert-who-production.test.ts` (not under calendar/alerts). No other test on main breaks at 15: every other hit for `rules-unevaluable` or SKIP_REASONS (brain.test.ts list, join-rules-enforce*, optout-identity, telegram, alert-title-policy, vocabulary) is non-exhaustive or derives from the core list, and ran green on the trial merge.

### 5. ISS-008, ISS-009, ISS-005
Allow-list tests (4) and reconcile tests (7) green; mutation "invalid value dropped by the allow-list" is killed by the named lane test `ISS-T036CAL-008: an invalid STRING is kept as-is...`. `selectEventsToAutoJoin` guard and attendance guard present and tested (mutations killed). Bare `?zak` and `?zak&...` refused; 005 14/14 (12 recorded plus 2 bare forms); `pwd=abcZAKdef` and `zakx=1` still returned.

### 6. D-015 by my own run
001 48/48; 002 6/6 (the 38 remain unrecoverable; family covered in cycle 1); 003 3/3; 004 4/4; 005 14/14; 006 reproduction 3 ticks plus 50 legacy; 007 vocabulary 3/3; 008 allow-list 4 tests plus 29-variant probe earlier; 009 selectEventsToAutoJoin trusted 2/2, untrusted 6/6 not selected, attendance guard test green.

### 7. Mutations (own harness, per-mutation byte backup, finally-restore, hash equals HEAD blob each run, harness deleted)
12 run, 11 killed. Killed: source back in identity (006 regression); fresh-absent relaxes stored free-text; more trusted wins; dispute set disabled; title ignored in the comparison; invalid source dropped; alert raised; attendance guard removed; bare zak accepted; selectEventsToAutoJoin guard removed; free-text source upgraded to conference. SURVIVED: keepSource ignoring url equality (M10): the mutant is stricter (keeps the free-text source for a newer, different url), so it denies rather than admits; not a safety gap.

### 8. Gates and merge
Extractor 17, differential 3, calendar 15, gws-gmail 25; auto-join 39, schedule-tick 14, webinar-policy 19, schedule-state 18, link-source 4 and 7, attention-alerts 11, alert-title-policy 12, telegram 6, optout-identity 22, attendance 33, vocabulary 3. tsc exit 0 for core, meeting-bot, api on the lane and on the trial-merged tree. dirsize/loc fail only on unrelated packages/index/src/pipeline (lane) and sb_join.py. Calendar dir 25 files plus two subdirs (new tests are in link-source/); merged tree 29 (limit 30); apps/api/src unchanged (31/31); join-rules 12. Trial merge (no-trace, aborted, worktree clean): SKIP_REASONS 15 values, brain.ts and skip-describe.ts totals include the new reason.

### 9. The HIGH finding (ISS-T036CAL-010)
Legit conference event plus an outsider event with the same start whose description repeats the meeting link: both become `ambiguous-identity`, `calendarEvents` empty, transitions `unresolved`, nothing scheduled (production path; legacy scope blocks all starts). Reachable by any outsider who knows a public webinar link and its start and whose invite reaches the calendar.

ISSUES-WRITTEN: ISS-T036CAL-010 (high). ISS-T036CAL-006..009 marked `verified-cycle2`.

## Merge conditions (cycle 3 and merge close-out)
1. ISS-T036CAL-010: rows with a present non-conference `meetingUrlSource` contribute no aliases; test legit + outsider same-meeting/same-start in both orders and both scopes (legit scheduled, no unresolved, no transition).
2. Merge close-out edit, to apply on the merged tree in `packages/meeting-bot/src/alert-who-production.test.ts`:
   - after the line `  ev("evP8", "Webinar Past", { meetingUrl: "https://zoom.us/j/44444444444", startTime: "2026-10-10T08:00:00.000Z", endTime: "2026-10-10T09:00:00.000Z" }),` add `  ev("evF10", "Webinar FreeText", { meetingUrl: "https://zoom.us/j/88888888888", meetingUrlSource: "description" }),`
   - after `  "rules-unevaluable": [false, false, ""],` add `  "unverified-link-source": [false, false, ""],`
   - title `covers all 14 skip reasons from core` -> `covers all 15 skip reasons from core`.
   Result on the trial merge: 4/4 (unedited: 2 fail).

## Standing statement for the owner
Free-text calendar links are found but never auto-joined and raise no alert. Whether they may ever be auto-joined, and how a calendar event is approved (no approval path exists), is the Approver's decision (Umesh). ISS-376 (record-every-webinar skips the sender-trust check for Gmail candidates) remains open and separate.

# t036-calendar-description-link-scan

Status: ready-for-check
Fix cycle: 3
Priority tier: 3 - next unblocked roadmap task (T-036, slice: Calendar side of "find webinar links in Gmail and Calendar")
Security class: changes which meetings can be auto-joined (a wrong link joins the wrong meeting) - FULL ceremony
Lane: lane/t036cal (ledger shard qa/issues.t036cal.jsonl, ids ISS-T036CAL-NNN; none filed)

## Seam count and classification
PASSed verdicts naming the calendar-ingest seam (link extraction from event text): 0. Five verdict files merely mention `gws-calendar.ts` (hash lists / incidental); none PASSed a unit about calendar link discovery. Classification: a missing FEATURE of roadmap task T-036, not polish; the round cap does not apply. D-119 reserved files: `apps/api/src/gws-calendar.ts` and `routes/calendar.test.ts` are not listed (D-119 Changes-authorized names packages/ai, scripts/upload etc. only).

## NOT DONE / UNVERIFIED (read first)
- NO live Google Calendar run, no network. `gws calendar events list` is called with no `fields` mask, so the default event resource is expected to include `description` and `location`; this is UNVERIFIED against the real API/CLI. Real description HTML shapes (Zoho/OnAir/Zoom invites, Google `google.com/url?q=` wrappers) are UNVERIFIED against live data; tests use fixtures only.
- Recogniser single source of truth NOT achieved: `.dependency-cruiser.cjs` forbids apps/* -> packages/meeting-bot, so `detectPlatform` / `PLATFORM_EXTRACTORS` cannot be imported. `recognise()` in `apps/api/src/join-rules/calendar-link-extract.ts` is a KNOWN mirror (same exact-host rules and path/param shapes). Drift guard: a test reads packages/meeting-bot/src/platform.ts and fails if the host list or zoho pattern text disappears (coarse, not an equivalence proof). Proper fix = move the recognisers into packages/core (separate cross-package unit; lane junctions resolve @lkb/* to the main tree so it could not be built here). gws-gmail.ts regexes were deliberately NOT reused (substring matches; a host-in-path URL passes them).
- YouTube Live has no canonical recogniser in the repo (detectPlatform -> unknown), so a YouTube link yields no meeting link (test asserts `{}`). Not invented.
- Gmail scanner, scheduler, opt-out code, apps/web, scopes, calendar choice: untouched. T-036 stays open. CORRECTED in fix cycle 1: the mirror did not apply the embedded-redirect check and the auto path never applied it downstream (ISS-T036CAL-002); it now does. See Fix cycle 1.

## Scope / files
- NEW `apps/api/src/join-rules/calendar-link-extract.ts` (142 non-blank lines; pure, no I/O) + `.test.ts` (140). Existing subfolder join-rules (9 -> 11 files); NO new file in apps/api/src (31/31 kept).
- `apps/api/src/gws-calendar.ts` (201): `description`/`location` added to the private `GwsCalendarEvent`; mapper calls `resolveEventMeetingLink`; adds `meetingLinkIssue` only when set.
- `apps/api/src/routes/calendar.ts`: `UpcomingMeeting.meetingLinkIssue?: "ambiguous" | "registration-only"` (type only).
- `apps/api/src/routes/calendar.test.ts` (296 non-blank): 2 tests appended; no existing assertion edited.

## Extraction rules and precedence
conference data / hangoutLink (unchanged, wins, not re-validated) > first recognised join link in location > description. Only https, no userinfo, default port, exact host (platform.ts rules), identity shape required (zoom `/j/` `/w/` with 5+ digits, meet `abc-defg-hij`, teams meetup-join/meet, webex room/info/mtid, zoho key/sessionid, cloudonair /events/slug). Input HTML or text: anchors judged by href only (visible text dropped); tags stripped; entities decoded exactly once (single pass); markdown `[t](u)` uses u; `<url>` form; trailing `.,;:!?)]}>'"*_` trimmed; `https://www.google.com/url?q=` unwrapped one level, exact host+path only, target must itself be recognised (nested wrapper -> none). Bounds: 100,000 chars scanned, 200 candidates, 2048 chars per URL, linear scans (indexOf tag walk, no backtracking regex; unclosed tags/anchors stop scanning once).
Registration vs join: a recognised-host link whose path or a query key contains "regist" is a registration link, never joinable (checked before identity, since webinar.zoho.in/meeting/register?sessionId=.. would otherwise look like a session).

## Ambiguity rule (deterministic)
Distinct join links are deduplicated by identity (platform:id), first URL kept. Location: 1 distinct -> use it; 2+ -> ambiguous. Description: 1 -> use; 2+ -> keep those on the platform of any recognised link in the location; exactly 1 left -> use; else ambiguous. No join but a registration link -> registration-only. Ambiguous / registration-only => no `meetingUrl`, typed `meetingLinkIssue` on the mapped event.

## What the API returns
Same field as before (`meetingUrl`, already treated as untrusted and rendered via safe-url by web; unchanged). Passcode (`pwd=`) kept in the URL exactly as the conference-link path does; no new place logs or returns it. `description` and `location` are NOT mapped and NOT returned (JSON asserted free of them), and never in error text (errors stay the fixed "Calendar discovery unavailable"). Only new response key: `meetingLinkIssue`, absent unless set. Default parity: key list and `/calendar/upcoming` body byte-identical for conference-bearing events (tested over HTTP).

## Evidence (cwd C:\Users\product\Desktop\KnowledgeBase-lanes\t036cal\apps\api; node from the codex runtime)
- `node --test --import tsx src/join-rules/calendar-link-extract.test.ts` -> pass 14, fail 0 (hostile table 21 rows plus 1 MB, 10,000 URLs, 10,000 unclosed anchors, NUL, unbalanced HTML; bounds test ~125 ms).
- `node --test --import tsx src/routes/calendar.test.ts` -> pass 14, fail 0 (12 pre-existing unchanged + 2 new).
- `node --test --import tsx src/gws-gmail.test.ts` -> tests 25, pass 25, fail 0 (Gmail untouched).
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` (apps/api) -> clean, no output (35 s). Only apps/api touched.
- `node scripts/lint-dirsize.mjs` fails only for packages/index/src/pipeline (34 > 30, unrelated, known); `node scripts/lint-loc.mjs` fails only for packages/meeting-bot/py/sb_join.py (unrelated). Touched dirs within budget.

## Mutations
Harness untracked, in-worktree, per-mutation byte backup, SIGKILL timeout 300 s, restore in finally, sha1 verified each run, git hash-object identical before and after; harness deleted before commit. 12/12 killed: M1 description preferred over conference ("conference data wins", parity); M2 visible text instead of href ("hostile table", "description shapes"); M3 redirect unwrap any host ("Google redirect wrapper"); M4 entity decoded twice ("entities are decoded exactly once"); M5 first-wins ambiguity ("two different join links are ambiguous"); M6 registration treated as join ("registration-only link"); M7 scan bound removed ("scan bounds"); M8 description returned in API response ("text never returned", "default parity"); M9 userinfo allowed ("hostile table"); M10 trailing punctuation untrimmed ("description shapes"); M11 location-platform preference removed ("location wins"); M12 candidate cap removed ("scan bounds").

## Fixture provenance
Zoom `/j/..?pwd=abc` and `/w/1234567890`, Teams meetup-join `19%3ameeting_abc%40thread.v2/0`, Zoho `meeting.zoho.com/join?key=999`, Zoho registration `webinar.zoho.in/meeting/register?sessionId=12345`, OnAir `/events/weeklies`, Meet `abc-defg-hij`: from packages/meeting-bot/src/send-now.test.ts and platform.test.ts. Zoom registration `us02web.zoom.us/webinar/register/WN_abc` is the one constructed shape (no repo fixture; it only exercises the "regist" rule).

## Fix cycle 1 (checker verdict FAIL cycle 0: ISS-T036CAL-001 high, -002..-005 medium)

### What failed
001: a link from an invite's description/location was indistinguishable from Google conference data, so in every-webinar mode an outsider's invite was scheduled. 002: the API copy accepted 38 embedded-redirect URLs the canonical planner refuses (and the cycle-0 manifest wrongly said the join path checked it). 004: the drift guard was blind (extra host and endsWith both survived). 003: passcode-less duplicate kept. 005: Zoom host-start `/s/?zak=` links returned.

### Provenance (001): the field and how it travels
- `meetingUrlSource: "conference" | "location" | "description"` on the mapped event, set from `link.source`, present exactly when `meetingUrl` is (gws-calendar.ts; type in routes/calendar.ts). Core type `MeetingUrlSource` + optional field on `CalendarEvent` and `AutoRecordCandidateInput` (packages/core/src/domain/webinar-types.ts).
- Travel: API route returns the mapped row unchanged -> `createHttpCalendarLoader` (non-native path passes rows through; native path goes through `reconcileWebinarSources`) -> `calendar-client.ts` allow-list (key added for calendar rows only; value must be a string of at most 32 chars, any such string is kept so the selection, not the loader, judges it; the persisted-copy loop carries it; a Gmail candidate LINKED to a calendar event inherits the calendar's URL, so it now also inherits that URL's source) -> `normalizeCalendarEvent` / `normalizeCandidate` in auto-join.ts. schedule-tick.ts was NOT touched (no conflict surface with the join-rules lane).
- Backward compatibility: an item with a URL and NO source is read as `conference`. Reason: before this unit the only link source was Google conference data, so any row persisted or served before the field existed can only have come from conference data. A present value other than the string `conference` (location, description, unknown string, null, number, object) is untrusted.

### The default and the skip reason
In `selectAutoRecordItems` (auto-join.ts), after the cancelled/webinar/registration/no-link/time/past/not-due/rejected checks and BEFORE the sender-trust check: a link whose source is not `conference` is skipped with the new `SkipReason` `unverified-link-source`, in ANY mode (every-webinar true or false, trusted or untrusted organizer). Added to `SKIP_REASONS` in packages/core (single source; the type and consumers follow). Total records updated: skip-describe.ts `SKIP_REASON_MEANING`, apps/api brain.ts `SKIP_REASON_KEYS`; the alerts reason set and telegram `NOTIFIABLE_REASONS` derive from the lists. Operator text (no URL; detail empty): "link found in the invite text, not verified, so the bot will not join it automatically; if you trust the invite, send the bot to it manually (send-now)". (The brief suggested "approve it to record"; that would be untruthful because no approval path exists for calendar events.) apps/web renders `row.reason.replaceAll("-", " ")`, so the new value shows neutrally as "unverified link source"; web not changed.
- Result: after this unit an outsider's invite can at most surface a meeting as "found, not auto-joined"; it can never cause a recording by itself. Whether free-text links may ever be auto-joined (e.g. from authenticated trusted organisers) is the Approver's decision, NOT made here.
- Approval path: NONE exists for calendar events (auto-join.ts: "calendar has no independent approval workflow"; `preTrusted` is set only for Gmail candidates; join-rules-select only vetoes). So no approved-free-text case exists to test; approval is the named follow-up. An approved Gmail candidate whose URL came from a linked free-text calendar event is also NOT scheduled (tested). The manual `send-now` command is the operator's existing way to join one deliberately.
- ISS-376 / D-058 (every-webinar skips the sender trust check) is untouched and not decided here; it simply can no longer reach free-text links.

### One recogniser truth (002, 004): rule table (API copy vs canonical send-now.ts / platform.ts)
| Rule | Canonical | API copy now |
|---|---|---|
| length cap 2048 | planSendNow | same |
| whitespace / control / backslash | refuse | same |
| https only AND raw text starts `https://` | yes | yes (was: `https:/host` normalised by URL and accepted) |
| userinfo (parsed, and raw `@` before first `/?#`) | refuse | same |
| port | refuse | same |
| embedded redirect (REDIRECT_KEY names; URL_VALUE after up to 3 decodes) | refuse | same code, mirrored (was missing) |
| host table (detectPlatform) | exact or `.suffix` | same table |
| path decode | decodeAll (3x) | decodeAll (was single decode) so identities agree |
| identity extractors | PLATFORM_EXTRACTORS | same shapes, except zoom `/s/` removed |
| extra refusals in the copy only (stricter) | n/a | registration pages, `..` segment, Zoom `/s/`, any `zak=` (query or fragment, decoded) |

Differential test `apps/api/src/join-rules/calendar-link-differential.test.ts` (imports `planSendNow` from packages/meeting-bot; tests may cross packages): 7,258 distinct URLs (committed host/path/query/scheme tables x cartesian, plus 1,500 seeded-generator URLs, seed 20261011, plus the ledger's recorded redirect URLs): both accept 461 with identical identity and normalised URL, canonical-only 92 (every one explained by an extra copy refusal), copy-only 0; plus a pass through `resolveEventMeetingLink` (description and location; raw, anchor, parenthesised, Google-wrapped): 1,446 returned links, all canonical-accepted with equal identity, none containing `zak`; plus a named test for the two former survivors. Moving the recognisers into packages/core is the proper fix and REMAINS A FOLLOW-UP.

### Passcode and host-start rules (003, 005)
Same meeting (platform:id) written more than once: the variant carrying `pwd`/`passcode`/`password`/`pw` wins in either order; two different passcodes -> `ambiguous` (no link), order independent. Zoom `/s/`, and any URL with a `zak` key (any host, any case, encoded, in query or fragment) is a host-start link: never returned; alone it yields `meetingLinkIssue: "host-start-link"` (type widened in routes/calendar.ts); a join link in the same field is still returned, without the token.

### Default parity (1d)
Temporary harness (deleted) ran the pre-unit `auto-join.ts` from 8520fa8 and the current one on 6 full selections (everyWebinar true/false/undefined x cancelled false/true; 450 calendar events + 120 candidates each; mixed titles, urls, organizers, times; some rows with source `conference`): JSON of toSchedule+skipped byte-identical 6/6 (only 4 scheduled items in total, so the proof is mostly of the skip lists). Existing schedule-tick tests (14) pass unmodified. At 9bc316c the free-text event was scheduled; now it is skipped (test). API mapper parity: conference events keep the pre-change shape plus `meetingUrlSource: "conference"`.

### D-015 counts (the ledger's recorded reproductions, re-run)
- ISS-T036CAL-001: 4/4 free-text probes (event "Free Webinar: Win a prize", attacker@evil.com; everyWebinar true and false x description and location) not scheduled, skipped `unverified-link-source`; pre-change shape still `no-join-link`; conference-data twin scheduled; mapper+HTTP: 3/3 sources carried.
- ISS-T036CAL-002: 6/6 recorded URLs refused (the row records 5 redirect examples plus the `https:/` form; the checker's full 38-URL list lived in its deleted harness and is NOT in the ledger: the rest are covered by the generated family in the differential, not verbatim).
- ISS-T036CAL-003: 3/3 (plain-then-pwd, pwd-then-plain, pwd=A vs pwd=B).
- ISS-T036CAL-004: both recorded surviving mutants (extra host, webex endsWith) now killed, 2/2 (M5, M6 below).
- ISS-T036CAL-005: 12/12 host-start shapes, the recorded `zoom.us/s/12345678901?zak=TOKEN` among them.

### Existing assertions changed (old -> new, why)
1. extractor test: second URL in "same identity, first URL kept" was `?pwd=zzz`, now `?pwd=abc`. Old pinned first-wins for two DIFFERENT passcodes, which is now ambiguous by the contract.
2. calendar.test.ts parity test: expected row, key list and HTTP body gain `meetingUrlSource: "conference"` after `meetingUrl` (the contract requires it on every row with a link).
3. calendar.test.ts leakage test: regex `/"(description|location)"/` -> `/"(description|location)":/` (keys only; the new VALUES "description"/"location" legitimately appear).
4. alert-title-policy.test.ts and telegram-channel.test.ts: `SKIP_REASONS.length` 14 -> 15 (one reason added).

### NOT DONE
Approver policy on free-text links (and any approval flow for calendar events); ISS-376; a live Google Calendar run (field presence and real invite HTML unverified); moving the recognisers into packages/core; apps/web and schedule-tick.ts untouched; the passcode preference does not compare a location link with a description link of the same meeting.
Environment note: the lane's node_modules junctions point `@lkb/core` at the MAIN checkout. For verification I repointed only `packages/meeting-bot/node_modules/@lkb/core` and `apps/api/node_modules/@lkb/core` (inside this worktree) at this worktree's packages/core, and type-checked apps/api with an untracked tsconfig mapping `@lkb/core` by `paths` (otherwise TypeScript merges same-package-id copies and checks brain.ts against main's core). The junctions were restored to the main tree and the tsconfig deleted before commit; a checker must repeat the repoint to see the new reason at runtime/type level.

### Mutations (14 run, 14 killed)
Harness untracked, in-worktree, absolute paths, per-mutation byte backup, 240 s hard timeout with taskkill, restore in finally, sha1 compared after each run, harness deleted; final `git hash-object` equals the committed blob. M1 free-text auto-joined in every-webinar mode: killed (recorded probe). M2 unknown source defaulted to conference: killed (unknown/malformed test). M3 source dropped by client allow-list copy: killed (reconciliation test). M4 embedded-redirect check removed: killed (differential x2, ISS-002 test). M5 host zoomgov.com added: killed (differential x2, named survivors test). M6 webex endsWith: killed (same three). M7 passcode-less kept: killed (ISS-003). M8 `/s/` accepted: killed (ISS-005). M9 zak URL returned: killed (resolver differential, ISS-005). M10 skip reported as `no-join-link`: killed (probe, parity, unknown tests). M11 mapper drops the field: killed (parity, provenance). M12 different passcodes not ambiguous: killed (ISS-003). M13 `https:/` accepted: killed (differential, ISS-002). M14 absent source treated as free text: killed (existing auto-join tests).

### Evidence (cwd apps/api or packages/meeting-bot; node from the codex runtime; stdin from /dev/null)
- api: `node --test --import tsx src/join-rules/calendar-link-extract.test.ts` tests 17 pass 17; `src/join-rules/calendar-link-differential.test.ts` tests 3 pass 3 (`ISS-T036CAL-004 differential: 7258 URLs; both accept 461 (identity equal), canonical-only 92 (all explained), copy-only 0, neither 6705`); `src/routes/calendar.test.ts` tests 15 pass 15; `src/gws-gmail.test.ts` tests 25 pass 25.
- meeting-bot: auto-join 39/39, schedule-tick 14/14, sender-authentication 5/5, webinar-policy 19/19, schedule-state 18/18, alert-title-policy 12/12, join-rules-optout-identity 22/22, telegram-channel 6/6.
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json`: packages/core clean (5 s), packages/meeting-bot clean; apps/api clean with the `paths` tsconfig described above.
- `node scripts/lint-dirsize.mjs`: only packages/index/src/pipeline (34 > 30, unrelated). packages/meeting-bot/src/calendar 26 files (none added), apps/api/src/join-rules 12 (limit 30). Non-blank lines: extractor 172, extractor test 184, differential test 97, calendar.test 318, auto-join 249, auto-join.test 352.


## Fix cycle 2 (checker verdict FAIL cycle 1: ISS-T036CAL-006 high, -007 medium, -008 medium, -009 low; ISS-005 twelfth form)

### What failed
006: the mapper adds `meetingUrlSource: "conference"` to every link-bearing row, `semantic()` in calendar-client.ts compared it, so an event persisted before the unit and re-fetched unchanged was `contradictory-revision` and dropped (legacy scope: all starts blocked). 007: scripts/webinar/skip-reason-vocabulary.test.mjs hard-coded 14/15, and main's alert-who-production.test.ts (merged after this lane's base) enumerates the reasons. 008: no lane test pinned the allow-list seam. 009: the attendance selector and `selectEventsToAutoJoin` never read the source. 005: bare `?zak` (no `=`) was not refused.

### 006 fix: provenance is not identity (calendar-client.ts, 248 non-blank lines)
Option (a), generalised. `semantic()` (the function that defines a contradictory revision) now ignores `meetingUrlSource`; the url, times, title, cancelled flag etc. are still compared, so a changed url at an unchanged revision is still `contradictory-revision`. The accepted merge branch stores the FRESH snapshot, so after reconciliation the stored source always equals the fresh source: a legacy row is upgraded in place and no contradiction arises. Two guards keep trust from rising:
- `keepSource`: a fresh copy that names NO source never relaxes a stored free-text source for the same url (only a pre-unit mapper omits the field; the current mapper always sets it when a url exists).
- same-fetch tie-break: if two copies of one occurrence at one revision differ only by source, the least trusted sorts last and wins (`untrustedSource`).
A copy with an OLDER revision is ignored as before (`next.revision < row.revision` -> continue), so a stale more-trusted copy never overwrites a fresher less-trusted one, and a stale less-trusted copy never downgrades a fresher conference one.

Transition table (same url, same revision; stored source after reconciliation; tested in all 25 cells x 2 scopes = 50):
| persisted -> fresh | absent | conference | location | description | other string |
|---|---|---|---|---|---|
| absent | absent (scheduled) | conference (scheduled; the legacy upgrade) | location (skipped) | description (skipped) | that string (skipped) |
| conference | absent (scheduled) | conference | location (skipped) | description (skipped) | that string (skipped) |
| location | location (kept, skipped) | conference (fresh Google data; scheduled) | location | description | that string |
| description | description (kept, skipped) | conference (fresh; scheduled) | location | description | that string |
| other string | that string (kept, skipped) | conference (fresh; scheduled) | location | description | that string |
Never `unresolved`, never a transition, `newStartsBlocked` false in every cell. No cell makes a free-text link schedulable: a free-text source can only become `conference` when the freshest Google data for the SAME url and revision says so (conference data is not outsider-controlled text), and no cell turns a stored non-conference value into conference from absent information. Other rows of the table (separate tests): older-revision copies ignored in both directions; newer revision takes its own source; different url at the same revision stays `contradictory-revision`; the source survives a JSON round trip and a tick in which the event is absent.

### Legacy-state proof (link-source/link-source-reconcile.test.ts)
- ISS-T036CAL-006 recorded reproduction verbatim, through `prepareWebinarSourceState` (baseline tick with the pre-unit shape, then two sync ticks with `meetingUrlSource: "conference"` at the same `providerUpdated`): no inventory reason, `transitions` empty, event present and scheduled exactly as before, field added to the stored row. 1/1.
- Legacy scope (no `scope`): `newStartsBlocked` false, 1 event, no transition.
- 50 persisted legacy events (distinct Meet urls, no source) re-reconciled with the field, both scopes: 50 events, no transition, no inventory reason; the stored occurrences are deep-equal to the first state after stripping the field; 50/50 rows gained `conference`; the events handed to selection differ from the first state's only by the field; the same session keys are scheduled as before.

### 007: vocabulary and alerts
- scripts/webinar/run-pipeline.mjs already derives `OPERATION_REASONS` from `SKIP_REASON_MEANING` (skip-describe.ts, total over `SkipReason`), so no code change was needed there; the failing part was the TEST's literals. skip-reason-vocabulary.test.mjs now says 15, includes `unverified-link-source` in the named list, and derives the item counts from `SKIP_REASONS.length` instead of 15/16/index 14. 3/3 pass (was 1/3). It reads core's reason list from this lane's `packages/core/src/domain/webinar-types.ts` by file path and takes the rest from this lane's skip-describe, so it needed no node_modules change.
- Alert decision: NO alert for a free-text-link skip. An outsider can send unlimited invites; an alert per invite is noise and a nuisance vector, while silence would lose a legitimate meeting whose organiser only used the description. The conservative answer is that the skipped item is listed with its truthful, URL-free operator text (skip-describe: "link found in the invite text, not verified ... send the bot to it manually (send-now)") in the tick's skipped list / operations view, and the formatter ignores it as `no-alert-for-reason:unverified-link-source` (counted by name, because the reason is in core's list). Tested in this lane: attention-alerts.test.ts "a free-text-link skip raises NO alert" (3 items -> 0 alerts, ignored reasons `{no-alert-for-reason:unverified-link-source: 3}`). Mutation M8 (alert raised) is killed by it.
- Post-merge note for main's `packages/meeting-bot/src/alert-who-production.test.ts` (MERGE CONDITION for the orchestrator/checker; the lane cannot hold the file). With 15 reasons it fails 2 of 4 tests exactly as the checker reported: (1) the fixture never produces a skipped item with the new reason (the set equality with `SKIP_REASONS` fails); (2) `EXPECTED["unverified-link-source"]` is undefined. The lane's behaviour is right (no alert, nothing to resolve); the test needs data, not a code change. Required edit (3 lines):
  1. in `EVENTS`, after the `evP8` line add: `  ev("evF10", "Webinar FreeText", { meetingUrl: "https://zoom.us/j/88888888888", meetingUrlSource: "description" }),`
  2. in `EXPECTED`, after `"rules-unevaluable": [false, false, ""],` add: `  "unverified-link-source": [false, false, ""],`
  3. (cosmetic) test title "covers all 14 skip reasons" -> "covers all 15 skip reasons".
  Verified by simulation: main's three files it needs that the lane lacks (alert-who-command.ts, calendar/alerts/alert-resolve.ts, the test itself) were copied from `codex/machine-migration-2026-10-09` into the worktree as untracked temporary files (deleted afterwards), run against the lane's code with the tsx paths mapping: UNEDITED 2 pass / 2 fail (same two failures); WITH the three edits 4/4 pass, table line `unverified-link-source | no alert emitted by the formatter`. Caveat: main's schedule-tick.ts/join-rules-enforce.ts differ from the lane's; the run used the lane's schedule-tick.ts, so the post-merge result on the real merged tree is expected, not measured.

### 008: the allow-list (no code change needed; pinned by tests in link-source/link-source-allowlist.test.ts)
The code already keeps any string up to 32 chars without control characters and rejects non-strings, control characters and longer values closed; it never dropped a value. Tests pin that: valid values pass through; 12 invalid strings (`Description`, `desc`, empty, padded, cased, 32-char, accented, zero-width) are kept verbatim and end not scheduled, direct and after a persisted round trip, in both modes (48/48); 16 non-string/control/over-long values reject (16/16); unknown keys still rejected. A dropped value would read as "missing = conference", so mutations M4 (drop) and M14 (coerce to conference) are killed.

### 009: other selection paths
Both were a one-line guard, so both now honour the source: `selectEventsToAutoJoin` returns false for a non-conference source (auto-join.ts; allowlist test, 9 values); the attendance selector (`scripts/webinar/calendar-attendance-policy.mjs`) skips with `unverified-link-source` (calendar-attendance.test.mjs, 7 values; the reason is already in the script vocabulary). Absent or `conference` behave as before.

### 005: twelfth form
`zak` as a query/fragment key with or without a value (`?zak`, `?a=1&zak`, `?zak&a=1`, `?zak=`, `#zak`) is refused (regex `zak\s*(?:[=&#;]|$)`); keys that merely contain the letters (`zakk`, `azak`, `zak2`) and a passcode value containing `zak` are still returned. 17/17 host-start shapes refused (12 recorded + 5 siblings), none returned.

### D-015 counts (the ledger's recorded reproductions, re-run in the lane suite)
001: 4/4 recorded probes not scheduled (plus the mapper/HTTP and conference-twin tests). 002: 6/6 recorded URLs refused (the 38 of cycle 0 are not in the ledger; the generated family in the differential is unchanged). 003: 3/3. 004: 2/2 recorded mutants killed, differential 3/3. 005: 12/12 recorded forms (17/17 with siblings). 006: 1/1 verbatim (3 ticks) plus 50 legacy events, 50/50 transition-table cells. 007: vocabulary test 3/3 (was 1/3); main's alert-who production test 4/4 with the 3-line edit (2/4 without). 008: 48/48 kept-and-not-scheduled + 16/16 rejected. 009: attendance 7/7, selectEventsToAutoJoin 9/9. Reproductions deliberately left open: none.

### Existing assertions changed (old -> new, why)
skip-reason-vocabulary.test.mjs: 14 -> 15, 15 -> `SKIP_REASONS.length + 1`, `items[14]` -> `items[SKIP_REASONS.length]` (a derived count, so the next reason does not repeat this). calendar-link-extract.test.ts: the host-start case list gained 5 entries and a 3-entry "merely contains zak" control. No other assertion edited.

### NOT DONE
The Approver's policy on free-text links (may they ever be auto-joined, from whom); an approval path for calendar events; ISS-376 (record-every-webinar skips the sender check for Gmail candidates); a live Google Calendar run (field presence and real invite HTML unverified); moving the recognisers into packages/core; whether production actually holds a persisted state of the legacy shape (the fix is correct either way). The alert-who production test edit above is a merge condition, not applied here.

### Mutations (15 run, 15 killed, all by tests in the lane's suite)
Harness `.mut-t036cal-c2.cjs` untracked in the worktree, absolute paths, byte backup per mutation, restore in finally, 240 s timeout, deleted before commit; the working tree was identical (`git diff --stat`) before and after each full run, and after commit `git hash-object` equals `git rev-parse HEAD:` for every touched file. M1 legacy upgrade removed (provenance back in the comparison) <= 006 reproduction + legacy scope. M2 upgrade grants conference to a free-text source <= transition table. M3 stale conference wins over fresh description <= transition table + stale test. M4 allow-list drops invalid values <= allow-list test. M5 attendance selector ignores source <= attendance test. M6 `zak` without value accepted <= extractor 005 test. M7 new reason missing from the script vocabulary <= vocabulary tests (2). M8 alert raised per free-text skip <= attention-alerts test. M9 free text scheduled in every-webinar mode <= allow-list test. M10 source lost on persistence <= allow-list + reconcile. M11 absent fresh source relaxes stored free-text source <= transition table. M12 same-fetch tie-break reversed <= same-fetch test. M13 selectEventsToAutoJoin ignores source <= 009 test. M14 invalid string coerced to conference <= allow-list test. M15 older-revision guard removed <= stale-copy test.

### Evidence (node from the codex runtime; no node_modules change: tests run with `TSX_TSCONFIG_PATH` pointing at a temporary untracked tsconfig whose `paths` maps `@lkb/core` to this worktree's packages/core/src/index.ts; type-check used the same mapping; the three tsconfig.lane-tmp.json files were deleted)
- packages/meeting-bot: `node --test --import tsx src/calendar/link-source/link-source-reconcile.test.ts` 7/7; `.../link-source-allowlist.test.ts` 4/4; attention-alerts 11/11; alert-title-policy 12/12; auto-join 39/39; schedule-tick 14/14; schedule-state 18/18; webinar-policy 19/19; telegram-channel 6/6.
- apps/api: calendar-link-extract 17/17; calendar-link-differential 3/3 (7258 URLs; both accept 461, canonical-only 92, copy-only 0); routes/calendar 15/15; gws-gmail 25/25; routes/brain 11/11.
- scripts: `node --test scripts/webinar/skip-reason-vocabulary.test.mjs` 3/3; `scripts/webinar/calendar-attendance.test.mjs` 33/33.
- `node <main>/node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.lane-tmp.json`: packages/core exit 0, packages/meeting-bot exit 0, apps/api exit 0.
- `node scripts/lint-dirsize.mjs`: only packages/index/src/pipeline (34 > 30, unrelated). packages/meeting-bot/src/calendar gains NO file (new tests are in the subfolder link-source/, 2 files); apps/api/src gains none. Non-blank lines: calendar-client.ts 248, link-source-reconcile.test.ts 108, link-source-allowlist.test.ts 51.
- `git merge-tree --write-tree HEAD codex/machine-migration-2026-10-09`: clean, tree c85dc990edb59533b026aaa64d581da255e0470a, no conflicts.


## Fix cycle 3 (checker verdict FAIL cycle 2: ISS-T036CAL-010 high; 006..009 verified)

### What failed, and why this unit introduced it
An outsider could BLOCK a legitimate recording. Before T-036 an outsider's invite had no `meetingUrl` (the link was only in its description), so it had no identity alias and could not collide with anything. T-036 turned the description link into a `meetingUrl`, `normalizeOccurrence` gave that row the same alias as the real conference event (same url, same start), and `reconcileWebinarSources` marked BOTH `ambiguous-identity`: `calendarEvents` empty, transitions `unresolved`, nothing scheduled (legacy scope: `newStartsBlocked` for all events). Anyone who knows a public webinar link and its start time could do it. Cycles 0 to 2 made the link visible and untrusted for SELECTION but left it trusted for IDENTITY.

### The rule
A calendar row whose `meetingUrlSource` is present and not `conference` contributes NO identity aliases and takes no part in duplicate/ambiguity resolution, barriers or session-key collapse. Absent source = legacy conference row = unchanged (keeps aliases). Where:
- `calendar-client.ts` `normalizeOccurrence`: `aliases` is `[]` for an untrusted snapshot (helper `untrustedSnapshot`). Because aliases are what link Gmail rows to calendar rows and what `aliasOwners` collide on, such a row can neither make a conference row ambiguous nor attach to a Gmail row.
- `mergeOccurrence` end: a row that BECAME free-text (Google removed the conference data) drops the aliases it held; `aliasOwners` also skips untrusted rows (so a state persisted by an earlier build cannot collide); the Gmail `linkedCalendar` validation no longer demands an alias match when the linked calendar row has turned free-text (otherwise one source flip would make the whole reconciliation throw).
- Output: an untrusted row's inventory entry and transition carry no `sessionKey`/`currentKey`, so it never takes the real meeting's `webinar-` key, never writes a `queued` operation over it; it appears as its own `needs-review` operation under its own review key (same class of entry an outsider's link-less webinar-titled invite already produced before this unit).
- `auto-join.ts` (every-webinar mode): an untrusted item is excluded from the cancelled/rejected/registration barrier groups (`meetingIdentityOf`) and keeps its own `cal:<id>` session key (no collapse into the `webinar-` group of a conference or authenticated Gmail copy). It is still skipped `unverified-link-source` and listed.

### (a) to (f) with tests (link-source/link-source-alias.test.ts, 9 tests)
- (a) conference row resolved exactly as if the outsider did not exist: deep-equal events, transitions, inventory, unresolved flags, `blocked` and scheduled set vs the run on the conference row alone. 010 recorded reproduction verbatim: 4/4 (2 orders x 2 scopes), also in every-webinar and non-every modes; and through `prepareWebinarSourceState` (production path) in both orders: one queued operation, transitions empty. Invite spam: 1, 2, 50 and 400 outsider rows, both scopes: unchanged result, n outsider rows each skipped `unverified-link-source`, 400 rows reconcile in well under the 10 s bound (the time is printed in the assertion message on failure).
- (b) the outsider row stays visible and separate: skipped `unverified-link-source` with its own `cal:` key; inventory entry without the real meeting's session key.
- (c) two or more free-text rows for the same link (description and location): no `unresolved`, not blocked, other meetings still scheduled; both scopes.
- (d) free-text calendar row + conference row + authenticated approved Gmail row, every-webinar: scheduled set identical to the run without the outsider, outsider keeps `cal:evil0`; free-text row + Gmail row alone: Gmail row scheduled, NOT linked to the free-text row; a cancelled outsider row cannot veto the group. Changed existing assertion: auto-join.test.ts "a linked Gmail row inherits it" now asserts the Gmail row is NOT linked and keeps its own trust (g9 scheduled, calendar row c9 skipped `unverified-link-source`): the cycle-1 inheritance only existed because free-text rows took part in identity, which is the defect.
- (e) opt-out: `siblingIds` in join-rules-select groups only SCHEDULED items, and a free-text row is never scheduled, so it can neither be a sibling nor trigger a removal; the real rows keep their own aliases/identity, so an opt-out of the real meeting (`url:meet:abc-defg-hij` or the real event id) still vetoes every real row, and a state that opted out of a different meeting removes nothing. Excluding free-text rows from aliases cannot be used to dodge an opt-out. Tested both ways.
- (f) source flips: free-text holds 0 aliases; becomes `conference` -> 1 alias and schedulable; back to free text -> aliases dropped and not scheduled; a legacy row with an absent source keeps its alias; a Gmail row linked to a conference event survives the calendar row later turning free-text (no throw, nothing blocked). Two conference rows for one meeting are still `ambiguous-identity` (real ambiguity detection kept).

### Property (seed 20261011)
300 random cases x 2 scopes = 600/600: trusted rows T (1 to 5, urls/starts/titles drawn from small pools so they collide with each other), plus 0 to 8 free-text rows F (sources location/description/bogus; urls, starts, titles and string ids derived from T rows), shuffled. For every row of T the view (events, transitions, inventory, unresolved flags, blocked) AND the selection fate (scheduled, or skipped with reason and session key) are identical to the run on T alone, in every-webinar and normal mode; free-text rows scheduled: 0 of 1,178 added. (Cancelled outsider tombstones with an unknown id were excluded from F: they are `unknown-tombstone` for any event regardless of source, pre-existing and not outsider-controllable through a normal invite; noted, not changed.)

### Everything verified in cycle 2 still holds
reconcile table / 50 legacy events / real contradiction detection: link-source-reconcile 7/7; allow-list 4/4; auto-join 39/39 (48-case attack coverage and default parity tests in it); extractor 17/17, differential 3/3, calendar route 15/15; schedule-tick 14/14, schedule-state 18/18, webinar-policy 19/19, join-rules-select 11/11, optout-identity 22/22, sender-authentication 5/5, attention-alerts 11/11; scripts vocabulary 3/3 and attendance 33/33.

### D-015
ISS-T036CAL-010: 4/4 verbatim (2 orders x 2 scopes) plus production-path 2/2 orders. Re-run 001: 4/4 (auto-join test); 002: 6/6; 003: 3/3; 004: 2/2 (differential 3/3); 005: 12/12 (17/17 with siblings); 006: 1/1 + 50 legacy + 50/50 table cells; 007: vocabulary 3/3, main's alert-who production test needs the edit below; 008: 48/48 + 16/16; 009: 9/9 + 7/7.

### Post-merge edit for main's alert-who production test (unchanged, as the checker validated it)
File: `packages/meeting-bot/src/alert-who-production.test.ts` (NOT under calendar/alerts). Unedited it fails 2 of 4 with 15 reasons; with these three edits it passes 4/4. (1) after the line `  ev("evP8", "Webinar Past", { meetingUrl: "https://zoom.us/j/44444444444", startTime: "2026-10-10T08:00:00.000Z", endTime: "2026-10-10T09:00:00.000Z" }),` add `  ev("evF10", "Webinar FreeText", { meetingUrl: "https://zoom.us/j/88888888888", meetingUrlSource: "description" }),`; (2) after `  "rules-unevaluable": [false, false, ""],` add `  "unverified-link-source": [false, false, ""],`; (3) title `covers all 14 skip reasons from core` -> `covers all 15 skip reasons from core`. Not re-simulated in cycle 3: this cycle changes inventory/session-key handling for untrusted rows, so the checker should re-run that test on the trial merge.

### NOT DONE
The Approver's policy on free-text links and an approval path for calendar events; ISS-376; a live Calendar run; moving recognisers to core; the alert-who edit (merge condition); unknown-tombstone behaviour for cancelled unknown ids (pre-existing, source-independent).

### Mutations (11 run, 11 killed, all by link-source-alias.test.ts)
Harness `.mut-t036cal-c3.cjs` untracked in the worktree, byte backup per mutation, restore in finally with byte compare, 240 s timeout; `git diff` hash identical before and after the run; deleted before commit. M1 free-text rows contribute aliases again (3 sites) <= 010 reproductions. M2 free-text rows dropped silently <= 010 tests. M3 exclusion only in the available scope <= 010 + (c). M4a exclusion not applied to description <= 010. M4b not applied to location <= property. M5 free-text row in the every-webinar collapse <= (d). M6 free-text row feeds the barriers (veto) <= (d). M7 outsider inventory entry takes the real session key <= production-path test. M8 absent source treated as free-text <= (d), (f). M9 free-text row consumes the identity before a trusted row (skip reason of a trusted row changes) <= 010 tests, (d). M10 Gmail link validation not relaxed <= (f) Gmail flip test.

### Evidence (node from the codex runtime; no node_modules change; `TSX_TSCONFIG_PATH` -> temporary untracked tsconfig with `paths` `@lkb/core` -> this worktree's packages/core/src/index.ts; deleted before commit)
- meeting-bot: `node --test --import tsx src/calendar/link-source/link-source-alias.test.ts` 9/9 (prints `ISS-T036CAL-010: 4/4 ...` and `property: 600/600 ...`); reconcile 7/7; allow-list 4/4; the suites listed above.
- tsc `--noEmit -p tsconfig.lane-tmp.json`: packages/meeting-bot exit 0, apps/api exit 0; packages/core exit 0.
- `node scripts/lint-dirsize.mjs`: only packages/index/src/pipeline (unrelated). No new file in calendar/ or apps/api/src; non-blank lines: calendar-client.ts 254, auto-join.ts 255, link-source-alias.test.ts 183.
- `git merge-tree --write-tree HEAD codex/machine-migration-2026-10-09`: clean, tree 72ca39c1cc91d1def6e75696569c2001d41b1a2e.

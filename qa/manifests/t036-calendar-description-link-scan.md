# t036-calendar-description-link-scan

Status: ready-for-check
Fix cycle: 1
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

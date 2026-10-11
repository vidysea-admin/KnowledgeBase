# t036-calendar-description-link-scan

Status: ready-for-check
Fix cycle: 0
Priority tier: 3 - next unblocked roadmap task (T-036, slice: Calendar side of "find webinar links in Gmail and Calendar")
Security class: changes which meetings can be auto-joined (a wrong link joins the wrong meeting) - FULL ceremony
Lane: lane/t036cal (ledger shard qa/issues.t036cal.jsonl, ids ISS-T036CAL-NNN; none filed)

## Seam count and classification
PASSed verdicts naming the calendar-ingest seam (link extraction from event text): 0. Five verdict files merely mention `gws-calendar.ts` (hash lists / incidental); none PASSed a unit about calendar link discovery. Classification: a missing FEATURE of roadmap task T-036, not polish; the round cap does not apply. D-119 reserved files: `apps/api/src/gws-calendar.ts` and `routes/calendar.test.ts` are not listed (D-119 Changes-authorized names packages/ai, scripts/upload etc. only).

## NOT DONE / UNVERIFIED (read first)
- NO live Google Calendar run, no network. `gws calendar events list` is called with no `fields` mask, so the default event resource is expected to include `description` and `location`; this is UNVERIFIED against the real API/CLI. Real description HTML shapes (Zoho/OnAir/Zoom invites, Google `google.com/url?q=` wrappers) are UNVERIFIED against live data; tests use fixtures only.
- Recogniser single source of truth NOT achieved: `.dependency-cruiser.cjs` forbids apps/* -> packages/meeting-bot, so `detectPlatform` / `PLATFORM_EXTRACTORS` cannot be imported. `recognise()` in `apps/api/src/join-rules/calendar-link-extract.ts` is a KNOWN mirror (same exact-host rules and path/param shapes). Drift guard: a test reads packages/meeting-bot/src/platform.ts and fails if the host list or zoho pattern text disappears (coarse, not an equivalence proof). Proper fix = move the recognisers into packages/core (separate cross-package unit; lane junctions resolve @lkb/* to the main tree so it could not be built here). gws-gmail.ts regexes were deliberately NOT reused (substring matches; a host-in-path URL passes them).
- YouTube Live has no canonical recogniser in the repo (detectPlatform -> unknown), so a YouTube link yields no meeting link (test asserts `{}`). Not invented.
- Gmail scanner, scheduler, opt-out code, apps/web, scopes, calendar choice: untouched. T-036 stays open. The mirror does not apply `hasEmbeddedRedirect` (send-now.ts); the join path still applies it downstream.

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

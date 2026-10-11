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

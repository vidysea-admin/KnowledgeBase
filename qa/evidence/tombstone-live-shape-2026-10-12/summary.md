# Live shape of Google Calendar cancelled events (merge condition 5), 2026-10-12

Approver: Umesh ("Amend + live check allow", 2026-10-12). Read-only. Tool: repo's pinned gws CLI (.cache/tools/gws-0.22.5/gws.exe), the same
credential `apps/api/src/gws-calendar.ts` uses, calendar `primary`. Calls: `calendar events list` only (two), no create/modify/cancel/delete, no invite sent.
Titles, attendees, emails, links and ids are NOT recorded here: field names and counts only. Raw responses were kept only in the session scratchpad.

Query A: showDeleted=true, singleEvents=false, timeMin=now-45d, timeMax=now+30d. 36 items, 0 cancelled (a timeMin window returns no deleted rows here).
Query B (the adapter's baseline shape: showDeleted, singleEvents=false, showHiddenInvitations, no time filter): 211 items, 15 cancelled, 196 live.

## Cancelled events in Query B (n = 15): field presence

| field | present | note |
|---|---|---|
| id, kind, etag, status | 15/15 | |
| start, end | 15/15 | EVERY cancelled event carried start and end (no id-only tombstone observed) |
| iCalUID | 15/15 | |
| updated | 15/15 | the cancellation time |
| htmlLink | 15/15 | |
| transparency | 11/15 | |
| recurringEventId + originalStartTime | 11/15 | cancelled instances of a series |
| recurrence | 4/15 | cancelled series masters |
| summary, organizer, creator, attendees | 4/15 | only the 4 "detailed" cancellations |
| conferenceData + hangoutLink | 4/15 | same 4 |
| created, eventType, reminders, sequence | 4/15 | same 4 |
| location / description | 2/15 | |

Key sets seen (4 shapes): (1) master: start,end,iCalUID,updated,recurrence,... (4); (2) instance: start,end,iCalUID,updated,recurringEventId,originalStartTime (7);
(3) detailed instance with organizer/creator/attendees/conferenceData/summary (2); (4) detailed + description/location/attachments (2).
No cancelled row had conferenceData without also having start, organizer and summary. No cancelled row was id-only.

## Consequences for the design
- A cancelled event nearly always carries start/end, iCalUID and updated: the "start-less tombstone" is the adapter's/Mapper's fallback, not Google's usual shape. Minimal shapes carry no organizer, title or link, so organiser/title matching cannot be relied on for them; iCalUID, recurringEventId and start are what is there.
- Limit: this calendar's cancelled rows are all events this account was or is a party to. Whether a never-accepted outsider invite (cancelled before acceptance) appears at all, or as which shape, could not be observed here (none was created: the check is read-only).

# Contract: meeting links taken from Calendar free text (T-036, checker-authored 2026-10-11)

Ground truth for any unit that extracts a join link from a Calendar event's location or description.

1. Provenance: every mapped event with a `meetingUrl` carries `meetingUrlSource` = `conference` | `location` | `description`. A free-text link is chosen by whoever sent the invitation.
2. Default: a free-text link is NOT auto-joinable until a policy unit says so. Until then the scheduler/approval layer treats `location`/`description` sources as needing the trust the Gmail side needs (authenticated sender plus trusted sender, or human approval; D-122 ruling 1). Record-every-webinar mode (D-058, ISS-376) must not bypass this for free-text links without an explicit Approver decision.
3. The extractor refuses everything `planSendNow` refuses (not-https, userinfo, port, embedded-redirect, unsupported host, not-a-meeting-url) and host-start links (`zoom.us/s/`, `zak=`).
4. A differential test over a shared corpus proves: copy accepts implies canonical (`detectPlatform` + `meetingIdentity`) accepts, with the same identity.
5. Same meeting twice: the variant carrying the passcode is kept. Two different meetings in one field: no link plus a typed issue.
6. Description/location text and passcodes never appear in logs, errors or the typed issue field; `meetingLinkIssue` is an enum.

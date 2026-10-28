# Gate - ISS-322: trusted-sender check does no email authentication
**Opened:** 2026-09-27 (maker, from U5 cycle-2 checker finding ISS-322, high)
**Question:** U5 auto-records meetings "from trusted senders" (Karunn, theoutreachcollective.in, ashoka.edu.in, umeshsugara@vidysea.com). The sender is read from the From: header only (apps/api/src/gws-gmail.ts extractEmail/FROM_RE); SPF/DKIM/DMARC are not checked, so a spoofed From: claiming a trusted address is treated as trusted.
**Options:**
(a) Require Gmail's Authentication-Results (dkim=pass or spf=pass aligned with the From domain) before a candidate counts as trusted - recommended before U6's unattended 5-minute poller ships. Small unit in gws-gmail.ts.
(b) Accept the residual risk for now (Gmail's own spam filtering is the only guard); revisit before U6.
(c) Keep U5 in dry-run / per-meeting approval until (a) lands.
**Blocks:** U6 unattended poller going live. Does NOT block today's manual Ashoka recording or the U5 merge (U5 itself only schedules when schedule-tick runs without --dry-run).
**Answer format:** reply a/b/c -> maker appends `Answered: <ISO> - <choice> - <where>`.

Answered: 2026-09-27T10:32:00+05:30 - (a) require Gmail Authentication-Results (dkim/spf pass aligned with From domain) before a candidate counts as trusted - Umesh in chat to checker session knowledgebase-7a, verbatim "email verification lgaa do". Scribed by /checker; build is the maker's (not blocking today's webinar; do not build/merge into the shared launcher path before the live run ends).

**Gate status:** ANSWERED — recorded inline: 2026-09-27T10:32:00+05:30 - (a) require Gmail Authentication-Results (dkim/spf pass aligned with From domain) 

Answered: 2026-09-27T17:2x+05:30 — option (b) "Yes required, but keep running meanwhile" — Umesh
first-hand, AskUserQuestion in session 21132795. Ruling: sender authentication (SPF/DKIM/DMARC on
the scanned inbox) IS a hard invariant of the auto-record feature and must be written into
qa/contracts/u5-auto-record-scheduler.md as an [I*]; auto-join is NOT switched off while it is
built. Umesh explicitly accepted the interim window of risk on his own inbox. Resolves the
invariant-set question ISS-328 was holding the contract on.

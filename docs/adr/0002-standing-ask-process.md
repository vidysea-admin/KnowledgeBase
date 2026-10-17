# ADR-0002 — Standing-ask process for recording/source gaps (T-006)

## Status
Accepted (maker draft per contract `qa/contracts/recording-gap-tracking.md` C5; checker to
adopt/amend on first check).

## Context
`docs/Living-Knowledge-Base-Architecture.html` §1 Layer 1, step 2b ("Process-first gap handling"):
when a session has no recording, the process is a **standing ask to Bhakti/TOC**, and only if
it never arrives within N days is it "logged as a recording pending gap entry" — never silently
dropped (ARCHITECTURE §5). The architecture doc left N and the escalation path unspecified;
this ADR fixes them and generalizes the pattern beyond recordings to any missing source.

## Decision
1. **Who gets asked:** the session's organizer of record (`requestedFrom`, e.g. `org:toc-bhakti`
   for TOC sessions) — one named party per gap, not a broadcast. Adapters/callers supply this;
   `recordGap` never guesses it.
2. **Default SLA: 3 days** from `requestedAt` to `sla.dueAt`. Chosen to match the architecture
   doc's pilot cadence (sessions logged and followed up within the same week) — a short enough
   window that a gap doesn't silently age past the next indexing run. Callers may override per
   gap; there is no per-tenant config yet (YAGNI until a second SLA value is needed).
3. **Escalation:** on `sla.dueAt` passing with `status` still `"open"`, a human (not this unit —
   no automated Slack/email send, per contract non-goals) re-asks once, then either the recording
   lands (`markReceived`, optionally linking `sourceRef`) or the gap is marked `"expired"`
   (`markExpired`) and stays in the Knowledge Bank as a documented absence rather than vanishing.
   `listOpen` is what a future escalation sweep (deck's Missing Recording Workflow screen) reads.
4. **Vocabulary contract with the schema:** `gaps.schema.json`'s `status` enum
   (`open`/`received`/`expired`) *is* this process's three states; `requestedFrom` and `sla.dueAt`
   are this ADR's "who" and "by when" fields, not independently invented — the schema and this
   doc must be read together, and changing one's vocabulary requires updating the other.

## Consequences
No notification system is built yet — the "ask" itself stays a human action (Slack/email/verbal)
outside this repo. A gap that never resolves stays `"expired"` forever unless someone reopens it
manually (no code path reopens an expired gap in this unit).

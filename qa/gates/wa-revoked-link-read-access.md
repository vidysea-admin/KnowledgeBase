# HUMAN_GATE: read access for a non-active WhatsApp link owner

Question: should a user whose WhatsApp link is revoked, unlinked, rejected or suspended keep owner read/approve access to content they captured?
Options: active only (matches the ingest resolver) | keep access (needs a decision entry)
Blocks: wa-isolation-read-side (W7) fix cycle 1; source: W7 senior review finding (owner-config.ts forSource via getLink, no state filter)
Opened: 2026-10-30T17:00+05:30

Answered: 2026-10-30 — active only: ownerView requires link.state === "active"; an admin still passes — Umesh in chat ("Yes, active only")

# Gate H-4 — self-approval when Umesh is the only admin (whatsapp-multiuser, before W5)

**Question:** When the only admin requests a WhatsApp link, may they approve it themselves, or is a second admin required?
**Options:** (a) allowed, with the requester and approver both recorded on the link and in the event log; (b) a second admin is required.

Answered: 2026-10-30 — (a) self-approval allowed; the link row and its approval event record both requesterUserId and approverUserId (equal when self-approved, flagged `selfApproved: true`) — Umesh in chat ("Yes, record both")

# HUMAN_GATE: WhatsApp multi-user mini-grill (2026-10-29)
Questions: docs/features/whatsapp-multiuser/intent.md "Mini-grill questions". Approver: Umesh.

Answered: 2026-10-29 — Q1 = 1b: build real per-user accounts with login FIRST ("hnn yhi baa lete hai user wise"); links bind to a user, not an API key — chat
Answered: 2026-10-29 — Q4 = 4c: no attestation; admin approval is enough — chat
Answered: 2026-10-29 — Q5 = 5a PLUS: (i) tracking of the important/"main" messages, (ii) login must persist — "one login stays forever possible until user logs out themselves" (applies to the WhatsApp link session and the user's KB login) — chat
Answered: 2026-10-29 — Q6 = 6a — chat
Open: Q2 (who sees raw messages), Q3 (where the QR is scanned), and the meaning of "msg jo main kaa hai" in Q5.
Answered: 2026-10-29 — Q2 = 2a: the person + admins see raw messages and the review list; approved knowledge tenant-wide — chat (AskUserQuestion)
Answered: 2026-10-29 — Q3 = 3b: QR scanned INSIDE the KnowledgeBase (KB proxies QR + status) — chat
Answered: 2026-10-29 — Q5 "main messages" = only groups/people the user marks as important (on top of 5a health tracking) — chat
Answered: 2026-10-29 — Q7 login = email + password (session persists until the user logs out) — chat
Answered: 2026-10-29 — Q8 who can create an account = open signup; admin approves later — chat
Answered: 2026-10-29 — Q9 roles = admin + member + viewer (viewer read-only) — chat
All mini-grill questions answered. Note 4c (no attestation) + 3b + 5-marked: archiver capture selection now driven from the KB — spec must resolve the read-only boundary on the archiver DB (Q5b was not chosen; marking groups in KB needs a write path or an archiver API).
Answered: 2026-10-29 — Q-A mail sender = none in v1: "admin can reset if needed in v1, just the mail and pssword will work in v1" (email+password only; admin-issued reset; no verification mail) — chat
Answered: 2026-10-29 — Q-B signup = any email + password; "admin approve krega user ko" (no access until admin approval) — chat
Answered: 2026-10-29 — Q-W1 student data = (b) ALLOW BY DEFAULT: WhatsApp-derived knowledge may flow to external AI paths without per-link classification; Umesh accepts that egress risk. NOTE: this is an explicit owner exception to the user-level rule "student data never goes to an external service without per-use approval", scoped to WhatsApp-derived knowledge in this repo; needs a DECISIONS entry before W11 — chat
Answered: 2026-10-29 — H-4 password library = argon2 (argon2id) approved as a new dependency — chat
Pending: approval of docs/features/user-accounts/plan.md + whatsapp-multiuser/plan.md to start building (A1, A2 first).

# Go-live decisions batch (2026-10-28)
Opened: 2026-10-28T21:29:28+05:30
Questions asked in one batch (policy .16-2) via AskUserQuestion.
Answered: 2026-10-28T21:29:28+05:30 — vector-gap-durability: merge — chat
Answered: 2026-10-28T21:29:28+05:30 — T-028: "agar chaiye tho .env mai daal de take vhi .env file devops team ko de dungaa" — chat. Note: compose passes T-028 vars only from .env.t028 (docker-compose.yml:72-77), so values placed only in .env never reach the container; follow-up asked (domain + one-file vs two-file).
Answered: 2026-10-28T21:29:28+05:30 — cutover to lkb_prod + reindex the 2 FAILED sessions: Yes, now — chat
Answered: 2026-10-28T21:29:28+05:30 — bot join: attendanceMode: all (deny/opt-out still win) — chat; applies when the bot is enabled (R1-a)

## Batch 2 (2026-10-28, Umesh in chat)
Answered: 2026-10-28 — Q1 T-028 — keep the five T-028 vars in the main .env (compose change: api reads them from .env, still undefined when absent) — chat
Answered: 2026-10-28 — Q2 domain — open: Umesh asked what it is used for; explained, value pending — chat
Answered: 2026-10-28 — Q3 server/Mongo security — devops team does it; maker writes docs/DEVOPS-HANDOVER.md — chat
Answered: 2026-10-28 — Q4 WhatsApp — WhatsApp must ship at launch; maker to report what remains — chat
Answered: 2026-10-28 — Q5 consent-withdraw route — out of scope, ignore for now (ISS-W6-001 deferred) — chat
Answered: 2026-10-28 — Q6 lkb_prod cutover — recommended option (a): three-part production opt-in in scripts/webinar/sync-session.mjs, D-entry first — chat
Answered: 2026-10-28 — Q7 pipeline host — pipeline already runs on the Ubuntu server; push to git, server pulls and runs everything — chat

## Batch 3 — answered 2026-10-28 (Umesh, via AskUserQuestion)
- **A1 (D-204 prod opt-in for sync-session.mjs):** "Haan, chala de". D-204 appended via scripts/append_decision.ps1. Unit prod-optin-sync (tier L, prod-write, dual check).
- **A2 (address):** "domain is vidysea.com/knowledgebase". It is a SUB-PATH on the main domain, not a subdomain. Open: who runs vidysea.com's reverse proxy (it must forward /knowledgebase to the Ubuntu server), and whether web/api support a /knowledgebase base path. Fact pass dispatched.
- **B (WhatsApp):** "hnn but it must be like muliple users can link theri whatsapp numbers and trackking can be done and various later automation service can also be done there". Recommended defaults accepted (Ubuntu, admin QR page, review kept, 15-min sync) PLUS a new requirement: multi-user, i.e. several users each linking their own number, and a base that later automations can build on. Fact pass on the archiver's multi-session support dispatched.
- **D1 (bot on Ubuntu):** "live website mai deko agar vo kaam krr rhaa ha tho its in ubuntu and nhi kaam krr rhaa tho we need to make it work. local mai windows mai tho kaam krr rhaa hai naa vo. tune validate kya hai right??". Action: check the live site and the local Windows validation evidence, then report honestly; if it is not live, a Linux bot unit follows.

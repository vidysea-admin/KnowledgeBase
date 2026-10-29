# Gate: go-live batch 4 (2026-10-28)
Opened: 2026-10-28 (maker, after fact passes on subpath, bot status, WhatsApp multi-user)

1. Site address. (a) subdomain kb.vidysea.com — RECOMMENDED: no app change, API key in localStorage not exposed to main-site scripts; needs one DNS record. (b) sub-path vidysea.com/knowledgebase: 4 small web changes (vite base, router basename, VITE_API_BASE_URL build arg, 2 absolute hrefs) + front-proxy rule owned by the vidysea.com team; API-served HTML pages break under a prefix.
2. Meeting bot at launch. (a) keep on Windows host now, Linux later — RECOMMENDED (GO-LIVE-UBUNTU.md:129-130). (b) Ubuntu now: needs tab-capture fix first (T-034 live failure 2026-10-13), xvfb, Linux paths, gws OAuth on server.
3. WhatsApp multi-user plan (G1-G9 from fact pass) — approval of the unit list; it is a new feature so docs/features/whatsapp-multiuser/{intent,spec,plan}.md + mini-grill come first.
Blocks: subpath-web unit, bot-linux units, whatsapp-multiuser units.
Answer format: "1a/1b, 2a/2b, 3 ok|changes".

Answered: 2026-10-29T07:09:09+05:30 — 1b (vidysea.com/knowledgebase; already live, stays; base path must be dynamic/configurable, not hard-coded); 2 and 3 still open — chat
Answered: 2026-10-29T07:09:38+05:30 — 2b (bot on Ubuntu now, run via Docker); 3 still open — chat
Answered: 2026-10-29T07:28:23+05:30 — bot go (U1-U6 per bot-linux survey); masking ok (no native privacy-window masking on Ubuntu for now, filed for later); 3 ok (WhatsApp multi-user: intent/spec/plan + mini-grill before build) — chat
Answered: 2026-10-29 — gws Linux binary: "khud dekh lee and do the best and solve it" — find the official Linux release online, verify checksum, pin in the bot image — chat

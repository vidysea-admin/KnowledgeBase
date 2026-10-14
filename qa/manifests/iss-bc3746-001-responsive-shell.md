# iss-bc3746-001-responsive-shell

**Handshake status:** checked-PASS
Fix cycle: 1
Tier: 2-adjacent (open medium issue ISS-BC3746-001, filed on lane bc3746 at 8d3f21b0 in qa/issues.bc3746.jsonl; row copied to qa/issues.webresponsive.jsonl). Class: UI layout only, no auth/tenancy/data write. Lane: lane/webresponsive. Touches apps/web only (plus qa files).

## What was wrong
apps/web had zero @media rules: the 220px sidebar stayed at 375px and main overflowed (scrollWidth 654 /join-rules, 637 /meeting-bot,/sessions,/ask). Fails T-037 C11 and the T-046 phone check.

## Fix (plain global CSS, as the app already uses)
- `styles.css`: `@media (max-width: 640px)`: single column `minmax(0,1fr)`, 16px gutters, sidebar becomes top bar, links hidden behind a Menu button, tables scroll inside themselves, `pre` scrolls. Grid column `minmax(0,1fr)` on desktop too (no visual change). Desktop rules otherwise untouched.
- `NavSidebar.tsx`: Menu/Close menu button (aria-expanded), link click closes it.
- `BrainPage.tsx`: inline split/panel styles moved to classes `.brain-split/.brain-panel` (same desktop values: 340px panel); stacked below 640px.
- `brain/GraphSvg.tsx`: `maxWidth:100%` on the fixed-width SVG (ConfidenceGraphPage overflowed at 1280 too: 1360 vs 1280).

## Evidence
Live Chrome (system Chrome, headless, 1 browser, sequential contexts), Vite dev server of this worktree on 127.0.0.1:5399, API fully MOCKED (no backend, no DB), script `apps/web/scripts/browsercheck_responsive.py`; output + 50 screenshots in `qa/evidence/webresponsive-iss-bc3746-001/` (results.json).
- 25 routes x {375, 1280}: every page documentElement.scrollWidth <= viewport (375 vs 375; 1280 vs 1280), including /join-rules, /meeting-bot, /sessions, /ask, /brain. At 375: main gutter 16px, Menu button visible, links collapsed then open. At 1280: sidebar 220px, Menu hidden.
- Injected wide 12x120px table + 400-char pre + brain-split markup at 375: page not wider than viewport, table and pre scroll in their own box, brain panel stacked under the graph; at 1280 panel stays 340px beside the graph.
- Result: 179 checks PASS, 0 FAIL (`ALL PASS`). Found and fixed during the run: /graph-confidence overflow (GraphSvg fixed width).
- ISS-BC3746-001 reproductions: 2/3 refused by live measurement (C11/phone on /join-rules, T046/phone on /meeting-bot, both now fit 375). The third, C11/phone-confirm (confirm dialog at 375 on /join-rules), was NOT exercised: it needs a real write flow with the mocked API; the page it sits on now fits 375.
- vitest apps/web: 707 pass / 2 fail (SearchPage x2, identical failures on main, pre-existing); new `src/layout/responsive.test.tsx` 6/6. tsc --noEmit clean.
- Caveats: API mocked, so data-bearing tables on real payloads were only exercised via injected content. BrainPage graph itself rendered with a 3-node mock.
- Servers: Vite stopped (5399 refuses connections); 0 Chrome processes remain.

## Cycle 1 (fix of ISS-WEBRESPONSIVE-001; main 43b1a6a3 merged first)
- Cause: a `select` sizes to its longest option and had no max-width (/explorer 418 vs 375; at 1280 /brain and /explorer also overflowed with long titles, 1606 and 1527). Fix in `styles.css`: `.app-main select { max-width: min(100%, 40rem); min-width: 0; text-overflow: ellipsis }`, `.app-main label { max-width: 100% }`; at <=640px also inputs/textarea capped, buttons wrap, `overflow-wrap: anywhere` on main. All 36 select/input/textarea sites are covered by these element rules, not per page.
- Live script now uses realistic mocks on every page (180-char session titles, long speaker names, 100+ char URLs, long graph labels, long senders/emails, claims, turns, ops): `browsercheck_responsive.py`, evidence `qa/evidence/webresponsive-iss-bc3746-001-c1/` (results.json + screenshots).
- Live Chrome (1 browser), Vite :5399, mocked API: 25 routes x {375, 1280}: 179 checks PASS, 0 FAIL; every page scrollWidth <= viewport (375/375, 1280/1280), incl. /explorer, /brain, /join-rules, /meeting-bot, /sessions/s0. Before the fix this run showed FAIL on 1280 /brain and /explorer (and 375 /explorer in the checker's run).
- ISS-BC3746-001 reproductions: 2/3 refused live (join-rules, meeting-bot at 375); C11/phone-confirm dialog not exercised (needs real write flow). ISS-WEBRESPONSIVE-001: /explorer 375 and 1280 now fit.
- Full apps/web vitest: 67 files, 710/710 pass (SearchPage fixed by merge); tsc clean.
- Vite stopped; 0 Chrome processes.

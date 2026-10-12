# iss-bc3746-001-responsive-shell

**Handshake status:** ready-for-check
Fix cycle: 0
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

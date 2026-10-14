# Verdict: iss-bc3746-001-responsive-shell

VERDICT: FAIL
Cycle checked: 0
Commit checked: e0740a9f (lane/webresponsive). Checker evidence: qa/evidence/webresponsive-checker-iss-bc3746-001/ (own script chk.mjs, node Playwright + system Chrome headless, 1 browser at a time, API fully mocked, no DB, no secrets; both Vite servers and Chrome stopped afterwards).

EXPLANATION:
1. Live sweep, 25 routes x {375, 1280}, scrollWidth/body.scrollWidth vs viewport plus a real scrollTo(200,0) test. With the maker's empty mock everything passes. With a realistic mock (3 sessions with long titles, a 3-node graph) 49/50 pass and ONE FAILS: /explorer at 375 = scrollWidth 418 vs 375 (scrollX reaches 43). Cause: the "Session scope" <select> sizes to its longest option (402px) and has no max-width. Base (pre-fix) also overflows there, so the fix is incomplete for the stated acceptance ("no page scrolls horizontally at 375"). The maker's run missed it because no session data was mocked. Filed as ISS-WEBRESPONSIVE-001 (medium, one-rule CSS fix).
2. ISS reproductions: 3/3 refused at the page level. /join-rules 375 and /meeting-bot 375 fit (375 vs 375). The /join-rules confirm dialog at 375 was exercised for real (fill sender, "Approve sender", alertdialog x=33 w=309 inside the viewport, Confirm and Cancel buttons inside, scrollWidth 375 vs 375, Confirm sends POST /calendar/join-rules/approvals once, dialog closes; domain-warning dialog, opt-out dialog and Cancel also fit; menu open fits). Calendar with an event selected (300px detail panel) and its opt-out confirm also fit at 375.
3. Desktop 1280 vs the pre-fix commit (0d8ac5bc src served from a scratchpad copy): 25 page screenshots pixel-compared. 20 identical, 3 differ by 18 to 355 pixels at timestamp text only (sessions, calendar, meeting-bot), 2 differ intentionally: /brain (sidebar was squashed by 1320px overflow before) and /graph-confidence (1360 vs 1280 before) are now correct. No desktop regression found. Note: at 1280 the brain graph SVG now scales to the panel; nodes sit near the panel edge with the 3-node mock (cosmetic, mock-dependent).
4. Accessibility: Menu is a native button, reached by the first Tab, Enter and Space both toggle, aria-expanded flips false/true, aria-controls target exists, Tab from open menu enters the first link, 40px touch height, default focus ring (auto 1px) kept. At 1280 the button is hidden and links shown. 9/9.
5. apps/web: tsc --noEmit exit 0. vitest 707 pass / 2 fail (the known SearchPage failures only; not counted), 66/67 files; responsive.test.tsx 6/6.
6. Mutations (per-mutation byte backup and trap, restored and hash equal to HEAD blob each time, harness deleted): M1 media query disabled -> vitest 2 fail and live 25 fails at 375; M2 aria-expanded removed -> vitest 1 fail and live 4 fails; M3 menu not collapsed -> vitest 1 fail and live 2 fails; M4 GraphSvg maxWidth removed -> vitest passes (no unit pin) but live sweep catches 1280 /graph-confidence 1360 and 375 1116. 4/4 caught.
Reason for FAIL: acceptance not fully met on a realistic page (/explorer). Everything else holds. Re-check after ISS-WEBRESPONSIVE-001, with a long-title select mock added to the live check.
Side note: Vite run from the lane via the node_modules symlink writes its .vite cache into the main tree's node_modules; this checker used a scratchpad cacheDir for the final runs, but the first start touched that cache.

ISSUES-WRITTEN: ISS-WEBRESPONSIVE-001 (medium) in qa/issues.webresponsive.jsonl

---

# Cycle 1 re-check (commit fd86cbed, main 43b1a6a3 merged)

VERDICT: PASS
Cycle checked: 1
Evidence: qa/evidence/webresponsive-checker-iss-bc3746-001-cycle1/ (own script chkL.mjs, node Playwright + system Chrome headless, 1 browser at a time, API mocked, no DB; servers and Chrome stopped).

EXPLANATION:
1. Live sweep, 25 routes x {375, 1280}, realistic mock (3 long-titled sessions, 3-node graph): 50/50 pass (scrollWidth and body.scrollWidth <= viewport, scrollX stays 0). Cycle-0 failure /explorer 375 is fixed. The same sweep against main src (43b1a6a3): 27/50 fail (all 25 at 375; /brain 1320 and /graph-confidence 1360 at 1280).
2. Stress variant with a 324-char unbroken token plus 40 words in each title: wt passes 49/50 and the one failure is /sessions at 1280 (3369), which main also has (main additionally fails /explorer 4121 at 1280). Pre-existing, absurd input on desktop, not part of ISS-BC3746-001: noted as low, not filed (low never becomes a unit). At 375 it passes thanks to overflow-wrap.
3. ISS reproductions 3/3: /join-rules and /meeting-bot fit 375; the /join-rules confirm dialog at 375 re-run, 15/15 (dialog inside viewport, Confirm and Cancel inside, one POST approvals, domain-warning and opt-out dialogs and Cancel fit, menu open fits, calendar with event selected and its opt-out confirm fit). Menu a11y 9/9 (native button, Tab, Enter, Space, aria-expanded, aria-controls).
4. 1280 pixel comparison vs main, 25 pages: 20 identical; calendar (46 px), meeting-bot (211 px), sessions (830 px) differ only in timestamp text strips; /brain and /graph-confidence differ because main is broken there (squashed sidebar, overflow) and wt is the cycle-0 layout. The always-on select cap (max-width min(100%, 40rem)) changes nothing unless a select would exceed 640px. No regression; the differences are the intended fix.
5. tsc --noEmit exit 0. vitest 710/710 (67 files), including responsive.test.tsx 7/7 and the SearchPage tests now fixed.
6. Mutations on styles.css (per-mutation backup and trap, restored with hash equal to HEAD blob, harness deleted): M1 desktop select cap removed -> vitest 1 fail, live /explorer 4121 and /sessions at 1280; M2 overflow-wrap removed -> vitest 1 fail, live 3 fails; M3 media query disabled -> vitest 3 fail, live 25+ fails at 375. 3/3 caught.

ISSUES-WRITTEN: none (ISS-WEBRESPONSIVE-001 verified fixed; ISS-BC3746-001 reproductions 3/3 refused)

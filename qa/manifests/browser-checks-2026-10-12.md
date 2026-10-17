# Manifest - browser checks 2026-10-12 (Ask, Search, meeting-bot, join-rules; fixture API)

**Contract:** D-024 live-browser evidence; qa/contracts t037 C11 (OWED, not closed by this unit)
**Goal task:** T-046 (stays in_progress), T-037 C11 (stays OWED), U3.1/U3.2 (no closure claimed)
**Date:** 2026-10-14
**Fix cycle:** 1
**Dual check:** no
**Issues addressed:** ISS-BROWSERCHECK-001 (medium, closed); ISS-BROWSERCHECK-002 stays open (low, T-056)
**Status:** checked-PASS

## What cycle 0 got wrong (verdict qa/verdicts/browser-checks-2026-10-12.md, FAIL)
"Join rules - key without join-rules scope: editor read-only: PASS" was vacuous (no write attempted; screenshot byte-identical to rw). Withdrawn in qa/evidence/browser-checks-2026-10-12/summary.md. ISS-BROWSERCHECK-001 evidence text corrected in the ledger.

## Cycle 1 changes
- Merged codex/machine-migration-2026-10-09 (clean, no conflicts). It already carries 89e13f99 (mint-key --with-scope join-rules).
- New evidence qa/evidence/browser-checks-2026-10-14-joinrules/: fixture API now speaks ETag/If-Match (412/428) and exposes ETag over CORS because the merged page requires it; fixed a fixture crash (need() 403 followed by a 404 write); script join-rules-check.mjs redoes read-only properly (edit, Save, wait for PUT 403, read-only alert, Save + inputs disabled) and adds phone 375px and 503 states. Fresh Playwright contexts only (no data/bot-profile, no port 9333).
- No product code changed.

## Evidence (D-015: ISS-BROWSERCHECK-001 recorded reproductions, by id)
ISS-BROWSERCHECK-001: 3/4 recorded reproductions resolved, 1 named open.
1. "mint-key ALL_SCOPES omits join-rules": `node --test scripts/lib/mint-scopes.test.mjs` pass 5 / fail 0; DEFAULT_SCOPES lacks join-rules BY DESIGN, `--with-scope join-rules` yields it (true). Resolved by 89e13f99 (documented separate mint step = the ledger's fix_direction alternative).
2. "seed-demo-server.mjs omits join-rules": NOT changed, still omits. Open as ISS-MINTJOIN-001 (low), reason: demo editor key is a product decision.
3. "key without scope opens editor, Save disabled": reproduced and corrected: editor opens editable; Save->PUT 403->alert "This key can view rules but cannot change them", inputs+Save disabled (run-output.txt).
4. "saving needs a key carrying the scope": rw key saves with If-Match, persists after reload (run-output.txt).
Browser run: see run-output.txt (8 PASS / 0 FAIL); repeated 15 times with a fresh fixture each: 15/15 (repeat-15.txt). lint-loc --all OK. No product code changed, so no package suite/tsc applies.

## Not claimed
Real API/real key, 412 dialog in the browser, T-046 meeting-bot data-bearing states, independent checker browser (D-024). All still owed.

# Verdict: browser-checks-2026-10-12 (cycle 1)

VERDICT: PASS
Cycle checked: 1
Commits checked: 25f8cc11 (fix cycle 1) on lane/browsercheck, merge 96c24c11
LIVE-BROWSER: yes, own Playwright run (system Chrome, headless, fresh contexts, no bot-profile/9333), own strict fixture (64-hex strong ETag, hyphenated 428/412 codes as in apps/api/src/join-rules/router.ts), own Vite dev server of the lane; none of the maker's scripts or screenshots used. Servers started by me were stopped by PID.

## Results (my run, 12 PASS, 1 FAIL that is a checker-script over-reach, explained)
- ro key: edit rule, click Save: PUT 403, alert "This key can view rules but cannot change them...", Save disabled, rule inputs disabled, Add rule disabled. The one "enabled" field in my all-fields check is the global "Search all sessions" box outside the editor.
- rw key: Save PUT 200 with If-Match = 64-hex strong ETag; status shown; persists after reload; no read-only notice. Extra: out-of-band change then Save gives 412 and "Reload latest rules" is offered.
- Phone 375px: scrollWidth 375 = clientWidth for rw and for the ro alert state. 503 (non-busy code): alert "Rule editing is not available on this server yet.", no Save button.
- Screenshots: 8 sha256 prefixes all distinct; I viewed ro-after-403 (two alert banners, greyed fields) vs rw-reloaded (enabled fields, no alert): visibly different, so the cycle-0 vacuity is cured.

## Fixture fidelity (maker's fixture-api.mjs vs router.ts)
Honours If-Match/428/412 and exposes ETag over CORS, but is looser than the real API: ETag "vN" not 64-hex sha256; error codes underscored (precondition_required) vs real hyphenated (precondition-required, precondition-failed with currentEtag); its 503 body join_rules_unavailable is not what the real API returns (real unavailable is 500, 503 is join_rules_busy). The web client keys on status plus join_rules_busy only, so the browser outcome is unaffected, but the fixture is not a faithful mirror. Disclosed as fixture in the manifest. Filed low ISS-BROWSERCHECK-003.

## D-015 corpus (ISS-BROWSERCHECK-001 recorded reproductions)
ISS-BROWSERCHECK-001: 3/4 resolved, 1 named open (ISS-MINTJOIN-001, low, demo seed key: seed-demo-server.mjs still has no join-rules, confirmed). mint-scopes.test.mjs: pass 5 / fail 0; mint-key `--with-scope join-rules` path present. Repro 3 and 4 reproduced by my own run above.

## Correction note
summary.md WITHDRAWN note is honest: states the run never attempted a write and the readonly screenshot was byte-identical to rw. Ledger evidence text also corrected.

## Checks
lint-loc --all: OK (10 stages, 0 failed). No product code changed, so no package suite or tsc applies.

## Observations (notes only)
Read-only alert renders twice on the page (duplicate banner) - cosmetic, low.
Not claimed by this PASS: real API/real key, real Mongo; those remain owed (T-037 C11 stays OWED).
ISSUES-WRITTEN: ISS-BROWSERCHECK-003 (low)

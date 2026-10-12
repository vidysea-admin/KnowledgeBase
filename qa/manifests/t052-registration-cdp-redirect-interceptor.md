# t052-registration-cdp-redirect-interceptor

Status: ready-for-check
**Handshake status:** ready-for-check
Fix cycle: 1
Tier: owner-approved follow-up to ISS-374/ISS-373 (cost accepted "until a CDP interceptor exists"; ISS-REGSAFE-001 fix_direction). Class: security (registrant data leaving to unapproved hosts): full ceremony.
Lane: lane/regcdp. Ledger for this lane: qa/issues.regcdp.jsonl, ids ISS-REGCDP-NNN.

## Scope
- NEW `packages/meeting-bot/py/registration_cdp.py` (all logic). `sb_join.py` gains 5 changed lines: fetch `redirect` is `i.redirectMode === 'follow' ? 'follow' : 'error'`; `register_form(..., cdp_connect=None)` delegates the submit call to `registration_cdp.submit_with_redirects`; `main()` passes `registration_cdp.connect_page_cdp`.
- Design: with a connector, a separate loopback websocket to the page target enables `Fetch` (Request + Response stage, pattern `*`). The first POST (XHR/Fetch) is tracked by networkId (fallback redirectedRequestId chain). Each 3xx response hop is decided by `check_redirect`; allowed -> `Fetch.continueResponse`, else `Fetch.failRequest(BlockedByClient)`. Request stage of every tracked hop is re-checked (`check_url`). Any handler exception fails the request. A second POST is failed. Max 5 hops.
- Follow rule: 301/302/303/307/308 only; Location resolved against the redirecting URL; host exact match against the approved list after lower-case and single trailing-dot strip; non-ASCII/IDN, userinfo, backslash, whitespace/control chars, `https:///x`/`https:x` style spellings (Python vs Chrome parser disagreement) refused; scheme must equal the origin's (https, or loopback http for the local fixture only); port must equal the origin's; 307/308 only to the same host as the redirecting request.
- Verdict (`verdict()`): "submitted" is kept only if no refusal/error, exactly one POST, session alive, final response status 2xx, and the first POST URL equals the script's `target`; otherwise `uncertain/submission_not_confirmed` (or `submitted_mismatch`). The existing `submitted_mismatch` check and `awaiting_confirmation` semantics still follow (no new success claim).
- Fallback: `cdp_connect=None`, connect failure, or `Fetch.enable` failure -> `redirect:'error'` exactly as before (tested).

## Evidence
Commands (from packages/meeting-bot/py, repo venv python, `timeout`-wrapped, `-p no:cacheprovider`):
- `pytest test_registration_cdp.py` -> 130 passed in 2.7s (new)
- `pytest test_sb_join_registration_redirect.py` -> 15 passed (existing; 1 line edited: the leak-control test now patches the new redirect expression)
- `pytest test_sb_join.py test_sb_join_profile.py` -> 49 passed

ISS-374 replay: both recorded reproductions (307 and 308 `/submit` -> `http://localhost:50707/redirected`, allowedHosts [127.0.0.1]) refused through register_form with the interceptor (`test_iss_374_replay_unapproved_localhost_redirect_still_refused_with_interceptor[307|308]`: 2/2 refused, `Fetch.failRequest` issued, zero unapproved POSTs) and with no CDP (`..._keeps_redirect_error_path[307|308]`: 2/2). Corpus is the ledger's own two cases, not substituted. ISS-REGSAFE-002 (static unapproved-target cases) is NOT addressed here.

Mutations (harness inside the worktree, untracked, deleted; per-mutation byte backup restored in finally and sha256-verified; 120 s timeout per run; final `git hash-object registration_cdp.py` = ea5d53aa76f55db8718b4e75a9ccbf03b88432e5): KILLED: 307/308 same-host check removed, host allowlist removed, scheme check removed (after adding an http-on-443 case), port check, userinfo check, Location-form guard, final-2xx requirement, hop cap, failRequest no-op, connect-failure fallback swallow removed, refused-ignored-in-verdict (after adding a test), extra-POST allowed. SURVIVED (equivalent: `check_url` independently re-checks the resolved URL): backslash and non-ASCII screening in `check_redirect` duplicated by `check_url`.

## NOT covered
- NO real Chrome run (instructed; shared CPU / Chrome worker). Unproven against real Chrome: that a second CDP client on the page target coexists with chromedriver; that `Fetch.continueResponse` on a 3xx response-stage pause follows the redirect; that networkId is stable across hops; that Fetch events fire for a `fetch(mode:'no-cors')` under the existing DNR extension policy and `Emulation.setScriptExecutionDisabled`; the 5 s command timeout under load. If any of these differ, the outcome is `uncertain` (fail closed), never a leak, but registration on redirecting sites would not recover. See ISS-REGCDP-001.
- If the interceptor's websocket dies mid-submit, Chrome resumes paused requests; the persistent DNR policy (allow-list of approved host/port) remains the backstop for unapproved hosts, but a 307/308 to a different APPROVED host could then be followed. The verdict downgrades such a run to `uncertain`, but the second POST would already have gone. See ISS-REGCDP-002.
- Final status is read from CDP (the fetch response is opaque); a 2xx page that is itself an error page is still only `awaiting_confirmation`, as before.
- `test_sb_join_iframe.py` and `test_sb_join_ownership.py` (launch Chrome) not run; full suite not run.


## Cycle 1 (fix cycle 1; cycle-0 text above is kept as history)
Inputs: checker PASS-offline 0999ff8; real-Chrome evidence 5887813 (qa/evidence/regcdp-real-chrome-2026-10-12/summary.md). Ledger: ISS-REGCDP-001/-002/-003 NOT changed here.

### Changes (packages/meeting-bot/py only)
1. Loopback debugger address (ISS-REGCDP-001 real-Chrome finding). `registration_cdp.connect_page_cdp` now accepts exactly `127.0.0.1:P`, `localhost:P`, `[::1]:P` (fullmatch, case-sensitive, port 1-65535) and nothing else. `localhost` is connected as the literal `127.0.0.1` (a name is never resolved). uc_driver reports `localhost:<port>`; verified in real Chrome with NO shim.
2. Loud fallback. If a connector is supplied but CDP cannot be used (connect, `Fetch.enable` or heartbeat failure) `submit_with_redirects` prints `registration-cdp inactive (<why>): redirect:'error' fallback in use` to stderr and adds `cdp: "inactive"`, `cdp_reason` to a dict result (the TS joiner whitelists status/reason, so verdicts are unchanged). `cdp_connect=None` stays silent.
3. ISS-REGCDP-003 mitigation (no policy choice): `RedirectInterceptor.heartbeat()` (a `Browser.getVersion` round trip plus alive flag) runs immediately before the submit; if the socket is not answering, 'follow' is never enabled and the old `redirect:'error'` submit runs (1 POST, cannot follow). RESIDUAL (owner decision, unchanged): a socket that dies after the heartbeat while a 307/308 is paused makes Chrome follow it; DNR still blocks unapproved hosts, but a POST re-send to ANOTHER APPROVED host (not the same host) goes out and the verdict is only downgraded to `uncertain`. Real Chrome d1 reproduces it (2 POSTs: 127.0.0.1:P/submit then localhost:P/final); d2 with strict DNR shows 1 POST. Options remain as filed: keep `redirect:'error'` when more than one approved host, or accept DNR as backstop.
4. PRE-EXISTING defect found and fixed (not caused by this lane, present at base e4d6f140): `register_form` called `sb.execute_async_script(script, instructions, action)`, but SeleniumBase 4.51.9 `BaseCase.execute_async_script(script, timeout)` takes 2 args (TypeError -> `browser_failure`), so production registration through the real SB could never reach the inspect/submit step. Now both calls go through `driver = getattr(sb, "driver", sb)` (the selenium driver). 1 changed line in sb_join.py, 1 in registration_cdp.py. This also explains why csp_exact_origin (6) and native confinement (7) failed at base: confirmed by running them against e4d6f140 sources (13 failed there).
5. sb_join.py net change this cycle: `import registration_cdp` line before the emit (replaces an inline `__import__`) and the `driver.execute_async_script` inspect line.

### Test changes (each justified; none weakens an ownership/cleanup assertion)
- ownership `registered` fake: gains `cdp_connect=None` (main() now passes it) and ADDS `assert cdp_connect is registration_cdp.connect_page_cdp` (stronger).
- ownership confinement needle: exact source text updated to the new call (built from one `call` string shared by the needle and the instrumented replacement); copies `registration_cdp.py` next to the copied `sb_join.py` because the copied main imports it.
- ownership `positive-alias` (307 to the second approved host): expected `[/submit]` and `uncertain/submission_not_confirmed` instead of two POSTs with `[auth, None]` cookies. This is the documented T-052 rule (307/308 re-send the body only to the same host) and matches the iframe test's `paths = ["/submit"]`; it never passed at base (the whole case failed on the TypeError above). Zero foreign requests and cookie checks are unchanged.
- ownership `csp_exact_origin` fake: now provides the async executor and an operator/target/values result so register_form can reach `submitted` (was missing since the executor change); the policy assertion is unchanged.
- test_registration_cdp.py: FakeCDP gains `fail_ping`; the existing fallback test now also asserts `cdp == "inactive"` (verdict fields unchanged); NEW tests: loopback accept (3 forms, URL literal check) and 30 refusal spellings, heartbeat failure keeps `redirect:'error'` and is loud, dead socket, healthy ping before follow, loud on connect/enable failure, silent when no connector.

### Evidence (repo .venv python, `-p no:cacheprovider`, from packages/meeting-bot/py)
- test_registration_cdp.py: 170 passed. test_sb_join_registration_redirect.py: 15 passed. test_sb_join.py + test_sb_join_profile.py: 49 passed.
- REAL CHROME (cft headless, hei-sweep not running, localhost fixtures, 0 chrome/chromedriver processes before and after): test_sb_join_ownership.py + test_sb_join_iframe.py: 66 passed (ownership 52 + iframe 14; was 33/19 failed).
- Cases a-d re-run with the production-style `localhost:<port>` address and the production connector, NO shim (throwaway script, scratchpad, deleted; uc_driver reported `localhost:55738`): a1 302 same host followed, `submitted`, POST+GET /final. a3 307 same host followed (2 POSTs same host), `submitted`. b1 302->localhost with only 127.0.0.1 approved: refused, 1 POST, `uncertain`. b2 302->unapproved port: refused, 1 POST. c1 307->approved localhost: refused, exactly 1 POST. d0 socket dead before submit: heartbeat fails, loud `cdp inactive` line and `cdp: inactive`, redirect:'error', 1 POST. d1 (residual) socket killed while the 307 is paused with DNR allowing both: Chrome followed, 2 POSTs (second to localhost), verdict `uncertain`. d2 same with strict DNR: 1 POST.
- Mutations (harness regcdp-c1 inside the worktree, untracked and deleted; byte backup restored in finally, sha256 verified): KILLED 10: drop localhost, drop [::1], any-host regex, prefix match instead of fullmatch, unchecked port range, connect by name, heartbeat call removed, heartbeat without ping, silent fallback, note not attached. One mutation not run (needle matched twice; equivalent since PageCdp.send already raises on a dead socket).

### NOT covered
- The residual in item 3. Production SeleniumBase launch (as opposed to webdriver.Chrome + uc_driver) was not driven end to end; both report through `driver.capabilities`.
- ISS-REGSAFE-002 and the medium issues are untouched.

# t052-registration-cdp-redirect-interceptor

Status: ready-for-check
**Handshake status:** ready-for-check
Fix cycle: 0
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

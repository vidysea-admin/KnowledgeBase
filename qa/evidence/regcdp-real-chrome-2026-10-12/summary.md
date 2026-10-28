# regcdp real-Chrome verification, 2026-10-12 (lane/regcdp @ 0999ff8)

Preconditions: no process command line mentioned hei-sweep; no chrome/chromedriver running at start. Localhost fixtures only
(two 127.0.0.1 servers, ports P and Q; all test targets in the two test files confirmed localhost/127.0.0.1 or fake-driver).
Chrome: seleniumbase cft chrome-win64 headless + uc_driver, tab-capture extension DNR policy installed as in the existing test.
Cleanup: every browser quit; afterwards no chrome/chromedriver/uc_driver processes remained (checked by process list and command line).

## Existing real-Chrome test files (repo .venv python, `-p no:cacheprovider`)
- test_sb_join_iframe.py: 14 passed, 0 failed. (Includes test_registration_actual_local_form_and_safety_exceptions, but that test passes NO cdp_connect, so it exercises only the redirect:'error' fallback.)
- test_sb_join_ownership.py: 33 passed, 19 failed (52 total). The 19 failures are caused by the lane's own sb_join.py edit, not Chrome behaviour:
  - test_registration_main_disables_scripts_before_same_target_navigation[none-*] x6 and test_registration_csp_exact_origin[*] x6: the fake `registered(_sb, instructions, script_isolated=False, policy_check=None)` (ownership test line 185) has no `cdp_connect` parameter, but main() now passes `cdp_connect=...` (sb_join.py line 1122) -> TypeError -> result `uncertain` instead of `submitted`.
  - test_registration_native_same_host_other_port_confinement x7: asserts the exact source text `emit("registration-result", **register_form(sb, registration, script_isolated=True, policy_check=policy_check))` occurs once (line 269); the lane changed that call so the count is 0.
  - Needs a test update (qa/contracts is not touched by this run). The maker's manifest said ownership "not run"; this is a lane regression in the test suite, not yet in the ledger.

## Throwaway real-Chrome script (untracked, deleted afterwards), one browser, DNR policy via the real extension
All hosts below are on 127.0.0.1/localhost. "approved" = in allowedHosts.
| case | setup | result |
|---|---|---|
| a1 | 302 /submit -> /final, same host | followed (interceptor events: 302 paused, continueResponse followed to GET /final, final 200); result `submitted/awaiting_confirmation`; server saw 1 POST + GET /final |
| a2 | 302 -> http://localhost:P/final, both hosts approved | followed; `submitted`; GET arrived with Host localhost:P |
| a3 | 307 -> /final same host | followed; POST re-sent to /final (2 POSTs, body preserved); `submitted` |
| b1 | 302 -> 127.0.0.1:Q (unapproved port), DNR permissive | refused (reason `port`), zero requests reach Q, `uncertain/submission_not_confirmed` |
| b2 | 302 -> localhost:P, only 127.0.0.1 approved, DNR permissive | refused (reason `host`), no request to localhost, `uncertain` |
| c1 | 307 -> localhost:P, both approved | refused (`body_resend_other_host`), exactly 1 POST total, `uncertain` |
| c2 | 308 same | refused likewise, 1 POST total |
| d1 | as c1 but websocket killed (socket shutdown+close) while the 307 response is paused; DNR allows both hosts | Chrome RESUMED and FOLLOWED: server saw POST 127.0.0.1:P/submit then a second POST localhost:P/final (Host localhost). Result downgraded to `uncertain/submission_not_confirmed`, but the second POST had been sent. Gap confirmed (ISS-REGCDP-002/-003). |
| d2 | 302 -> 127.0.0.1:Q, websocket killed, strict DNR (approved host:port only) | NOT followed: DNR blocked it; 1 POST only; `uncertain` |
| d3 | 302 same host, websocket killed | Chrome followed (GET /final); `uncertain` |
| e | cdp_connect raises | fallback redirect:'error': 1 POST, no follow, `uncertain` |

Unknowns now answered (with a caveat below): a second CDP client on the page target coexists with chromedriver (Fetch.enable acked, events delivered); continueResponse on a 3xx pause follows the redirect (302 and 307, also to a second approved host); networkId is stable across hops (same networkId, new requestId, redirectedRequestId set); Fetch events fire for the XHR POST under the DNR policy and setScriptExecutionDisabled.

## New finding (real Chrome)
`registration_cdp.connect_page_cdp` requires `goog:chromeOptions.debuggerAddress` to match `127.0.0.1:<port>`. With webdriver.Chrome + uc_driver (as in the existing test) Chrome reports `localhost:<port>`, so the connector raised `debugger endpoint refused` and every run silently fell back to redirect:'error' (first run of the script: 0 interceptors created, all cases `uncertain`). The cases above were run with a shim that rewrote localhost to 127.0.0.1 in the capabilities. Whether the production SeleniumBase driver reports 127.0.0.1 was not tested here (sb_join.py line 962 uses the same regex for the recorder, which suggests it does); if it reports localhost the interceptor is dead code (safe, fail closed, but no benefit). Needs confirming against the real SB launch, or loosening the regex to `(127\.0\.0\.1|localhost)`.

## Verdict on the issues
- ISS-REGCDP-001: the happy path and refusals work in real Chrome (a1-a3, b, c, e). It can close once the connector/debuggerAddress finding is resolved or shown not to apply to the SB launch, and the 19 stale ownership tests are updated.
- ISS-REGCDP-003 (and -002): reproduced in d1 (second POST to the other approved host after websocket death). Not closeable without an owner decision: accept DNR as backstop (documented), or keep redirect:'error' when more than one approved host, or a failRequest-on-timeout cleanup.

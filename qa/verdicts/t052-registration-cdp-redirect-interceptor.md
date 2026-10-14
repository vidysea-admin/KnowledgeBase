# Verdict: t052-registration-cdp-redirect-interceptor

VERDICT: PASS
Cycle checked: 0
Commit checked: 2302e45 (lane/regcdp)
Scope: offline logic and fallback only. NOT proven in real Chrome; ISS-REGCDP-001/-002 stay open and are conditions.

## EXPLANATION

ISS-REGCDP-001 (high, "proven only against a fake CDP client"): this is a coverage limit, not a defect this lane introduces. Every unproven item (second CDP client beside chromedriver, continueResponse following a 3xx, networkId continuity, Fetch events under DNR + script-execution-disabled, 5 s timeout) fails toward `uncertain`: verdict() needs started, alive, no refusal/error, one POST, 2xx final status. I traced those paths; none reports `submitted` on missing events. Cost if Chrome differs: registration on redirecting sites returns `uncertain` (the ISS-373/374 state today), never a leak. Ruling: not a FAIL; must be closed by a real-Chrome run before anyone relies on redirect following.

Crash path (decisive): NOT fail-closed against transport loss. A connector that acks Fetch.enable switches the page fetch to `redirect:'follow'` (sb_join line 750), so if the websocket dies, hangs past the 10 s script timeout, or stop()/Fetch.disable runs with a request still paused, Chrome releases it and follows. What remains: the persistent DNR rules (block `*`, allow only scheme+host+port of approved hosts, re-verified by policy_check right before submit), which stop any UNAPPROVED host. Handler exceptions do fail closed (failRequest; mutation-killed). Remaining gap is a 307/308 (body-resending) to a different APPROVED host. Ruling: a leak to an unapproved host needs CDP loss AND a DNR failure together (DNR was already the project's trusted layer); the approved-second-host case is operator-approved data. Not a FAIL, but weaker than redirect:'error' alone; filed ISS-REGCDP-003 (medium) with ISS-REGCDP-002 for an owner decision.

Measured myself (repo .venv python, per-file timeout, no browsers; iframe/ownership suites not run):
- test_registration_cdp.py 130 passed; test_sb_join_registration_redirect.py 15 passed; test_sb_join.py + test_sb_join_profile.py 49 passed.
- ISS-374 corpus: 2/2 recorded cases (307, 308 to unapproved localhost) refused with the interceptor and 2/2 with no CDP (the ledger's own cases, verified in the named tests).
- 30 host probes of check_redirect (origin https://events.example.com, 443): 0 mismatches. Refused: other port, http, userinfo (`@`, `:443@`, `%2f@`), backslash, subdomain suffix/prefix tricks, `//evil`, `///evil`, `https:///evil`, `https:evil`, IDN, newline/tab, javascript:/data:, `[::1]`, `0xdeadbeef`, 300/304, 307 to another approved host. Accepted: relative, same host with trailing dot, upper-case host/scheme, explicit :443, `#@evil` (fragment, host stays approved).
- Own mutations (per-mutation byte backup, finally-restore, 120 s timeout): follow unapproved host KILLED (1 failed); allow 307 cross-host KILLED; ignore handler error KILLED. registration_cdp.py hash ea5d53aa76f55db8718b4e75a9ccbf03b88432e5 equals HEAD blob; trees clean; harness deleted.

Needs a real-Chrome run (unknown here): coexistence with chromedriver, DNR extension policy vs Fetch pauses, Fetch behaviour for fetch(no-cors) with scripts disabled, networkId across hops, behaviour under load/disconnect, default wiring in main().

ISSUES-WRITTEN: ISS-REGCDP-003 (medium), in qa/issues.regcdp.jsonl

## Conditions
Keep ISS-REGCDP-001 open until the real-Chrome fixture cases listed in its fix_direction pass. Owner decides ISS-REGCDP-002/-003 (accept DNR backstop, or limit follow mode). Do not mark ISS-374 verified by this verdict.


---

# Cycle 1 check

VERDICT: PASS
Cycle checked: 1
Commit checked: 41ba63c8 (lane/regcdp, on top of real-Chrome evidence 5887813)
Scope: loopback debugger address, loud fallback, pre-submit heartbeat, async-executor fix, ownership test updates. Real Chrome (cft headless), localhost fixtures only; no hei-sweep process before or after.

## EXPLANATION

HEADLINE, PRE-EXISTING PRODUCTION BUG (owner must hear this). Confirmed independently. The .venv SeleniumBase is 4.51.9 and `BaseCase.execute_async_script(self, script, timeout=None)` takes two arguments (read from source; `inspect.signature(...).bind(None, "s", {}, "inspect")` raises TypeError "too many positional arguments"). On base e4d6f140, `register_form` called `sb.execute_async_script(script, instructions, "inspect"|"submit")` on the SB object `main()` receives, inside `try/except Exception -> browser_failure`. So production webinar registration through the real SeleniumBase object could never reach inspect or submit; it always ended `uncertain/browser_failure`. Unit tests hid it because every fake `sb` accepted three arguments. The fix is correct: the selenium WebDriver signature is `execute_async_script(script, *args)`, and `driver = getattr(sb, "driver", sb)` is already used for the CDP calls just above. Reverting the fix (sb_join inspect plus both registration_cdp calls) turns a real-Chrome ownership case red (my mutation 3). Consequence: any earlier "registration works" claim for the SB path rested on fakes or webdriver.Chrome fixtures, not on the shipped main().

Test changes, each ruled:
- `registered` fake: gains `cdp_connect` and asserts it is the real `connect_page_cdp`. Legitimate, stronger.
- Confinement needle and copied registration_cdp.py: legitimate (needle and replacement share one call string; the copied main imports the module).
- `csp_exact_origin` fake: provides the async executor and result so register_form reaches `submitted`; the form-action policy assertion is unchanged. Legitimate.
- `positive-alias`: not purely mechanical. The base test (D-110/D-111, protected) expected POST /submit then POST /redirected to the second approved host, cookies [auth, None]. It never passed at base (the TypeError) and, even with the executor fixed, was already unreachable since regsafe 87df0d1f (redirect:'error', owner-accepted cost). The new expectation (1 POST, `uncertain/submission_not_confirmed`) follows the documented T-052 rule (307/308 re-send the body only to the same host), is stricter, and keeps the zero-foreign-request and cookie checks. I rule it not a weakening of a safety assertion, but it removes a recorded positive control without an owner decision: ISS-REGCDP-004 (medium).

Loopback acceptance (my 30 probes of `connect_page_cdp` with a recording websocket): accepted only `127.0.0.1:P`, `localhost:P` (connected as literal 127.0.0.1) and `[::1]:P`. Refused: `localhost.evil`, `127.0.0.1.nip.io`, `0.0.0.0`, `[::ffff:127.0.0.1]`, `LOCALHOST`, ports 0/65536/99999, trailing newline, leading space, userinfo forms, path suffix, scheme prefix, `127.1`, decimal IP, `127.0.0.2`, `localhost.`, fullwidth-dot and Arabic-digit spellings, empty/None/int. 0 mismatches.

Residual d1 (socket dies while a 307/308 to ANOTHER approved host is paused): bounded by the persistent DNR policy (exact scheme+host+port allow-list), so an unapproved host is still blocked (d2: 1 POST). Impact: the registrant's own form body is sent a second time to a host the operator already approved, and the verdict drops to `uncertain`. It needs socket death at the pause AND two approved hosts; the heartbeat covers deaths before submit. Rating: medium-low, no unapproved disclosure. ISS-REGCDP-002/-003 stay open for the owner decision.

Measured myself (repo .venv, no installs):
- test_registration_cdp.py + test_sb_join_registration_redirect.py: 185 passed (170 + 15). test_sb_join.py + test_sb_join_profile.py: 49 passed.
- Real Chrome, test_sb_join_ownership.py + test_sb_join_iframe.py: 66 passed on the final run. Honest record: run 1 (pytest --basetemp under the long scratchpad path) 8 failed with Chrome "Internal error while updating dynamic rules" (path-length artefact; the default basetemp passes); run 2 (default basetemp) 64 passed, 2 failed (`confinement[wrong-action]`, `[wrong-page]`), both pass alone and in run 3 (66/66). I did not capture run 2's error text. Those two cases refuse before any submit, so they do not exercise the changed code, but the suite is load-sensitive.
- Own mutations (harness inside the worktree, untracked, deleted; byte backup restored in finally; `git hash-object` equals the HEAD blob for each touched file): (1) accept any host as loopback -> KILLED (1 failed); (2) heartbeat call skipped -> KILLED (1 failed); (3) execute_async_script fix reverted in sb_join.py and registration_cdp.py -> KILLED (real-Chrome case red).
- Trees clean afterwards; no chrome/chromedriver/uc_driver left.

Not re-verified by me: production SeleniumBase launch end to end (maker's note stands); I did not re-drive cases a-d with a throwaway script, I relied on the ownership/iframe real-Chrome suites and the maker's evidence for them.

ISSUES-WRITTEN: ISS-REGCDP-004 (medium), in qa/issues.regcdp.jsonl. ISS-REGCDP-001 set to verified. ISS-REGCDP-002/-003 remain open (residual d1).

## Conditions
Owner decides ISS-REGCDP-002/-003 (accept DNR backstop vs limit follow mode) and ISS-REGCDP-004 (ratify same-host-only 307/308 and amend D-110/D-111). This verdict does not mark ISS-374 verified.

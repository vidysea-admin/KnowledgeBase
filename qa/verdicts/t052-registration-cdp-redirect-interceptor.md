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

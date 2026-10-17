# Verdict: iss-373-374-registration-redirect-and-post-validation

VERDICT: PASS
Cycle checked: 0
Commit checked: 87df0d1 (lane/regsafe)
Scope: leak path closed in code; ISS-374 and ISS-373 stay `open` (not marked verified by this verdict).

## EXPLANATION

Measured myself (venv python at KnowledgeBase/.venv, per-file timeout, node at the codex runtime path hard-coded in the test):
- test_sb_join_registration_redirect.py: 15 passed (maker: 15). ISS-374: both ledger `reproductions` (307, 308 to unapproved localhost) replayed against the real `sb_join.REGISTRATION_JS` string (asserted `script is sb_join.REGISTRATION_JS`): 2/2 refused, one POST to the approved host, zero to localhost; control with `redirect:'follow'` leaks two identical-body POSTs.
- ISS-373: row records no reproductions; the 8 derived cases (action, formaction, action to localhost, added required consent, checked consent, swapped value, swapped hidden csrf, injected field) are a fair span of the row's text (action/formaction/consent). Not described in the row but untested: input/change/submit LISTENERS firing on a real page (only checkValidity is hooked in the fake DOM). 8/8 refused, zero POSTs.
- Incident: test_sb_join_iframe.py launches real Chrome through its fixtures (the brief forbade browsers; the file cannot run otherwise). I ran it once: 14 passed, including test_registration_actual_local_form_and_safety_exceptions with the changed line (307/308 x localhost/127.0.0.1 each give exactly one /submit POST, cookie auth=fixture sent, hidden csrf in the body, nothing reaches /redirected). That is real-browser evidence for redirect:'error', cookies and body encoding. Caveat: that fixture disables page JS, so the listener-based ISS-373 attack is not live there.
- The one-line test change is a legitimate consequence of redirect:'error' (it previously asserted the redirect to the approved host was followed). It is not a weakened leak assertion, but it is a behaviour change: redirects to APPROVED hosts are now refused too.

What the harness proves: the shipped script's logic (gather/validate/compare, single snapshot, no form.submit/FormData, body from the snapshot, option `redirect:'error'` passed, rejection mapped to uncertain). It cannot prove Chrome's redirect semantics (its fake fetch implements them), real DOM clobbering, page-overridden globals, or listener timing.

Code review:
- Success: `submitted/awaiting_confirmation` is returned when fetch resolves (opaque under no-cors). A 4xx/5xx still gives `submitted`; the old native path had the same weakness and the status is documented as never being proof. A redirect, network error or timeout gives `uncertain`. No path reports a blocked submission as registered.
- Likely functional regression: the common post/redirect/get 302 on real sites now returns `uncertain` although the server accepted the data. Safe direction, but operators will see false "not confirmed". Select/textarea/other controls now refuse (`unsupported_form`) where the old script submitted them.
- No remaining form.submit, requestSubmit, click, location assignment or sendBeacon in the registration path. The snapshot is the thing sent (final gather, then body from it, compared with the pre-validation one).
- Target check on the resolved URL: probe against unmutated code refused evil.example, protocol-relative, `127.0.0.1@evil.example`, userinfo, upper-case, other port, https; relative action accepted. Note `<base href>` is not used for formaction (resolved against location), which stays consistent with what is sent.
- Low notes: page can override global `fetch`/`URL` (page is the approved host); form fields named `elements`/`method` can clobber (throws -> `browser_failure`, or empties the consent scan but sends nothing extra).

Contracts: no criterion on registration redirects or confirmation detection exists (umesh-calendar-attendance C3 only forbids registration invocation); no contradiction.

Mutations (own harness, per-mutation byte backup, finally-restore, 200 s timeout): redirect:'follow' KILLED (4 failed); drop pre/post comparison KILLED (3 failed); treat rejected fetch as success KILLED (1 failed). SURVIVED: dropping the target-host check and credentials:'include' -> 'omit' (all 15 green): coverage gap, ISS-REGSAFE-002. Two of my first-pass mutations were bad (no-op / pattern miss) and were discarded. HEAD fidelity: sb_join.py hash 8a2ff458a608a849d65b3d27f81829ab71ca7889 equals HEAD blob; status clean.

ISSUES-WRITTEN: ISS-REGSAFE-002 (medium), in qa/issues.regsafe.jsonl

## Conditions
Leave ISS-373 and ISS-374 `open`. The real-Chrome test passed once under my incidental run; the owner should re-run it under controlled conditions before marking them verified. Add the ISS-REGSAFE-002 cases (static unapproved targets, credentials) before relying on the offline suite alone.

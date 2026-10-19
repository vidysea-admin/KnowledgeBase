# Checker verdict: w29-realchrome-373-374 (real-Chrome verification of ISS-373 / ISS-374)

VERDICT: HOLD
Cycle checked: 0
Reviewed SHA: 4ca0271e3a8be2b6b7efc199280bd165493e9e77
Scope: replaces fake-driver-only verdict 7780542e. Owner approved a local headless Chrome run 2026-10-19. Localhost fixtures only, no external network, no real registration pages. No candidate source or test was edited.

## Short answer
- BEHAVIOR: ISS-374 and ISS-373 both hold in real Chrome (details below).
- FLIP: do NOT flip either row to `verified` yet. The committed real-Chrome regression test is red at this SHA. The behavior evidence is positive, so the flip needs one repair (below), then a re-run of the one node.

## Environment / identity
- Python: main .venv, 3.12.10. Chrome for Testing 155.0.8059.39 `chrome.exe` sha256 b3750f39...cfd083, matching prepared.json. Driver: seleniumbase `uc_driver.exe`.
- Node: codex-primary-runtime 24.19.0, prepended to PATH.
- Lane: `C:\Users\product\Desktop\KnowledgeBase-lanes\w29-realchrome`, branch lane/w29-realchrome from origin/master 4ca0271e.
- Evidence directory (outside the lane): `C:\Users\product\AppData\Local\Temp\claude\C--Users-product-Desktop-KnowledgeBase\f9384bb3-0372-48e6-a6e1-76e2f748d07c\scratchpad\w29rc\`
  - real.out (run 1), real2.out, real3.out, real4.out, off.out, adm.out
  - replay2.json (clean replay), replay-mut.json (mutant replay)
  - replay_realchrome.py (sha256 prefix 1441e08fcaf5424a)

## Note on the brief
The `dom_fixtures` names are only in test_sb_join_admission.py (lobby/platform detection, not registration). The two registration files named in the brief are node/fake-DOM and fake-CDP suites, not real Chrome. The only committed real-Chrome registration test is `test_sb_join_iframe.py::test_registration_actual_local_form_and_safety_exceptions`. I ran all of them.

## Results (pass / fail counts)
| Run | Exit | Result |
|---|---|---|
| test_sb_join_registration_redirect.py + test_registration_cdp.py (offline, node harness + fake CDP) | 0 | 203 passed, 0 failed |
| test_sb_join_admission.py -k dom_fixtures (real Chrome, previously deselected) | 0 | 22 passed, 0 failed (15 deselected) |
| test_sb_join_iframe.py::test_registration_actual_local_form_and_safety_exceptions AS COMMITTED (default basetemp) | 1 | 0 passed, 1 failed |
| same, short basetemp `C:\w29bt\b3` | 1 | 0 passed, 1 failed |
| same test, copy with ONE assertion relaxed (checker-derived, untracked, deleted afterward) | 0 | 1 passed |
| Checker real-Chrome replay (POST count per target, 16 cases) | 0 | 16/16 as expected |
| Mutant replay (in-process `redirect:'follow'`, no file touched) | 0 | leak reproduced, 4/4 307/308 cases |

## FAILURES of the committed real-Chrome test (exact)
1. Default basetemp (long scratchpad path). Run twice, same result.
   `test_sb_join_iframe.py:329` `AssertionError: {'result': {'type': 'object', 'value': {}}, 'exceptionDetails': {... 'text': 'Uncaught (in promise) Error: Internal error while updating dynamic rules.'}}`
   Raised from `evaluate("installRegistrationPolicy(...)")` at line 339 (extension declarativeNetRequest.updateDynamicRules).
   This vanished with a short profile path (`C:\w29bt\...`). The cause is probably profile path length, but I did not prove that. It is an environment sensitivity, not a registration-logic fault.
2. With the short path, the next failure is at `test_sb_join_iframe.py:358`:
   `assert result == {"status": "action_required", "reason": reason}` fails because `register_form` now also returns `'submissionDisposition': 'not-attempted'` (sb_join_register.py `not_attempted()`). The expected dict is stale (first case: `<input name="unknown" required>`).
   Concrete fix (maker): compare `status` and `reason`, and assert `submissionDisposition == 'not-attempted'`, or add the key to the expected dict. Also pin a short or explicit `--basetemp` or profile dir for the Chrome profile, or document it.
   Relaxing only that assertion (copy `_w29_replay_iframe.py`, one `replace`, deleted afterward) makes the whole test pass (exit 0, 1 passed, 13.3 s). That includes the in-test ISS-374 loop: for each of 307 and 308, redirect host localhost and 127.0.0.1, `posts == [{"path": "/submit", ...}]`, cookie `auth=fixture` once, `resources_seen == []`.

## ISS-374 replay, real Chrome, POST count per target (replay2.json)
| Case | Result | POSTs per target |
|---|---|---|
| 307 -> localhost:/redirected | uncertain / submission_not_confirmed | /submit 1, /redirected 0 |
| 307 -> 127.0.0.1:/redirected | uncertain / submission_not_confirmed | /submit 1, /redirected 0 |
| 308 -> localhost:/redirected | uncertain / submission_not_confirmed | /submit 1, /redirected 0 |
| 308 -> 127.0.0.1:/redirected | uncertain / submission_not_confirmed | /submit 1, /redirected 0 |
| control, clean 200 | submitted / awaiting_confirmation | /submit 1 |

The body matches the validated body byte for byte every time.

Mutant (in-process `redirect:'follow'`, per rule: no disk edit, so no restoration was needed). All four 307/308 cases gave /submit 1 plus /redirected 1 with the identical body, and the result was `submitted`. This reproduces the ledger leak, so the replay bites and the fix is what prevents it.

Original ledger rows: two POSTs and `submitted` before the fix. Now one POST and `uncertain`.
- Reproduction 1 (307): 1 POST, no forward. Result `uncertain`, not `submitted`.
- Reproduction 2 (308): 1 POST, no forward. Result `uncertain`, not `submitted`.
- Score against the ledger's two recorded reproductions: 2/2 fixed.

## ISS-373 replay, real Chrome, page scripts ENABLED (replay2.json)
`register_form` runs `script_isolated=True` with a trivial `policy_check`. The listeners were therefore live, so this goes beyond the committed test. That test sets `Emulation.setScriptExecutionDisabled` and asserts `pageScriptRan` is False, so it cannot exercise the listeners.

| Mutation | Result | POSTs per target |
|---|---|---|
| input/change/submit listener: action -> localhost/exfil | submitted | /submit 1, /exfil 0 |
| ... formaction -> localhost/exfil | submitted | /submit 1, /exfil 0 |
| ... add required consent checkbox | submitted | /submit 1 |
| ... add checked consent | submitted | /submit 1 |
| ... swap hidden csrf | submitted | /submit 1 |
| ... swap email value | submitted | /submit 1 |
| ... add hidden field | submitted | /submit 1 |
| prototype `value` setter hook changing action | action_required / redirect_host | none |
| prototype `value` setter hook adding required consent | action_required / required_consent | none |
| setInterval changing action to exfil | action_required / redirect_host | none |
| listener doing `form.submit()` to exfil | submitted | /submit 1, /exfil 0 |

- Every body equals the validated body (`first=Fixture&last=Operator&email=fixture%40example.test&csrf=token`).
- No POST ever reached /exfil or any mutated destination.
- "submitted" with the listeners present is expected. The REGISTRATION_JS flow never dispatches DOM events. It sets values through the native setter and sends the validated snapshot via `fetch`, so the listeners never run. Proven by /exfil 0 and unchanged bodies.
- Hostile setter hooks and timers that act before or during validation are refused with zero POSTs.

## Findings (all in scope)
- F1 (blocks the flip): stale expected dict at test_sb_join_iframe.py:358. See above. Maker repair is one line. Re-run that single node.
- F2 (should fix; does not block): the committed test is sensitive to the Chrome profile path (`Internal error while updating dynamic rules` with the long default pytest basetemp). The fix is a short, fixed profile directory or a clear skip or diagnostic.
- F3 (coverage note; does not block): the committed real-Chrome test runs with page scripts disabled, so it never exercises ISS-373 listeners. My replay above covers that. Consider adding it to the suite. ISS-REGSAFE-001 (real-browser proof of fetch submit) is answered: the fetch submit works in real Chrome with cookies and CSRF fields (control case and clean case).

## Ledger recommendation
- ISS-374: behavior verified in real Chrome (2/2 recorded reproductions, mutant bites). May flip to `verified` once F1 is repaired and the iframe registration test node is green on a re-run.
- ISS-373: same condition.
- ISS-REGSAFE-001: behavior answered; may close together with the above.
- Not verified: any external or real registration page, service-worker observation beyond `Network.setBypassServiceWorker`, and CDP Fetch interception in real Chrome (only fake CDP covers that).

ISSUES-WRITTEN: none
Accounting: checker usage tokens are not exposed to this subagent (null). Elapsed is about 25 minutes. Maker denominator unknown, so the ratio is unverified.

# iss-373-374-registration-redirect-and-post-validation

Status: ready-for-check
**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 1 (open HIGH ledger issues ISS-374, ISS-373). Class: security (data disclosure of registrant values; submission integrity): full ceremony.
Lane: lane/regsafe. Ledger for this lane: qa/issues.regsafe.jsonl, ids ISS-REGSAFE-NNN. Existing rows ISS-373/ISS-374 NOT edited (checker flips status).

## Scope
Single file of production code: `packages/meeting-bot/py/sb_join.py` (both issues live in `register_form`; same package, so both done). No contracts/DECISIONS/ARCHITECTURE touched.
- New module constant `REGISTRATION_JS` (was an inline string). Validation, snapshot and submission happen in ONE synchronous script; no form.submit(), no FormData (so no 'formdata'/'submit' listeners run); the request body is built from the validated control list.
- ISS-374: the POST is `fetch(target, {redirect:'error', credentials:'include', mode:'no-cors'})`. Any 3xx (307/308 included, even to an approved host) rejects without a second request; result is `uncertain/submission_not_confirmed` (never resubmitted).
- ISS-373: gather() (all control, consent, target, method, encoding checks) runs before value injection, after injection and after `checkValidity()` (the only point listeners can run); body, target and form identity must be identical or the script returns `changed_after_validation` and sends nothing. Unsupported control types now refuse (`unsupported_form`). Python verifies the returned target host/scheme/port and the sent operator values equal the validated ones, else `uncertain/submitted_mismatch`.
- `test_sb_join_iframe.py`: redirect loop expectation changed to a single `/submit` POST (real-Chrome test, NOT run).
- Tests: `test_sb_join_registration_redirect.py` (15), fake DOM/server harness `fixtures/regsafe_dom_harness.mjs` (runs the real REGISTRATION_JS under node).

## Evidence
Command (from packages/meeting-bot/py, venv python, timeout-wrapped): `timeout 300 .venv\Scripts\python.exe -m pytest test_sb_join_registration_redirect.py -q -p no:cacheprovider`
Output: `15 passed in 34.75s`

Reproduction counts:
- ISS-374: 2/2 recorded reproductions refused (`test_iss_374_redirect_to_unapproved_localhost_is_not_followed[307|308]`: one POST to the approved host, zero to localhost). Control test shows that with `redirect:'follow'` the fake server records two identical-body POSTs (127.0.0.1 then localhost), i.e. the recorded leak.
- ISS-373: the row records no enumerated reproductions; its evidence text names listeners changing action/formaction or consent. Derived from that text plus the `steal` script in test_sb_join_iframe.py: 8/8 refused with zero POSTs (action, formaction, action to localhost, added required consent, checked consent, swapped mapped value, swapped hidden csrf, injected field). The substitution of corpus is therefore mine and is named here.

Mutations (harness `.regsafe-mutharness.py`, untracked, deleted; byte backup restored in finally; timeout 240 s per run): redirect:'follow' KILLED (4 failed); body comparison removed KILLED (3); final gather removed KILLED (8); Python values check removed KILLED (1). After: `git hash-object packages/meeting-bot/py/sb_join.py` = 8a2ff458a608a849d65b3d27f81829ab71ca7889, equal to the committed blob.

## NOT covered
- No real browser run (CPU shared with Chrome worker): fake fetch assumes standard spec behaviour for `redirect:'error'`. The updated real-Chrome test is unrun. See ISS-REGSAFE-001.
- Native navigation/response rendering is gone; opaque response means only "request completed" is known. Redirects to approved hosts are also refused.
- Service-worker observation relies on the existing `Network.setBypassServiceWorker`; the CDP Fetch request-stage interceptor from the ISS-374 fix_direction is not built.
- Typecheck not applicable (Python only); no TS package touched. Full pytest suite and test_sb_join_ownership not run.

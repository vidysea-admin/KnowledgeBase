# w27-regredirect

Status: ready-for-check
Fix cycle: 0
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w27-regredirect (branch lane/w27-regredirect)
Base: 4264418c (origin/master). Candidate: the commit carrying this manifest (HEAD of the lane).

## Finding on arrival
ISS-374 and ISS-373 were already fixed in code at base (REGISTRATION_JS in sb_join_register.py: one synchronous
gather/validate/snapshot/submit, body built from the snapshot, redirect:'error'; PASS verdict
qa/verdicts/iss-373-374-registration-redirect-and-post-validation.md; T-052 CDP interceptor). Ledger rows still `open` (not flipped here).
This unit adds the missing regression coverage and closes the two residual gaps.

## Changed paths
- packages/meeting-bot/py/registration_cdp.py: ISS-REGCDP-002 guard in submit_with_redirects (follow mode only with exactly one distinct approved host; otherwise redirect:'error', reported as cdp inactive / multiple_approved_hosts).
- packages/meeting-bot/py/test_sb_join_registration_redirect.py: ISS-REGSAFE-002 static-target cases (7 URLs x form.action / button formaction) + credentials/Content-Type pins + approved-target control.
- packages/meeting-bot/py/test_registration_cdp.py: ISS-REGCDP-002 tests; the old two-host end-to-end test is replaced (the connector is no longer used with two hosts).
- packages/meeting-bot/py/fixtures/regsafe_dom_harness.mjs: records credentials/headers/url per fake POST; scenario.buttonFormAction; scenario.formAction resolved like DOM form.action.
- sb_join.py, sb_join_register.py, sb_join_ownership.py: NOT edited.

## Policy flag for the owner
ISS-REGCDP-002 fix_direction said "decide with the owner". Implemented the first option listed (fail closed: no CDP follow mode with more than one approved host). Strictly tighter than before; with one approved host behaviour is unchanged. Revert is one line if the owner prefers a DNR rule instead.

## Checks for the checker
cd packages/meeting-bot/py; <KnowledgeBase>/.venv/Scripts/python.exe -m pytest -p no:cacheprovider --basetemp=<tmp> test_sb_join_registration_redirect.py test_registration_cdp.py
(node harness only, fake driver, no Chrome; node path hard-coded in the test or LKB_NODE).

## Evidence
- Baseline before edits: 186 passed. After: 203 passed (244.8 s under load).
- D-015: ISS-374 reproductions 2/2 refused (307, 308 to unapproved localhost: one POST to 127.0.0.1, zero to localhost; with and without CDP interceptor). ISS-373 row records no reproductions: 8/8 derived mutation cases refused, zero POSTs. ISS-REGSAFE-002: the row's 7 named cases 7/7 x 2 attributes = 14/14 refused with zero posts, plus clean-case credentials/Content-Type pins. ISS-REGCDP-002 has no recorded reproductions: 307 and 308 to a second approved host, 2/2 send exactly one POST, redirect:'error'.
- Not exercised: real Chrome / real DOM listeners / real CDP disconnect (offline fake only, by instruction).
- D-020 mutations (per-mutation backup + trap, scripts outside repo, hash after):
  - M1 drop target-host test: killed (test_iss_regsafe_002...[LOCALHOST formAction]).
  - M2 credentials include->omit: killed (test_iss_374_clean_submission...).
  - M3 remove multi-host guard: killed (test_iss_regcdp_002...[307]).
  - M4 redirect always 'follow': killed (test_iss_374_redirect_to_unapproved_localhost...[307]).
  - M5 skip final re-gather: killed (test_iss_373_mutation_after_validation...[action]).
  - Restored files: sb_join_register.py hash == HEAD blob; registration_cdp.py == pre-mutation working copy (cmp).

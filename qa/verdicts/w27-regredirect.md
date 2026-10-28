# Verdict: w27-regredirect

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: 7bb57bdfe991125ab39e4259be6bf7e9c5c6418f
Base: 4264418c (origin/master)
Reviewer: Sonnet 5.5 (Opus at weekly limit; this is a Sonnet review of a security-class unit, flagged for the orchestrator).
Rows: ISS-374, ISS-373, ISS-REGSAFE-002, ISS-REGCDP-002.

## Identity
Lane HEAD == 7bb57bdf, tree clean before my work. Changed: registration_cdp.py, test_registration_cdp.py, test_sb_join_registration_redirect.py, fixtures/regsafe_dom_harness.mjs (+ manifest). sb_join.py, sb_join_register.py, sb_join_ownership.py not touched (diff checked).
Final blobs (autocrlf=true hash == HEAD blob): registration_cdp.py 4e54e1dbb793bb7fdc2feaf4ece5ab0ed8eb9d27; test_registration_cdp.py 8e3951e4bb8c3bd5f62ba3538fc93f387848d81e; test_sb_join_registration_redirect.py bb0c922e09e533c7f1a0ede829b35a4422ae77b6; regsafe_dom_harness.mjs 69d217e24f9edfc839c8a75739c379b95a2e8ec0.

## 1. "ISS-374/373 already fixed at base" - CONFIRMED independently
git-archived base 4264418c packages/meeting-bot/py into the scratchpad and ran test_sb_join_registration_redirect.py there: 16 passed (exit 0), including the ledger's two ISS-374 reproductions verbatim (307 and 308 from approved 127.0.0.1 to unapproved localhost: one POST to 127.0.0.1, zero to localhost) and the 8 ISS-373 derived mutation cases (the ISS-373 row records no reproductions, so the derived cases are the floor). Code read: sb_join_register.REGISTRATION_JS at base already does one synchronous gather/validate/snapshot, builds the body from the snapshot, no form.submit/FormData/requestSubmit, fetch redirect:'error' unless redirectMode=='follow'. The candidate does not change it.

## 2. Submission-path audit
- Redirect follow: only via redirectMode 'follow', set solely in registration_cdp.submit_with_redirects after a live interceptor start + heartbeat; now only with exactly one distinct normalised approved host. Zero or two-plus hosts: connector dropped, redirect:'error', result annotated cdp=inactive / cdp_reason=multiple_approved_hosts. An empty set (unnormalisable hosts) also fails closed (!= 1).
- form action / button formaction: JS resolves `formaction || form.action` against location, checks hostname in allowedHosts, protocol, port, userinfo, target/formTarget, and the POST goes to exactly that checked URL (final.target.href). Tests: 7 static targets x {form.action, button formaction} = 14, each action_required/redirect_host with zero submit runs; plus an approved-target control. The harness now resolves formAction like DOM form.action; buttonFormAction is a raw attribute, as getAttribute returns it.
- No native submission anywhere (no submit/requestSubmit/click/location assignment), so native formaction/formmethod/formenctype semantics cannot bypass the check; method/enctype are also gated (unsupported_form).
- NOT covered by the tests (named per brief): (a) JS fetch/XHR/sendBeacon issued by page scripts - not constrained by this code; relies on script_isolated, CSP form-action (does not govern fetch) and the DNR allow-list; none exercised offline. (b) meta refresh / location navigation - a GET carrying no operator values, not a form submission, untested. (c) Real Chrome redirect semantics, real DOM clobbering and listener timing (fake DOM/fetch only; harness hooks only checkValidity). (d) Real CDP disconnect mid-submit with one approved host: Chrome resumes paused requests; ISS-REGCDP-002 itself says the DNR allow-list is what blocks unapproved hosts then - not exercised. (e) Empty formaction="" attribute falls through to form.action via `||`; the sent URL equals the checked URL so no bypass, noted only.

## 3. One approved host unchanged
The guard is a no-op for exactly one host (dedup/normalise: "localhost" and "localhost." count as one). test_iss_regcdp_002_control_single_approved_host_still_follows passes (redirect:'follow', submitted); all pre-existing single-host CDP tests (302 approved, 307/308 unapproved refused with interceptor, extra POST, heartbeat) still pass. Only the old two-host end-to-end test was replaced (its premise, the connector being used with two hosts, is the removed behaviour).

## 4. Operator values vs unapproved host
The body is sent only to the validated target. Redirects: without CDP any 3xx rejects (one POST). With CDP, check_redirect/check_url require exact approved host, origin scheme and port, no userinfo, no backslash/control chars, ascii only, and 307/308 only to the same host as the redirecting request. A query string on a Location is only reachable on a host that already passed the host check; 301/302/303 become body-less GETs. Unapproved Location replay (localhost:50707/redirected): zero POSTs to localhost with and without the interceptor. Multi-host: 307/308 to a second approved host now sends exactly one POST (redirect 'error'), connector never invoked.
Added pins: credentials 'include' and Content-Type header asserted in the clean case; harness records credentials, headers, url.

## 5. Tests (independent)
`pytest -p no:cacheprovider test_sb_join_registration_redirect.py test_registration_cdp.py` with KnowledgeBase/.venv python 3.12.10, timeout 600, node via the codex runtime path, fake driver, no Chrome: 203 passed in 509 s (exit 0). Matches the maker's 203. Base-side run of the first file: 16 passed (above). (One of my scratchpad output files was overwritten by an unrelated agent; I re-ran under a unique name.)

## 6. Own mutation
registration_cdp.py guard `!= 1` -> `< 1` (two approved hosts allowed to follow). Per-mutation byte backup, `timeout 300`, trap INT/TERM/ERR, explicit restore + cmp. Result: test_iss_regcdp_002_307_to_other_approved_host_sends_exactly_one_post[307] and [308] FAILED (2 failed, control passed). The ERR trap's first restore used a relative path and printed `cp: cannot stat` (my script flaw, harmless); the explicit end-of-script restore ran and cmp was OK. HEAD fidelity: `git -c core.autocrlf=true hash-object registration_cdp.py` = 4e54e1dbb793bb7fdc2feaf4ece5ab0ed8eb9d27 = HEAD blob; git status clean; helper scripts deleted.
Maker mutations M1-M5 were not re-run (one independent mutation per the brief).

## Findings
None blocking. Notes (not issues): (1) functional regression, safe direction: with 2+ approved hosts a POST-redirect-GET 302 now reports uncertain/submission_not_confirmed even when the server accepted it (the orchestrator accepted the fail-closed ruling). (2) The unexercised items in section 2 remain residual risk for real Chrome.

ISSUES-WRITTEN: none

## Ledger flips
- ISS-REGSAFE-002 (coverage gap): may flip open -> verified. Static-target cases and credentials/header pins exist and bite.
- ISS-REGCDP-002: may flip open -> verified (fail-closed option, ruling accepted by the orchestrator; my mutation was killed).
- ISS-374 and ISS-373: fixed at base, regression coverage now complete offline; may flip to verified for the offline scope. The earlier verdict's condition (controlled real-Chrome re-run of the test_sb_join_iframe registration test) was NOT satisfied by me (no Chrome allowed). Flip only if the orchestrator accepts that earlier incidental real-Chrome pass (14 passed) as sufficient; otherwise leave open with that single condition.

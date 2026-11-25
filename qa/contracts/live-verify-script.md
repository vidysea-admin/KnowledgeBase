# Contract — live-verify-script (unit L1, D-227)

> Status: adopted by /checker 2026-11-25. Authority: D-227; plan section 6 L1, quoted in `qa/feedback-inbox.md` ("unit-level checks for wave 1"). Scope: `scripts/live-verify.mjs`.
> Owner's words: "Extend `scripts/live-verify.mjs` with `--base` and the env names `LKB_LIVE_EMAIL`, `LKB_LIVE_PASSWORD`"; check: "runs green against the test tag".
> The maker's reading lines [L1-a..c] were accepted with the tightenings below. This script covers the scripted part of launch row G01 only (`go-live-acceptance.md`).

## Criteria
- **[L1-C1] `--base`.** `node scripts/live-verify.mjs --base <origin[/base-path]>` sends every request to that deployment, with the base path (for example `/knowledgebase`) and a trailing slash handled
  on every route; only `http:`/`https:` bases are accepted, anything else exits non-zero with a clear message. Without `--base` the script's behaviour, flags (`--key`, `--skip-ask`, the existing env
  names) and exit codes are unchanged.
- **[L1-C2] Credentials.** With `LKB_LIVE_EMAIL` and `LKB_LIVE_PASSWORD` set, the script signs in through the real session-login route (CSRF handled as the session guard requires) and runs its
  checks as that user. The password and the session cookie never appear in argv, stdout, stderr, thrown error text or any written file (a test greps all captured output and written files for a sentinel
  password). There is no `--password` flag. Sign-in needed but credentials missing, or a rejected login, gives a clear non-zero exit.
- **[L1-C3] Ask step.** The script asks the pinned UC question (text kept in a committed file, not inline) and asserts the answer carries at least one citation with a speaker, a start time and an end
  time, end greater than start, all present; then opens the cited turn and asserts it is the cited turn id and its time range matches the citation.
- **[L1-C4] Viewer refusal.** The script requests the admin, ingest, WhatsApp and meeting-bot routes as the signed-in viewer and asserts HTTP 401 or 403 (404, 5xx, 200-with-error and network failure are
  FAIL, not "refused"); the manifest lists the route set, and each route is proven to exist (a control request with an admin/key principal does not return 404) so a typo cannot read as a pass.
- **[L1-C5] Sign-out.** After sign-out the same cookie gets 401 on a route that returned 200 before it.
- **[L1-C6] Reporting.** One PASS/FAIL line per step; non-zero exit on any FAIL; the final output lists the G01 steps it did not cover (phone network, sign-up, admin approval).
  The script makes no data-changing call other than login, logout and the Ask request.
- **[L1-C7] Unit check (owner's).** A run against the test-tag URL exits 0 with every step PASS; the evidence header of `go-live-acceptance.md` [GI1] applies (revision, images, time).
  This run is the unit's own acceptance; it does not by itself satisfy G01.

## Invariants
- **[L1-I1]** Existing `live-verify.mjs` tests and runs (no `--base`, key mode) stay green untouched.
- **[L1-I2]** No secret in the repository; the live account is a viewer, not an admin.

## Out of scope
Sign-up and admin-approval automation (human steps in G01). Consent (D-210).

## Amendment log
- 2026-11-25 · routine · created. Maker reading [L1-a]->C1 (tightened: base path, scheme), [L1-b]->C2 (tightened: no flag, no secret in error text), [L1-c]->C3-C6 (tightened: 401/403 only, route existence, sign-out proof, uncovered-steps line); owner's check -> C7 · folds inbox "unit-level checks for wave 1" (D-227)

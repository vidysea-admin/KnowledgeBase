# Verdict: w25-pageagent

VERDICT: PASS
Cycle checked: 1
Reviewed SHA: e9d1d70b86b298248b93a90b8b0a4d016ea655d2
Base: 50c320a6505a3d7d2802b42167b2a854355d5cd4
Prior: cycle 0 FAIL at b395fb68 (section below, superseded by this cycle-1 PASS)

## Cycle 1 evidence (independently produced)
- `.venv python -m unittest test_page_agent test_sb_join_onair`: exit 0, Ran 52 OK.
- `tsc --noEmit -p packages/meeting-bot/tsconfig.json`: exit 0. `node scripts/lint-loc.mjs`: exit 0 (1778 files).
- Re-run of my cycle-0 probes (page_agent_guard.check_action/check_page on synthetic elements):
  - F1 fixed: "reserve my spot", "go" (submit/form flags or type=submit), "rsvp", "next", "get access", input type=image all refused with the gate closed; register click allowed only with goal=register AND allow_submit; typing and selecting refused on non-register goals; typed value outside the profile refused.
  - F2 fixed: continue with facebook/apple/microsoft, sign in with sso, login with okta, github all refused before the click.
  - F3 fixed: pin, ssn, secret, p4ssw0rd, "pass word", p@ssw0rd, pa$$word, passwd, "social security number" and type=password refused. Bot-check detector (`check_page`, run before the model in `run_agent`, including iframe text) refuses "Sign in to confirm you're not a bot", "verify you are human", "unusual traffic", "I'm not a robot", captcha.
  - Action-time re-verification unchanged and still re-runs all guards on the fresh element.
- D-020 mutation (fresh): in `check_page`, the BOT_RE test replaced with `if False and any(`. Killed: test_f3_bot_check_detector_is_code_level FAIL plus 1 ERROR (30 tests, exit 1). Absolute-path backup, trap EXIT/INT/TERM/ERR, timeout 300. After: `git -c core.autocrlf=true hash-object` d1675eba... equals `git rev-parse HEAD:` blob; git status clean.
- Live evidence qa/evidence/w25-pageagent-live.md is maker-produced and not re-run (no Chrome allowed); it shows two fail-closed refusals at the YouTube bot check with no profile or submit flag set. Fail-closed path is confirmed by code and tests.

## Residual notes (low, not issues)
- Bot-check wording gaps: "confirm you are not a bot", "verify you're a  human" (double space), "Are you human?" are not matched by BOT_RE; the model prompt and AUTH_RE ("not a bot", "captcha" on elements) still cover the common YouTube case.
- A `div role=button`/`[onclick]` control outside a form with a non-keyword name (JS-handled submit) is not structurally gated; cannot be detected from the DOM list.
- Iframe click still clicks the centre of an embedded player (model-only decision for content inside); step timeout still only checked at step start; popups not location-checked.
- Legacy OnAir path changed in a363e7c4 (flag-off, LKB_ONAIR_WATCH=1) was not separately security-reviewed; 22 legacy tests pass.
- Mutation harness note from cycle 0 (relative path) was my own error and is not repeated.

Ledger rows: may be flipped for w25-pageagent. ISSUES-WRITTEN: none

---
# Cycle 0 record (superseded)

Cycle-0 outcome: FAIL
Cycle-0 checked: 0
Cycle-0 reviewed SHA: b395fb6845ae3c4c51f148b9ae9c701673764efa

Checker: independent, security class (credential and consent handling)

## Independently produced evidence
- `.venv python -m unittest test_page_agent test_sb_join_onair` (packages/meeting-bot/py, timeout 600): exit 0, Ran 45, OK.
- `tsc --noEmit -p packages/meeting-bot/tsconfig.json` (timeout 600): exit 0.
- Guard probe (scratch script calling `page_agent_guard.check_action` on synthetic elements, no browser): outcomes below.
- D-020 mutation (host allowlist): `host_ok` body replaced with `return True`. Killed: test_page_agent 1 FAIL (test_location_guard) + 1 ERROR (exit 1). Per-mutation backup, trap on EXIT/INT/TERM/ERR, timeout 300. CHECKER HARNESS DEFECT: the script cd'd before the trap fired, so the relative-path restore failed; recovered with `git checkout --` of that one file. Final `git -c core.autocrlf=true hash-object` = 2b30b662... = `git rev-parse HEAD:` blob; git status clean.

## Confirmed code-enforced (model output cannot bypass)
- Password/OTP/card by `type`, autocomplete (current/new-password, one-time-code, cc-*) and label/name/placeholder regex.
- Typed and selected values must be in LKB_AGENT_PROFILE values; empty profile refuses all typing.
- Action index must be a real int in range (bool, float, string, negative refused). Unknown actions refused.
- Host allowlist: https only, `javascript:`, `data:`, `http:`, userinfo trick (`start@evil.com`), `youtube.com.evil.com` all refused for `a`/`iframe` hrefs; location re-checked at the start of every step; fail closed (AgentRefused -> OnairRefused -> `fatal`, exit 1, no capture).
- Action-time re-verification re-enumerates, requires the same element and re-runs every guard on the fresh element.
- JSON: first balanced object, non-dict rejected, index must be int; extra fields ignored (harmless).
- Flag off: sb_join.py takes the agent path only when LKB_PAGE_AGENT=1 on an OnAir URL.

## Findings
### F1 HIGH (security class: data write/consent) - submit gate is a keyword denylist
`page_agent_guard.py:15,57`. REGISTER_RE only knows regist/sign up/submit/confirm/complete/join-event. With goal=play and allow_submit=False, the probe shows these clicks ALLOWED: "reserve my spot" (type=submit), "continue" (type=submit), "rsvp", "next", "get access", `input type=submit value=go`. Because `type` into profile fields is permitted under any goal (line 59-65), the agent can fill a form and submit it with no LKB_AGENT_ALLOW_SUBMIT approval. This contradicts the stated invariant "register and submit are refused unless goal is register AND LKB_AGENT_ALLOW_SUBMIT=1".
Fix: have ELEMENTS_JS report `form` membership and `submits` (input[type=submit], button whose form owner exists and type submit, role=button inside a form). In `check_action`, for click, refuse any form-owned or submit control unless the gate is open. Track in ctx that a `type`/`select` has run this session and gate every later non-navigation click on form controls. Add tests with the non-keyword names above.

### F2 MEDIUM (security class: OAuth) - OAuth provider buttons not refused
`page_agent_guard.py:11`. AUTH_RE has only "continue with google". "continue with facebook/apple/microsoft/linkedin/github" and generic SSO buttons with no href are ALLOWED (button clicks are only caught after the fact by `check_location` on the next step, after the OAuth page has loaded). Fix: match `(continue|sign|log)[ _-]*(in|up)?\s*(with|using)\b|\bsso\b|facebook|apple|microsoft|linkedin|github` against name/text/trail, and prefer refusing any `button`/`role` control whose click can navigate when the start host is not the target (or snapshot the URL and refuse a click that changes host before the next model call).

### F3 LOW - secret-field heuristic gaps
SECRET_RE misses `pin`, `ssn`, `secret`, `p4ssw0rd`, `pass word`. Typing a profile value into such text fields is ALLOWED. Fix: add `\bpin\b|ssn|secret|pass\W*w` and treat `type=password`-like names after stripping digits/spaces.

### F4 LOW - residual, not code-enforced
- Clicking an `iframe` clicks its centre; an embedded sign-in or bot-check prompt inside an allowed player host is not visible to the guard (model-only).
- The YouTube "confirm you're not a bot" refusal was by the model only. No code checks page text for bot-check or sign-in walls. The fail-closed path (refuse -> fatal, exit 1) is confirmed by code and unit test, but the live log `agent-live1.jsonl` is not committed and not in the lane, so the live result is NOT VERIFIED by me.
- 240 s timeout is checked only at step start; model retries (3 backoffs x providers x 60 s) can overrun it.
- Popups or new tabs are not checked by `check_location`.

### Scope note
Flag-off behaviour is unchanged for non-OnAir URLs. For LKB_ONAIR_WATCH=1 with LKB_PAGE_AGENT unset the legacy path still changed (commit a363e7c4: trusted click, card selection, player-iframe play); that is covered by 22 legacy tests and was not separately reviewed for security here.

## Not verified
Live run and its log; registration fill on a live form; second mutation on the submit gate (F1 is proven by the probe instead); real Chrome (not permitted).

## Ledger rows
No rows may be flipped. Maker must fix F1 and F2 (F3 recommended) and resubmit as Fix cycle 1.



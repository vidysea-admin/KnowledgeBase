# w25-pageagent (verdict 1bd56f26 FAIL at b395fb68; fix cycle 1 below): generic vision page agent (replaces the hard-coded OnAir Watch-now logic)

Status: ready-for-check
Fix cycle: 1
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w25-onairfix (branch lane/w25-onairfix), base origin/master 50c320a6
Candidate: the commit that adds this file (`git log -1 lane/w25-onairfix`); earlier lane commits a363e7c4 (diagnosis) and 5624ca60 (agent).

## Why
Live OnAir runs refused with "no Watch now control found". Diagnosis on the real pages: the link text is "video_youtube\nWatch now" (material-icon ligature), a hero Watch-now button only scrolls, and a scripted click is untrusted. Per Umesh the fix must not be platform-specific selectors: a page agent that looks at the page and decides.

## Where (deviation from the brief, stated)
The brief named `packages/meeting-bot/src/page-agent/` (TS). The bot Chrome is owned by the Python process (sb_join.py, SeleniumBase driver); a TS agent would need a new IPC to a browser it does not own. The agent is therefore Python, next to the driver: `py/page_agent.py` (loop), `py/page_agent_guard.py` (guardrails), `py/page_agent_model.py` (model client), `py/sb_join_agent.py` (env wiring). No TS changed in the agent commit.

## Behaviour
Per step (max 15, 240 s overall): CDP JPEG screenshot + indexed list of visible interactive elements -> vision model -> strict JSON {action click|type|select|scroll|wait|done|refuse, index, text, reason}. Model order: Ollama Cloud (OLLAMA_VISION_MODELS, default glm-5.3-flash, deepseek-v4.1-flash) then Gemini (WEBINAR_VISION_MODEL / gemini-2.5-flash); first balanced JSON; 429 backoff 2/4/8 s. Keys from env or LKB_DOTENV (.env), never printed.
Guardrails in code (model cannot override): no typing into password/OTP/card fields; no click or navigation to sign-in, OAuth, account-chooser, consent, captcha controls or hosts; typed or selected values only from LKB_AGENT_PROFILE; no payment controls; register/submit clicks refused unless goal is register AND LKB_AGENT_ALLOW_SUBMIT=1; navigation only on the start host plus player hosts (youtube, youtube-nocookie, vimeo, brightcove); action-time re-verification (same element, still visible, still allowed); step cap; timeout; every step logged to LKB_AGENT_LOG (action, reason, element, screenshot hash).
Wiring: sb_join.py runs the agent instead of onair_prepare when LKB_PAGE_AGENT=1 (and LKB_ONAIR_WATCH=1 on a cloudonair URL); otherwise the old path. A refusal raises OnairRefused -> `fatal` event, exit 1, with the reason. Native Meet/Zoom adapters untouched.

## Checks a checker must run
- `python -m unittest test_page_agent test_sb_join_onair` in packages/meeting-bot/py (45 tests)
- tsc --noEmit -p packages/meeting-bot/tsconfig.json; `node scripts/lint-loc.mjs`

## Evidence
- unittest: Ran 45 tests, OK (23 agent: one per guardrail rule, step cap, timeout, target-changed, done-without-player, location guard, model JSON/429/provider order, wiring; 22 earlier OnAir tests).
- tsc exit 0; lint-loc OK (1778 files). lint-loc --all hit the 120 s stage cap under load on loc, tracker, dependencies; loc passes alone.
- D-020: (1) password/OTP/card type guard raise replaced by `pass` -> killed (1 failure, 1 error); (2) `if AUTH_RE.search(blob):` -> `if False:` (consent/sign-in guard) -> killed (2 errors). Each with per-mutation backup and trap; `git hash-object` after = HEAD blob.
- Live (slot a, seeded, cft, one run): model ollama:deepseek-v4.1-flash. Step 1 click "video_youtube watch now" link (navigated to the watch page). Step 2 model refused: the YouTube player shows "Sign in to confirm you're not a bot". Playback did not start and no media file was recorded (fail closed, "page-agent refused: model refused: ..."). The bot check is YouTube's anti-automation gate, which this work does not and must not bypass or sign in through. Log: agent-live1.jsonl (not committed).

## Not verified
Registration fill against a live form (fixtures only). Any playback on a non-YouTube player. Seeded slot files were deleted after the run.

## Fix cycle 1
- F1 HIGH: ELEMENTS_JS reports `form` and `submit`; on any goal except register-with-approval, clicks on form-owned, submit, image-submit controls and on buttons matching regist/rsvp/reserve/sign up/get access/continue/next/submit/confirm/complete are refused. Typing and selecting are refused unless the goal is register (profile values still required).
- F2 MEDIUM: AUTH_RE refuses "continue/sign/log in|up with|using <anything>", sso, sign-on, facebook, apple, microsoft, linkedin, github, twitter, x.com, okta, auth0 before the click (control text, href, ancestors).
- F3 LOW: SECRET_RE adds pin, ssn, secret, passcode/passwd, social security; a leetspeak-normalised password match. Code-level bot-check detector `check_page` (page text plus text inside iframes via WebDriver, and captcha iframe src) runs every step before the model and fails closed.
- Tests: 30 agent tests (CheckerProbes class, one test per probe) + 22 OnAir = 52. D-020 mutations: form-owner gate (`el.get("form") or` -> `False or`) killed; provider refusal (generic `continue/sign/log ... with|using` alternative removed) killed by test_f2_unknown_provider_refused_even_with_the_submit_gate_open (a first attempt survived because the submit gate also refused those names on a play goal; a gate-open test was added). HEAD-blob hash matches after each.
- Evidence: qa/evidence/w25-pageagent-live.md. The live test still hits YouTube's bot check after Umesh's sign-in; the full recordings were not started.
- Not run again: tsc and lint-loc (no TS or budgeted file changes beyond py); not re-run live after the guard changes.

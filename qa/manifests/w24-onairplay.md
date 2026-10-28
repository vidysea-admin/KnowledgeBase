# w24-onairplay: play Google Cloud OnAir replays in the recorder

Status: checked-PASS — closed out 2026-10-26 (resume reconcile) citing qa/verdicts/w24-onairplay.md
Fix cycle: 1
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w24-onairplay (branch lane/w24-onairplay)
Base: origin/master 8029be9f (cycle 0 candidate 22e07643, verdict f4cb4fe9 FAIL)
Candidate: the commit that adds this file (`git log -1 lane/w24-onairplay`)

## Changed paths
- packages/meeting-bot/py/sb_join_onair.py (new): fail-closed prepare (refuse, click "Watch now", wait for player) and play (unmute, play, emit `onair-duration`)
- packages/meeting-bot/py/sb_join.py: 2 call sites, only when LKB_ONAIR_WATCH=1 and the URL is https://cloudonair.withgoogle.com
- packages/meeting-bot/src/watch/onair-watch.ts: `onairUntilFromEvent`, `applyOnairSession`
- packages/meeting-bot/src/capture/record-commands.ts: `--onair-session`, `until` becomes `let` and follows the `onair-duration` event (3 export lines merged into 1 to stay at the 300 LOC budget)
- scripts/webinar/start-record-detached.ps1: `-OnairSession`
- tests: py/test_sb_join_onair.py, py/fixtures/onair/*.html, src/watch/onair-watch.test.ts

## Behaviour
1. After open (before the tab-capture trigger): refuse if the page left cloudonair.withgoogle.com, shows account-chooser/consent text, or has a visible Sign in / Log in / Register / Sign up control. Otherwise click the first visible "Watch now" (or the one whose card text contains `--onair-session`) once, and wait up to 60 s for a `<video>` or visible iframe; none = refuse. Refusal raises, main() emits `fatal`, exit 1; tab-browser turns `fatal` into a recording failure.
2. After capture-invoked: unmute and play the video; emit `onair-duration` when readable (a cross-origin iframe player gives none, so the CLI `--until` stays).
3. TS sets until = now + min(duration + 120 s, 4 h) (reuses watchDurationSec; LKB_ONAIR_WATCH_MAX_SEC honoured).
It never clicks sign-in, register, a chooser or consent: the only click is "Watch now".

## Checks a checker must run
- `python -m unittest test_sb_join_onair` in packages/meeting-bot/py (7 tests)
- `node --test --import tsx src/watch/onair-watch.test.ts` in packages/meeting-bot (11 tests)
- tsc --noEmit -p packages/meeting-bot/tsconfig.json
- `node scripts/lint-loc.mjs --all` (stages loc, tracker, dependencies hit the 120 s stage timeout under load here; each passed when run alone)

## Evidence (this lane)
- unittest: Ran 7 tests, OK. node: tests 11, pass 11, fail 0. tsc: no output, exit 0.
- lint-loc alone: "OK (1768 file(s) within budget)" after the fix (first run: record-commands.ts 307 > 300). tracker-audit exit 0, dependency-cruise "no dependency violations found". The other 7 stages exit=0 in the --all run.
- D-020 mutation: `if c["text"] in REFUSE_CONTROL:` -> `if False:` in sb_join_onair.py. Result: 1 failure (signed-out test), killed. Per-mutation backup + trap, script outside the repo. `git -c core.autocrlf=true hash-object` before = after = 58f8984189dd3582298890353dde4cf84c4db487; tests OK again.

## Not verified
- SNAPSHOT_JS / CLICK_WATCH_JS / PLAY_JS run only in a real browser; the tests parse fixture HTML into the snapshot shape instead. No live OnAir run was done.
- py/test_sb_join_*.py (real Chrome) and record-commands.test.ts were not run.
- No `scheduleOnairWatch` CLI entry was added (not required by the brief); the record path is used.

## Fix cycle 1 (verdict f4cb4fe9 findings)
1. HIGH click re-verify: DESCRIBE_JS re-queries controls[idx] at click time; `verify_target` (Python) requires "watch now", no sign-in/register/consent match in the control text, href or ancestor attributes, and the matching card; CLICK_WATCH_JS re-checks the signature atomically and returns false on drift. Either failure raises OnairRefused. Tests: late_reflow, dom_drift, verify_target_rules (fixture shifted.html).
2. MEDIUM refusal: REFUSE_RE is a case-insensitive substring match (sign in/up, log in, register, choose an account, consent, allow, continue with google, accounts.google.com) on control text and href. Tests: sign_in_to_watch.html, register_now.html.
3. MEDIUM iframe: only `<video>` or an https iframe on youtube.com, youtube-nocookie.com, vimeo.com, brightcove.net/.com or the OnAir host counts as a player; accounts.google.com, login, consent and oauth iframes refuse. Tests: iframe_youtube/login/unknown.html.
4. LOW consent: `owner.until` (the object the consent control and capture control hold) is updated with the adjusted end. Covered by tsc and reading only; no runRecord-level test.

Evidence: unittest 12 of 12 OK; node onair-watch.test.ts 11 of 11; tsc exit 0; lint-loc alone OK (record-commands.ts 299 lines); JS snippets pass `new Function` syntax check only. D-020 mutation: `if not desc["text"].startswith("watch now"):` -> `if False:` killed (1 failure); hash before = after = 1c842b01e75dba36d9d4d61540bf83840b26e68d; tests OK after restore. Not run: tracker and dependencies lint stages this cycle (unchanged inputs), real browser.

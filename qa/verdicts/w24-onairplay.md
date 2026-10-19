# Verdict: w24-onairplay

VERDICT: FAIL
Cycle checked: 0
Reviewed SHA: 22e076432d0bf6dc9c5b488881f9f2e4cb07544e
Base: 8029be9f
ISSUES-WRITTEN: none

## Independently produced evidence
- `python -m unittest test_sb_join_onair` (py dir): Ran 7, OK, exit 0.
- `node --test --test-force-exit --import tsx src/watch/onair-watch.test.ts`: tests 11, pass 11, fail 0, exit 0.
- tsc --noEmit -p packages/meeting-bot/tsconfig.json: exit 0, no output.
- `node scripts/lint-loc.mjs` : OK (1768 files within budget). record-commands.ts is 300 lines. Other stages not rerun.
- record-commands.ts exports: all 8 base exports kept; the 3 merged re-export lines are one line with the same 5 names plus the type.
- D-020 mutation (own): `if host != ONAIR_HOST:` -> `if False:` in sb_join_onair.py, per-mutation backup + trap + timeout. Killed by test_account_chooser_refuses_without_clicking (1 failure). Restored; `git -c core.autocrlf=true hash-object` before = after = HEAD blob 58f8984189dd3582298890353dde4cf84c4db487; cmp ok; tests OK again.
- Host probe (urlsplit): `cloudonair.withgoogle.com.evil`, `...com@evil.com`, `http://`, trailing dot, subdomain, `evil.com#@cloudonair...` all rejected. Exact-host check is sound. `https://evil.com\@cloudonair.withgoogle.com/` passes onair_enabled (urllib vs WHATWG parsing), but refusal() uses the browser-reported location.href, which then names evil.com, so it fails closed.
- Flag off: both sb_join.py call sites are guarded by `onair = onair_enabled(...)`, which requires LKB_ONAIR_WATCH == "1"; TS onairUntilFromEvent returns undefined when disabled. Behaviour unchanged. Duration cap: min(d+120, 4h) correct (1920 s, 14400 s); NaN, bool, inf, <=0 -> None; the cross-origin iframe path gives no event so --until stays.

## Findings
1. HIGH (security, proven by reading): the click is not re-verified. py/sb_join_onair.py CLICK_WATCH_JS (lines ~33-37) clicks `controls[arguments[0]]`, an index taken from an earlier SNAPSHOT_JS call (onair_prepare step -> pick_watch -> execute_script(CLICK_WATCH_JS, idx)). Nothing re-checks the element text at click time. If the DOM reflows between the two calls (a late banner or header control inserted before the card), the index lands on a different control, which can be a Sign in / Register / consent control. "Can NEVER click a sign-in control" is therefore not guaranteed. Fix: pass the expected text (and the session filter) into CLICK_WATCH_JS and click only if `controls[i]` text still startswith "watch now" and is not a refuse control; otherwise return false. Add a test that feeds a shifted snapshot.
2. MEDIUM (fail-closed gap): refusal() matches controls by exact text equality (`c["text"] in REFUSE_CONTROL`). Probed: "sign in to watch", "register now", "iniciar sesion" (localized) and "watch now sign in" are NOT refused, and "watch now ..." is still picked. Only chooser phrases in the page text catch some cases. Fix: substring or word-boundary match on a fuller list (sign in, log in, register, sign up, plus localized variants), and refuse a Watch now control whose href or context contains a sign-in or accounts.google.com target.
3. MEDIUM (iframe login): any visible iframe satisfies the "player ready" condition (`snap["iframe"]`) with no check of its src host. A Google sign-in or consent iframe counts as a player, so the recorder proceeds against a login page instead of failing closed with "no player". Controls inside the iframe are also invisible to the refusal scan. Fix: require the iframe src host to be an allowed player host, or refuse when it is an accounts.google.com iframe.
4. LOW note: prepareWorkspaceCaptureControls receives the original `until.getTime()` (record-commands.ts:111), so the OnAir-adjusted `until` is not seen by it; the main loop and controller state do use the new value. Verify this is acceptable.

## Not verified
SNAPSHOT_JS, CLICK_WATCH_JS and PLAY_JS in a real browser (not permitted). record-commands.test.ts and the other lint-loc stages (tracker, dependencies) not rerun.

## Ledger rows
No rows may be flipped. Re-submit at fix cycle 1 after findings 1-3, with a test per finding.

---

# Verdict: w24-onairplay, fix cycle 1

VERDICT: PASS
Cycle checked: 1
Reviewed SHA: 8e5a4c6d0db3c52995fabce471cc4c14844f0d04
ISSUES-WRITTEN: none
(This section supersedes the cycle 0 FAIL above; the cycle 0 record is kept unchanged.)

## Re-check of cycle 0 findings
1. HIGH click re-verify: FIXED. DESCRIBE_JS re-queries controls[idx] at click time; Python verify_target requires text startswith "watch now", no REFUSE_RE hit in text, href or the 10-level ancestor attribute trail, and the session card; CLICK_WATCH_JS recomputes the signature (text|href|trail) and returns false on drift; either failure raises OnairRefused. No new escape found: the click can only reach an element whose text, href and ancestors passed the refuse scan at that moment, and the signature is compared atomically in the same script as the click.
2. MEDIUM refusal: FIXED. REFUSE_RE is a case-insensitive substring match on control text and href (sign in/up, log in, register, choose an account, consent, allow, continue with google, accounts.google.com). Fixtures sign_in_to_watch.html and register_now.html are covered by tests.
3. MEDIUM iframe: FIXED. Probed player_frames: www.youtube.com https accepted; youtube.com.evil, evil-youtube.com, youtube.com@evil.com, http://, accounts.google.com, empty src all rejected. A visible login/consent iframe now raises refusal in every poll.
4. LOW adjusted until: FIXED and read-verified beyond tsc. `owner` is the same object passed to prepareWorkspaceCaptureControls -> prepareCaptureConsentControls -> installCaptureControl(owner); reconnect-gaps.ts:116-117 reads `context.until` lazily in gap(), so `owner.until = ...` reaches the capture-control gap end. (The consent receipt and readiness observer copy the initial until at construction; unchanged and acceptable.) With the flag off `until` is reassigned to the same value.

## Independently produced evidence
- unittest test_sb_join_onair: Ran 12, OK, exit 0. node onair-watch.test.ts: 11/11, exit 0. tsc --noEmit: exit 0. lint-loc: OK (1768 files); record-commands.ts within the 300 budget.
- Fresh D-020 mutation (per-mutation backup .w24_mut2.bak, trap, timeout 120): `if sb.execute_script(CLICK_WATCH_JS, idx, desc["sig"]) is not True:` -> `if False:` in sb_join_onair.py. test_dom_drift_between_check_and_click_refuses FAILED (also 1 more failure and 2 errors, since the mutant also skips the click body). Restored; `git -c core.autocrlf=true hash-object` before = after = HEAD blob 1c842b01e75dba36d9d4d61540bf83840b26e68d; cmp ok; tests OK after restore.

## Notes (low, not filed)
- The signature omits card context, so with --onair-session two Watch now controls with identical text/href/trail could swap after a reflow and the wrong (still Watch now) card could be clicked. Not a sign-in/consent risk.
- A Watch now link whose href leads off the OnAir host is clicked; the next poll's host check then refuses. Unchanged behaviour.
- Localized (non-English) sign-in text without matching href is still not refused, but it can never be clicked; only an English "watch now" control is clickable.

## Not verified
SNAPSHOT_JS, DESCRIBE_JS and CLICK_WATCH_JS in a real browser (not permitted; only fixture-parsed snapshots and syntax check). record-commands.test.ts, tracker and dependencies lint stages not rerun.

## Ledger rows
Rows tied to w24-onairplay may be flipped to verified.

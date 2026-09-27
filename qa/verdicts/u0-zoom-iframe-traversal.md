# Verdict — u0-zoom-iframe-traversal

**Cycle checked:** 1
**Date:** 2026-09-27
**Checker:** fresh Claude subagent (claude-sonnet-subagent), read-only, bound to `D:\KnowledgeBase`
(lane `D:\KnowledgeBase-lanes\u0-zoom-iframe`, branch `wave/u0-zoom-iframe`, head `cae512d`).

VERDICT: FAIL
SCORE BOARD: 2/3 criteria met, 1/1 invariant holds with a caveat

## What I re-ran myself

1. `python -m pytest packages/meeting-bot/py -q` in the bound lane tree → **27 passed in 6.36s**,
   matches the manifest's pasted output exactly. Reproduced.
2. Capability-coverage row 1-3's falsifying edit, in my OWN throwaway copy
   (`git archive HEAD` into `<scratch>/u0-checker-copy-row1`, never the bound tree): swapped in
   `git show master:packages/meeting-bot/py/sb_join.py` → RED, `ImportError: cannot import name
   'BODY_TEXT_JS' from 'sb_join'` (same failure the manifest reports). Restored the fixed file from
   `HEAD` (`cmp` byte-identical), re-ran → **27 passed in 5.42s** (GREEN again). Row 1-3 confirmed.
3. `git diff master...cae512d --stat` — confirms "What changed": only
   `packages/meeting-bot/py/sb_join.py` (77 lines), `packages/meeting-bot/py/fixtures/*` (new),
   `packages/meeting-bot/py/test_sb_join_iframe.py` (new), and the manifest itself. No file outside
   `packages/meeting-bot/py/` touched; nothing deleted or renamed. **Diff scope matches the
   manifest — no finding here.**
4. Read `packages/meeting-bot/src/capture/record-commands.ts:95-170` to confirm what actually
   consumes the `"ended"` event `sb_join.py` emits at line 315 — this matters for judging severity
   of finding ISS-U0-5 below. Confirmed: `onEvent` sets `endedAt` on the first `"ended"` event
   (`record-commands.ts:118`) and the run loop breaks when `endedAt !== undefined && now >=
   endNotBefore.getTime() && now - endedAt > 60_000` (`record-commands.ts:168`) — i.e. a **persistent**
   false "ended" signal genuinely stops the live recording early, delayed by the 60s + `endNotBefore`
   guard, not prevented by it.
5. My OWN adversarial fixtures (beyond the maker's five), driven with a single real headless Chrome
   (SeleniumBase, `headless=True, uc=False`, matching the maker's own test's RAM discipline — no other
   headless Chrome instance running concurrently from this session), against the **unmodified, bound**
   `sb_join.py`'s `CLICK_JS`/`BODY_TEXT_JS`/`JOIN_TEXTS`/`END_PHRASES` (imported directly, code never
   copied or edited):
   - `adv_hidden_top.html` — a same-origin iframe with `style="display:none"` containing a "Join"
     button and the text "The webinar has ended. Thank you for attending."
   - `adv_zerosize_top.html` — a same-origin iframe with `style="width:0;height:0;border:0;overflow:hidden;"`
     containing the identical content.

   Result (raw output):
   ```
   {
     "hidden_display_none": {
       "click_hit": null,
       "end_phrase_matched": "webinar has ended",
       "body_excerpt": "back \n  the webinar has ended. thank you for attending.\n  join\n\n\n"
     },
     "zero_size_iframe": {
       "click_hit": "join",
       "end_phrase_matched": "webinar has ended",
       "body_excerpt": "back  the webinar has ended. thank you for attending.\n\njoin (clicked)"
     }
   }
   ```

## FAILURES

- **[capability-claim, C2-adjacent] sev: high · A same-origin iframe collapsed to zero size
  (`width:0;height:0`) defeats `CLICK_JS`'s visibility guard — a button inside it gets clicked
  even though it renders nowhere on the page** · `sb_join.py:49-97` (`_IFRAME_WALK_JS`/`CLICK_JS`):
  the `r.width === 0 || r.height === 0` check (line ~93) reads the element's own
  `getBoundingClientRect()` **relative to its own document**, never the ancestor `<iframe>`
  element's own size/visibility in the *parent* document it is nested in — a browser lays out an
  iframe's content at its own natural size regardless of the container's collapsed CSS size, so the
  button inside still reports a non-zero local rect. My `zero_size_iframe` fixture's `click_hit`
  came back `"join"` (clicked) against the real, unmodified `CLICK_JS`. The manifest's own claim —
  "CLICK_JS keeps C2's exact-match semantics untouched — same visibility/disabled guard... the only
  change is which document the querySelectorAll runs against, never what counts as a match" — is
  disproven for this case: what counts as "visible" silently changed the moment traversal crossed a
  frame boundary, because the guard was never frame-aware. This is a NEW failure mode: the old,
  top-document-only code could never click anything hidden this way because it never looked inside
  any container that could be collapsed independently of the page. Fix direction: before/while
  `walkFrames` recurses into a frame, check the `<iframe>` element's own `getBoundingClientRect()`
  (width/height > 0) and computed `display` in ITS parent document; skip the whole subtree (visit
  and click) when the frame itself is not visible. issue: ISS-U0-4

- **[C10-adjacent / body-text correctness] sev: high · `BODY_TEXT_JS` merges text from an invisible
  same-origin iframe (both `display:none` and zero-size) into the END_PHRASES/RECONNECT_PHRASES
  check, and this genuinely propagates to an early stop of a live recording** · `sb_join.py:99-115`
  (`BODY_TEXT_JS`) merges every reachable same-origin frame's `body.innerText`
  unconditionally — it has no visibility gate at all, unlike `CLICK_JS`'s (broken) attempt at one.
  Consumed at `sb_join.py:313` (`ended = next((p for p in END_PHRASES if p in body), None)`), which
  in turn drives `record-commands.ts:118,168`'s early-stop logic. My `adv_hidden_top.html` fixture (a
  `display:none` iframe containing "The webinar has ended. Thank you for attending.") produced
  `end_phrase_matched: "webinar has ended"` against the real, unmodified `BODY_TEXT_JS` — confirmed
  for BOTH the display:none and zero-size cases. The `endNotBefore` + 60-second-persistence guard in
  `record-commands.ts:168` delays but does not prevent this: a static, pre-rendered hidden panel
  (a common SPA pattern — e.g. a "meeting ended"/feedback template kept in the DOM and toggled via
  CSS rather than removed, or a collapsed chat/waiting-room panel echoing a viewer's own message)
  would keep matching on every single tick from first detection onward, so once 60s + `endNotBefore`
  elapses it WILL stop the recording — during a live webinar, exactly the "early stop is worse than
  late stop" scenario this dispatch asked me to judge. I cannot prove Zoom's real DOM contains such a
  hidden node (only a live, signed-in run can, and that is out of scope for this unit per the
  dispatch's own constraints) — but the mechanism is real and directly reproduced, not hypothetical.
  Fix direction: same ancestor-frame-visibility gate as ISS-U0-4, applied to `BODY_TEXT_JS` before a
  frame's text is merged in. issue: ISS-U0-5

## Judgment on the adversarial questions asked in the dispatch

- **Double clicks across frames:** none found, and I don't believe any exist — read
  `_IFRAME_WALK_JS`'s `walk(doc)`/`walkFrames` callback: `if (hit) return;` is the first line of the
  visitor, checked before every document's element loop, and the loop itself returns immediately
  after `el.click(); hit = t; return;`. A hit in a nested frame's callback sets the shared `hit`
  closure variable before the DFS unwinds to any sibling frame, so every subsequent `visit()` call
  short-circuits. No falsifying case found; not filed as an issue.
- **Cross-origin frame skipped without throwing:** confirmed — maker's own
  `test_cross_origin_iframe_is_skipped_without_throwing` passes, and I read the try/catch around
  `frame.contentDocument` (`sb_join.py:56-63`) which is correctly structured for both a thrown
  `SecurityError` and a `null` return (browsers differ). No finding.
- **about:blank / srcdoc / not-yet-loaded frames (`contentDocument` null):** code-reviewed only
  (not fixture-tested, given the time budget) — `if (!inner) continue;` at `sb_join.py:64` treats a
  `null` contentDocument identically to the cross-origin catch branch, so an unloaded frame is
  silently skipped rather than crashing. This looks correct by inspection; not filed as an issue.
- **Performance walking all frames every heartbeat tick:** low risk as shipped — a real Zoom
  web-client page has one iframe, not hundreds (per ISS-U0-1's own live-probe evidence), so the
  recursive walk's cost is negligible. Matches the manifest's own "Known gaps" note about
  non-short-circuiting sibling traversal; I agree with the maker's judgment call not to fix this now.
- **Zoho/Meet (no-iframe) path unchanged:** confirmed both by diff (only `sb_join.py` +
  `packages/meeting-bot/py/*` touched, nothing under `src/capture/` for non-iframe platforms) and by
  independently re-running `test_no_iframe_page_click_and_body_text_regression` inside my throwaway
  copy alongside the RED/GREEN swap above. No finding.
- **Plausibly reaches Zoom's real Join / "Join Audio by Computer" buttons and waiting-for-host
  text:** yes, plausible — the fixture set's DOM shape (top doc = one non-matching link + one
  same-origin iframe; iframe = name field + Join + Computer Audio buttons + waiting-for-host text)
  matches ISS-U0-1's own recorded live-probe evidence, and my adversarial `top.html`-shaped fixture
  (real visible iframe, not hidden/collapsed) traversed and clicked correctly. The core ISS-U0-1
  defect — "iframe content is invisible to CLICK_JS/body-text" — is genuinely fixed for a normally
  visible frame. My findings above are about a DIFFERENT, NEW edge case the traversal introduces
  (invisible-frame content wrongly counted as visible), not a failure to reach the real UI.
- **Missing input-fill / name-prefill for a signed-in user:** verified the maker's claim by my own
  `grep -rn "name" packages/meeting-bot/src/capture/record-commands.ts packages/meeting-bot/py/`
  (not shown above for brevity) — confirms no input-fill code exists anywhere in
  `packages/meeting-bot`, so there is nothing pre-existing this unit could have made iframe-aware.
  Agree with the manifest: out of scope, not fabricated, low/medium note only — not a blocker for
  this unit's grading. Not filed.

## Capability coverage

CAPABILITY-COVERAGE: 1/5 rows independently re-verified by me from scratch (row 1-3's shared
falsifying edit, in my own throwaway copy — see "What I re-ran myself" #2); the remaining 4 rows
(cross-origin, no-iframe regression) are accepted on the maker's own passing tests, which I also
re-ran verbatim in the bound tree (27 passed) and independently re-derived the no-iframe regression
inside my throwaway copy. No row's falsifying edit failed to isolate; no row is UNVERIFIED.

LIVE-BROWSER: not-applicable (no UI surface reachable without opening a real Zoom URL, which the
dispatch explicitly forbids) — my own adversarial fixture runs above used a real headless Chrome
against local HTML, which is the same evidentiary standard the manifest itself used, but this is not
Mode D (there is no live product UI to drive here; the "browser" IS the artifact under test).

## Ledger

Marked `ISS-U0-1` **fixed** (not "verified" — that requires a live-Zoom confirmation, separately
gated by the still-open ISS-U0-2 HUMAN_GATE): the SPECIFIC defect it names — iframe content
completely invisible to `CLICK_JS`/body-text — is genuinely resolved for a normally-visible
same-origin iframe, confirmed by my own RED/GREEN reproduction in a throwaway copy (#2 above), which
is independent of the two NEW issues below that this same fix introduces.
`regression_check`: `python -m pytest packages/meeting-bot/py -q` (verbatim shell command; this
project's adapter has no `qa/adapter.json` verify.shell.commands list I could find, so citing the
command itself per the ledger schema's second allowed form).

Filed `ISS-U0-4` (high) and `ISS-U0-5` (high) per the findings above — both open, both
`found_by: checker-unit`.

ISSUES-WRITTEN: ISS-U0-4, ISS-U0-5
EXECUTOR: claude-opus-subagent (manifest) — self != executor confirmed (checker: claude-sonnet-subagent)
EXPLANATION: The manifest's core claim holds — the top-document-only blindness that ISS-U0-1 named is
genuinely fixed for a normally visible same-origin iframe (independently RED/GREEN-reproduced, and
the maker's own 27 tests reproduce cleanly). But the manifest's second claim — that the visibility
guard is unchanged and only "which document" changed — is false in the cross-frame case: my own
adversarial fixtures (not the maker's five) show a zero-size or hidden same-origin iframe defeats
the click-visibility guard entirely and unconditionally leaks its text into the END_PHRASE check
that record-commands.ts uses to stop a live recording. Both are new failure modes this traversal
fix introduces (the old, top-doc-only code had no way to reach hidden content at all), both are high
severity given today's live webinar depends on this exact path, and both have a narrow, well-scoped
fix (gate frame recursion on the `<iframe>` element's OWN visibility in its parent document before
visiting/clicking/reading its content) that should fit a short cycle-2 turnaround.

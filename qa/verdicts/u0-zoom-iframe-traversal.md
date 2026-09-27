# Verdict — u0-zoom-iframe-traversal

**Cycle checked:** 2
**Date:** 2026-09-27
**Checker (cycle 1):** fresh Claude subagent (claude-sonnet-subagent), read-only, bound to `D:\KnowledgeBase`
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

---

## Cycle 2

**Cycle checked:** 2
**Date:** 2026-09-27
**Checker:** fresh Claude subagent (claude-sonnet-subagent), read-only, bound to `D:\KnowledgeBase`
(lane `D:\KnowledgeBase-lanes\u0-zoom-iframe`, branch `wave/u0-zoom-iframe`, head `7cfe7fd`).
Time-critical dispatch (live webinar ~10:55 IST); no real Zoom URL opened, no live bot, `data/bot-profile/`
untouched, `raw/webinars/2026-09-27-ashoka-join-url.txt` never read. One headless Chrome instance at a
time throughout.

VERDICT: FAIL
SCOREBOARD: 2/3 criteria met (C1 n/a — untouched by this unit), 1/1 invariant holds with a new caveat

### What I re-ran myself

1. `python -m pytest packages/meeting-bot/py -q` in the bound lane tree → **30 passed in 6.11s**
   (27 pre-existing + 3 new hidden-iframe cases). Matches the manifest's pasted output. Reproduced.
2. Capability-coverage RED/GREEN for the cycle-2 claim, in my OWN throwaway copy (plain directory copy
   of `packages/meeting-bot/py` outside the bound tree — the bound tree was never touched, not even
   reverted): swapped in `git show cae512d:packages/meeting-bot/py/sb_join.py` (the cycle-1, checker-
   FAILed code) and ran `test_sb_join_iframe.py -k hidden_iframe` → **3 failed** (`hidden_zerosize_top`,
   `hidden_displaynone_top`, `hidden_in_displaynone_div_top`), the exact defects ISS-U0-4/ISS-U0-5 name.
   RED confirmed against real, unmodified cycle-1 code. The bound tree's own fixed copy independently
   verified GREEN via #1 above. Row genuinely isolates the fix.
3. `git show 7cfe7fd --stat` — confirms "What changed": only
   `packages/meeting-bot/py/sb_join.py` (+28), `packages/meeting-bot/py/test_sb_join_iframe.py` (+25),
   four new fixture files, and the manifest. No file outside `packages/meeting-bot/py/`/the manifest
   touched; nothing deleted or renamed; U5's calendar lane untouched. **Diff scope matches the
   manifest — no finding here.**
4. **D-015 re-run of ISS-U0-4/ISS-U0-5's own recorded reproductions** (their `reproduction` field,
   `qa/issues.u0.jsonl`): both named cases (0-size iframe, `display:none` iframe) — verified via the
   maker's own parametrized tests (step 1/2 above) AND my own independent fixtures below. **Both
   ledger reproductions no longer trigger against the fixed code: confirmed fixed.**
5. **My OWN adversarial fixtures** (not the maker's five, not the cycle-1 checker's two), one shared
   headless Chrome instance (SeleniumBase, `headless=True, uc=False`), against the unmodified, bound
   `CLICK_JS`/`BODY_TEXT_JS`/`JOIN_TEXTS`/`END_PHRASES` (imported directly from
   `D:\KnowledgeBase-lanes\u0-zoom-iframe\packages\meeting-bot\py\sb_join.py`, never copied or edited),
   serving my own local HTML fixtures from a scratch directory outside the repo:

   | fixture | construction | click_hit | end_phrase leaked | top text present |
   |---|---|---|---|---|
   | `vishidden_self_top.html` | iframe itself `visibility:hidden` | `null` | no | yes |
   | `vishidden_ancestor_top.html` | ancestor `<div>` `visibility:hidden` | `null` | no | yes |
   | `opacity_zero_top.html` | iframe itself `opacity:0` (nonzero size) | **`"join"`** | **yes** | yes |
   | `offscreen_top.html` | iframe `position:absolute;left:-9999px;top:-9999px` (nonzero size) | **`"join"`** | **yes** | yes |
   | `happy_path_top.html` | **REAL HAPPY PATH** — visible, full-viewport (`position:fixed;100vw;100vh`) same-origin iframe with Join / Join Audio by Computer / waiting-for-host text | `"join"` (correct — must click) | yes (fixture always contains this text; expected) | yes |
   | `nested_visible_outer.html` | two levels of fully visible nested same-origin iframes | `"join"` (correct — must click, 2 levels deep) | yes (expected) | yes |
   | `zerosize_ancestor_top.html` | iframe has its OWN explicit nonzero `width:400px;height:300px`, nested inside ancestor `<div style="width:0;height:0;overflow:hidden;">` | **`"join"`** | **yes** | yes |

   Raw results (abbreviated, full JSON produced by the run):
   ```
   vishidden_self_top.html:      {"click_hit": null, "end_phrase_matched": null, "top_text_present": true}
   vishidden_ancestor_top.html:  {"click_hit": null, "end_phrase_matched": null, "top_text_present": true}
   opacity_zero_top.html:        {"click_hit": "join", "end_phrase_matched": "webinar has ended", ...}
   offscreen_top.html:           {"click_hit": "join", "end_phrase_matched": "webinar has ended", ...}
   happy_path_top.html:          {"click_hit": "join", "end_phrase_matched": "webinar has ended", ...}
   nested_visible_outer.html:    {"click_hit": "join", "end_phrase_matched": "webinar has ended", ...}
   zerosize_ancestor_top.html:   {"click_hit": "join", "end_phrase_matched": "webinar has ended", ...}
   ```
6. Confirmed Zoho/Meet (no-iframe) top-doc path unchanged: `git show 7cfe7fd --stat` touches no file
   under `src/capture/` or any non-`packages/meeting-bot/py` path, and the bound tree's own
   `test_no_iframe_page_click_and_body_text_regression` is included in the 30-passed run. No finding.
7. TS/pnpm suite: confirmed this lane (`git worktree add`) has no `node_modules` at
   `packages/meeting-bot/` or repo root (same environment gap the manifest discloses). Zero
   TypeScript files touched by this cycle's diff (step 3). Judged, same as cycle 1: a disclosed,
   non-blocking gap, not this unit's regression to own — installing `node_modules` mid-check under
   today's time budget was not attempted.

### What genuinely works (credit where earned)

- **ISS-U0-4 and ISS-U0-5's own recorded reproductions are fixed** — 3/3 refused each, independently
  re-derived (RED on cycle-1 code, GREEN on the fix), not merely re-read from the manifest.
- **The `visibility:hidden` case — both on the iframe itself AND via an ancestor element — is
  genuinely handled**, confirmed by my own two fixtures the maker's suite does not cover (`click_hit:
  null`, no leaked text, both cases). This was an explicit dispatch ask and it holds.
- **The real happy path still works**: a normally visible, full-viewport same-origin iframe containing
  Join / Join Audio by Computer / waiting-for-host content is still traversed, clicked, and read
  correctly — the fix has not become so strict that it would break today's actual join. Nested visible
  frames (two levels) also still traverse and click correctly.
- Diff scope is clean; Zoho/Meet is unaffected; the full suite is green and repeatable.

### FAILURES

- **[capability-claim, same class as ISS-U0-4/ISS-U0-5] sev: high · An ancestor that clips its own
  box to zero size via `overflow:hidden` (while the iframe itself keeps an explicit, nonzero
  `width`/`height`) defeats the cycle-2 visibility gate exactly like ISS-U0-4/ISS-U0-5, via a
  construction the fix's own fixture set never tried** · `sb_join.py:74-85` (`isFrameVisible`): the
  `frame.getClientRects().length === 0` check (comment: "catches `display:none` on the iframe itself
  or ANY ancestor") is true for an ancestor `display:none` (which removes the whole subtree from
  layout, so the iframe generates zero client rects) but **false** for an ancestor `width:0;
  height:0; overflow:hidden` — that CSS only clips rendering; it does not remove the child from the
  layout tree or zero the child's own box, so a replaced element like `<iframe>` with its own explicit
  size keeps a nonzero `getBoundingClientRect()`/`getClientRects()` regardless of the ancestor. My
  `zerosize_ancestor_top.html` fixture reproduced this against the real, unmodified, cycle-2-fixed
  code: `click_hit: "join"`, `end_phrase_matched: "webinar has ended"` — the exact same observable
  bypass ISS-U0-4/ISS-U0-5 described, just via a different, equally ordinary CSS technique (clipping
  via a zero-size overflow-hidden ancestor is at least as common a "hide this element" pattern as
  `display:none`). This directly contradicts the manifest's own claim that
  `getClientRects().length===0` "also covers 'iframe nested inside a display:none div' without a
  separate ancestor walk for that case" — it covers display:none ancestors, not clipping ancestors.
  Fix direction: at each ancestor in the existing `parentElement` walk (already used for
  `visibility:hidden`), also check that ancestor's OWN `getBoundingClientRect()` for
  width/height === 0 combined with a computed `overflow`/`overflow-x`/`overflow-y` of `hidden`/`clip`
  — or, more robustly, replace the enumerate-each-technique approach with an actual on-screen
  intersection test (the iframe's rect against the running intersection of every ancestor's own
  clipped rect) since three independent CSS constructions have now produced the same
  visually-invisible-but-code-visible state (ISS-U0-4, ISS-U0-5, this finding). issue: ISS-U0-6

### Additional finding (does not independently block, judged realistically per the dispatch's ask)

- **[capability-claim, related] sev: medium · `opacity:0` and off-screen absolute positioning
  (`left:-9999px`, nonzero size) also defeat the same gate** · `sb_join.py:74-85`: neither computed
  `opacity` nor actual viewport intersection is checked. My `opacity_zero_top.html` and
  `offscreen_top.html` fixtures both reproduced `click_hit: "join"` + leaked end-phrase against the
  real, unmodified code. **Realism judgment asked of me by the dispatch:** I found no evidence Zoom's
  own web-client join UI uses either pattern for its real Join/Join-Audio/waiting-for-host content —
  both are more characteristic of clickjacking/ad-hiding or transient CSS-transition states than a
  video-conferencing SPA's join screen, which is why this is medium rather than high (contrast
  ISS-U0-6's ancestor-clipping construction, an ordinary layout technique with no such connotation).
  Filed as debt, not a blocker for this unit's grade on its own. issue: ISS-U0-7

### Judgment on the dispatch's specific asks

- **0-size / display:none / display:none-ancestor iframe:** all three refused, independently
  re-derived (RED/GREEN). Confirmed.
- **visibility:hidden ancestor:** refused, independently confirmed via my own two fixtures (not
  covered by the maker's five). Confirmed working.
- **opacity:0 iframe:** defeats the gate; judged medium severity (realism note above), filed
  ISS-U0-7, not a blocker.
- **Offscreen-positioned iframe (nonzero size) — "does it get clicked? judge severity realistically":**
  yes, it gets clicked and its text leaks. Folded into ISS-U0-7 (medium) alongside opacity:0, same
  root cause (no viewport-intersection check), same realism judgment.
- **Real happy path (visible, full-viewport same-origin iframe) — must still work:** confirmed working,
  both click and text-read, via my own independent fixture, not the maker's `top.html`.
- **Nested visible frames:** confirmed working via my own two-level fixture, independent of the
  maker's `nested_outer.html`/`nested_middle.html`.
- **Zoho/Meet top-doc path unchanged by diff:** confirmed via `git show 7cfe7fd --stat` (step 6 above)
  and the passing no-iframe regression test.

### Capability coverage

CAPABILITY-COVERAGE: 1/5 rows independently re-verified by me from scratch this cycle (the new
hidden-iframe row's shared falsifying edit, in my own throwaway copy — see "What I re-ran myself" #2);
the other 4 rows (unchanged from cycle 1: CLICK_JS-in-iframe, BODY_TEXT_JS-in-iframe, nested-depth,
cross-origin, no-iframe-regression) are accepted on the bound tree's own passing 30-test run, which I
independently re-ran, plus my own 7 adversarial fixtures above covering ground neither the maker's
five nor the cycle-1 checker's two touched. No row's falsifying edit failed to isolate.

LIVE-BROWSER: not-applicable — no live product UI is reachable without opening a real Zoom URL, which
this dispatch (and the contract's own constraints) explicitly forbid; the artifact under test IS
browser-automation logic, exercised with a real headless Chrome against local HTML fixtures, the same
evidentiary standard used by the maker, the cycle-1 checker, and this cycle.

### Ledger

Marked `ISS-U0-4` and `ISS-U0-5` **fixed** — their own named/recorded reproductions (per D-015) are
independently RED/GREEN-confirmed resolved, same treatment cycle-1 gave ISS-U0-1 while still FAILing
the unit overall for issues found beyond the ledger's existing rows. `regression_check`:
`python -m pytest packages/meeting-bot/py -q` (verbatim shell command; no `qa/adapter.json`
`verify.shell.commands` list exists for this project, so citing the command itself per the ledger
schema's second allowed form — same citation cycle-1 used).

Filed `ISS-U0-6` (high) and `ISS-U0-7` (medium) per the findings above — both open, both
`found_by: checker-unit`.

ISSUES-WRITTEN: ISS-U0-6, ISS-U0-7
EXECUTOR: claude-opus-subagent (manifest) — self != executor confirmed (checker: claude-sonnet-subagent)
EXPLANATION: Cycle 2 genuinely fixes both issues it was dispatched to fix — ISS-U0-4 and ISS-U0-5's own
recorded reproductions are independently RED/GREEN-confirmed resolved, and the fix correctly extends to
the visibility:hidden case (self and ancestor) that neither ledger issue named. The real happy path
(a visible, full-viewport same-origin iframe with Zoom's actual join UI shape) still works, and nested
visible frames and the Zoho/Meet no-iframe path are unaffected — this fix has not overcorrected into
breaking today's join. But my own adversarial fixtures, built independently of the maker's five and the
cycle-1 checker's two, found a THIRD CSS construction — an ancestor that clips its own box to zero size
via `overflow:hidden` while the iframe itself keeps an explicit nonzero size — that produces the exact
same observable bypass ISS-U0-4/ISS-U0-5 named, and that the manifest's own fix comment claims (incorrectly)
is already covered by the `display:none`-ancestor check. That is a same-class capability gap, not a new
exotic edge case, and per this pair's own rule ("never soften a criterion because an artifact is
failing it") I cannot pass a frame-visibility fix that a routine CSS clipping technique still defeats,
one live webinar and one fix cycle before this exact code path is asked to do it for real. Cycle 3 (max
3 per the manifest header) has room for a narrow, well-scoped fix: extend the existing ancestor walk (already
used for visibility:hidden) to also fail visible when an ancestor's own rect is zero-size with hidden/clip
overflow, or replace the technique-enumeration approach with an actual viewport-intersection test. The
opacity:0/offscreen finding (ISS-U0-7, medium) is filed as related debt and, per my own realism judgment
asked in the dispatch, does not block this verdict on its own.

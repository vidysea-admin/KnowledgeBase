# Manifest — u0-zoom-iframe-traversal
**Contract:** qa/contracts/meeting-bot-live-capture.md (T-024b, ADOPTED 2026-09-25) — criteria C1
(real browser join), C2 (bounded/denylisted auto-click — exact-match semantics unchanged, only
traversal added), C10 (no regression)
**Fix cycle:** 3 of max 3 (FINAL — round cap)
**Dual check:** no
**Issues addressed:** ISS-U0-1 (high, coverage-class — `qa/issues.u0.jsonl`, cycle 1);
ISS-U0-4, ISS-U0-5 (both high — cycle 2, fixed, checker-confirmed); ISS-U0-6 (high) and ISS-U0-7
(medium — `qa/issues.u0.jsonl`; filed by the checker against this lane in cycle 2, head `38b9fdb`
— this cycle re-runs their recorded reproductions verbatim per D-015)
**Executor:** claude-opus-subagent (dispatched as a time-critical /maker build unit, ~08:05 IST,
target 10:55 IST live webinar)
**Commits:** `ea48a4c` (the fix + tests + fixtures) then `fb45fbd` (self-caught correction — see
below); cycle 2 commit `7cfe7fd`; cycle 3 commit below.

## Fix cycle 2 (responds to cycle-1 FAIL — `qa/verdicts/u0-zoom-iframe-traversal.md`)

**What the checker found (cycle 1, VERDICT: FAIL, 2/3 criteria met):** the frame-recursion fix
from cycle 1 had no visibility gate on the `<iframe>` ELEMENT itself in its parent document.
`CLICK_JS`'s own `getBoundingClientRect` guard (`sb_join.py:94-95` at `cae512d`) reads the
clicked element's rect relative to ITS OWN document — a browser lays out an iframe's inner
content at natural size regardless of the iframe's own collapsed CSS size, so a same-origin
iframe collapsed to `width:0;height:0` (or hidden via `display:none`) still had its button
clicked (ISS-U0-4) and its text merged into the `END_PHRASES` check that
`record-commands.ts:118,168` uses to stop a live recording early (ISS-U0-5). The checker's own
adversarial fixtures (not part of this unit's cycle-1 test suite) reproduced both against the
real, unmodified code.

**What changed this cycle** — `packages/meeting-bot/py/sb_join.py:58-99` (`_IFRAME_WALK_JS`):
added `isFrameVisible(frame)`, called by `walkFrames` immediately before it would recurse into a
frame's `contentDocument` (line ~92: `if (!isFrameVisible(frame)) continue;`). When a frame is
not visible, its WHOLE subtree is skipped — never visited, never clicked (fixes ISS-U0-4), never
merged into `BODY_TEXT_JS`'s output (fixes ISS-U0-5) — because both `CLICK_JS` and `BODY_TEXT_JS`
share the one `walkFrames` traversal. `isFrameVisible` checks, on the `<iframe>` element itself:
1. `getBoundingClientRect()` width/height > 0 (catches the zero-size case);
2. `getClientRects().length === 0` (catches `display:none` on the iframe itself OR any
   ancestor — a `display:none` ancestor removes the iframe from layout entirely, so it generates
   no client rects at all; this is what also covers "iframe nested inside a `display:none` div"
   without a separate ancestor walk for that case);
3. an explicit walk up `parentElement` checking `getComputedStyle(el).visibility === 'hidden'`
   at every ancestor (needed because `visibility:hidden` still generates a box — non-empty
   `getClientRects()`/non-zero `getBoundingClientRect()` — but must not be treated as visible).

Top-document behaviour is byte-identical: `visit(doc)` for the top document is unconditional
(never gated by `isFrameVisible`, which only ever receives an `<iframe>` element), and
`CLICK_JS`'s own per-element `wanted.includes(t)` / 40-char / disabled / rect checks are
untouched — Zoho/Meet (no-iframe) pages take the same `querySelectorAll('iframe')` → `[]` path as
before, confirmed by `test_no_iframe_page_click_and_body_text_regression` staying green.
`BODY_TEXT_JS` for the top document still reads via `doc.body.innerText` inside the shared
`visit` callback (unchanged) — the fix only changes whether `walkFrames` recurses INTO a given
frame at all, not how any document's own text/elements are read once visited, so the "use
`innerText` consistently, gated on frame visibility" property holds structurally rather than as
a separate per-frame check.

**Tests added** — `packages/meeting-bot/py/test_sb_join_iframe.py`,
`test_hidden_iframe_subtree_is_never_clicked_or_merged`, parametrized over three new fixtures
(`packages/meeting-bot/py/fixtures/`): `hidden_zerosize_top.html` (iframe itself
`width:0;height:0`), `hidden_displaynone_top.html` (iframe itself `display:none`),
`hidden_in_displaynone_div_top.html` (iframe has no hiding style of its own; an ANCESTOR `<div>`
is `display:none`). All three load `hidden_leaf.html` (new), which contains a Join button
(matches `JOIN_TEXTS`) AND an `END_PHRASES` substring ("webinar has ended... thank you for
attending"). Each case asserts `CLICK_JS` returns `None` (not just non-matching — the click must
never fire) AND the END_PHRASE is absent from `BODY_TEXT_JS`'s merged output, AND the top
document's own text ("back") is still present (only the hidden subtree is skipped, not the
whole traversal).

**Measured against the ledger's own recorded reproductions (D-015)** — re-ran, not authored
fresh:
- **ISS-U0-4** (fix_direction: "Re-test with a 0-size AND a display:none iframe, both containing
  a matching button, asserting CLICK_JS returns null for both") — both named cases now covered
  (`hidden_zerosize_top.html`, `hidden_displaynone_top.html`) plus one extra case this unit added
  (ancestor-div `display:none`): **3/3 refused** (`click_hit` is `None` for all three; the
  checker's own zero-size adversarial fixture had returned `"join"` against the cycle-1 code).
- **ISS-U0-5** (checker's own evidence tested display:none AND zero-size, both leaking
  `"webinar has ended"` into `BODY_TEXT_JS` against the cycle-1 code) — both named cases plus the
  same extra ancestor-div case: **3/3 refused** (END_PHRASE absent from merged body text for all
  three).
- No recorded reproduction from either issue's row was left untested.

## Evidence — cycle 2

```
$ python -m pytest packages/meeting-bot/py -q
..............................                                           [100%]
30 passed in 6.35s          # 27 pre-existing (cycle 1) + 3 new hidden-iframe cases
$ python -m pytest packages/meeting-bot/py -q   # repeatability, second consecutive run
..............................                                           [100%]
30 passed in 5.42s
$ git status --porcelain -- packages/meeting-bot/py/fixtures/cross_origin_outer.html
   (no output — cycle 1's port-template fix still holds)
```

### RED-before / GREEN-after (D-020 discipline: timeout-wrapped, trap-restored on EXIT/INT/TERM/ERR, cmp-verified)

```
$ cp sb_join.py sb_join.py.fixed.bak                       # byte backup of the fixed file
$ cp <git show cae512d:...sb_join.py> sb_join.py            # swap in cycle-1 (FAIL) code
$ trap 'cp sb_join.py.fixed.bak sb_join.py; cmp sb_join.py.fixed.bak sb_join.py' EXIT INT TERM ERR
$ timeout 60 python -m pytest packages/meeting-bot/py/test_sb_join_iframe.py -k hidden_iframe -q
FAILED ...[hidden_zerosize_top.html]
FAILED ...[hidden_displaynone_top.html]
FAILED ...[hidden_in_displaynone_div_top.html]
3 failed, 5 deselected in 6.08s        <- RED, confirmed against cycle-1 (checker-FAILed) code
TRAP-RESTORE OK: byte-identical
$ cmp sb_join.py.fixed.bak sb_join.py -> identical, confirmed
$ python -m pytest packages/meeting-bot/py -q
..............................                                           [100%]
30 passed in 5.41s                      <- GREEN again on the fixed lane copy
```

```
$ git diff --stat
 packages/meeting-bot/py/sb_join.py             | 28 ++++++++++++++++++++++++
 packages/meeting-bot/py/test_sb_join_iframe.py | 25 +++++++++++++++++++++
 2 files changed, 53 insertions(+)
$ git status --porcelain
 M packages/meeting-bot/py/sb_join.py
 M packages/meeting-bot/py/test_sb_join_iframe.py
?? packages/meeting-bot/py/fixtures/hidden_displaynone_top.html
?? packages/meeting-bot/py/fixtures/hidden_in_displaynone_div_top.html
?? packages/meeting-bot/py/fixtures/hidden_leaf.html
?? packages/meeting-bot/py/fixtures/hidden_zerosize_top.html
```
No file outside `packages/meeting-bot/py/` touched; no real Zoom URL opened; `data/bot-profile/`
untouched; `raw/webinars/2026-09-27-ashoka-join-url.txt` never read.

### TS/pnpm suite — still not run in this lane (unchanged environment gap from cycle 1)

Zero TypeScript files touched this cycle either (`git diff --stat` above). Same recommendation
as cycle 1: run the full `pnpm` suite once at merge time or in the next checker pass.

## Known gaps carried from cycle 1 (unchanged by this cycle)

- No live-Zoom verification yet (ISS-U0-2 HUMAN_GATE, separate and unresolved).
- `_IFRAME_WALK_JS`'s sibling/nested-frame traversal after a click hit still isn't a full early
  exit (functionally correct, first-found-wins; noted, not fixed, same judgment call as cycle 1).

## Self-caught issue during build

The first commit (`ea48a4c`)'s `fixture_server` rewrote `fixtures/cross_origin_outer.html` IN
PLACE, baking that run's actual randomly-assigned port into the committed file. Running the full
suite a second time (different random port) would have silently pointed the cross-origin test at
a stale port. Caught before calling this unit done by re-running the suite twice in a row and
diffing the fixture file against what commit `ea48a4c` had staged. Fixed in `fb45fbd`: the
template keeps the literal `__PORT__` placeholder forever; the fixture now renders a throwaway
sibling file per test session and deletes it on teardown. Verified: two consecutive runs, two
different ports, template untouched both times (see "How to verify" below).

## What changed

- `packages/meeting-bot/py/sb_join.py:49-115` — replaced the top-document-only `CLICK_JS` and
  added a new `BODY_TEXT_JS` constant. Both now recurse into every same-origin `<iframe>` (and
  iframes nested inside those, to arbitrary depth) via a shared `_IFRAME_WALK_JS` helper
  (`walkFrames(doc, visit)`), which:
  - visits the current document first, then each of its `<iframe>` children;
  - wraps `frame.contentDocument` access in try/catch, so a cross-origin frame (the browser
    throws a `SecurityError`) is skipped silently rather than raising out of `execute_script`;
  - is a strict superset of the old behaviour: a page with zero iframes makes `querySelectorAll
    ('iframe')` return `[]`, so `walkFrames` never recurses and the single top-document pass is
    byte-for-byte the same querySelectorAll/click logic as before (Zoho/Meet/Webex paths, which
    route through `browser` per the contract's Scope section and have no iframe today, are
    unaffected).
  - `CLICK_JS` keeps C2's exact-match semantics untouched — same `wanted.includes(t)` full
    trimmed/lowercased string comparison, same 40-char length guard, same visibility/disabled
    guard, same `MAX_CLICKS`/`CLICK_WINDOW_S` gate in `main()` (unchanged) — the only change is
    *which document* the querySelectorAll runs against, never *what counts as a match*.
- `packages/meeting-bot/py/sb_join.py:257` — `main()`'s body-text read (feeds
  `END_PHRASES`/`RECONNECT_PHRASES`/`OFFLINE_PAGE_PHRASES` detection) now calls
  `sb.execute_script(BODY_TEXT_JS)` instead of the old top-document-only
  `document.body.innerText` read; `BODY_TEXT_JS` merges (space-joined) the `innerText` of the top
  document and every reachable same-origin iframe.
- **No "input fill" code existed in `sb_join.py` before this unit** (confirmed by search — the
  only reference to a name field anywhere in `packages/meeting-bot` is a comment in
  `src/capture/record-commands.ts:56` describing what renders on the page, not code that fills
  it) — there was nothing of that shape to make iframe-aware. Out of scope for this fix; not
  fabricated.
- `packages/meeting-bot/py/fixtures/` (new) — six local HTML fixtures reproducing ISS-U0-1's DOM
  shape without ever opening a real Zoom URL: `top.html` (Back link + same-origin iframe →
  `inner.html`, which has a name input, a "Join" button, a "Computer Audio" button, and
  waiting-for-host + reconnect-banner text), `nested_outer.html`/`nested_middle.html` (iframe two
  levels deep, reusing `inner.html` as the leaf), `no_iframe.html` (Zoho/Meet-style regression —
  join UI directly in the top document), `cross_origin_outer.html` (iframe `src` served from
  `127.0.0.1:<port>` while the parent is served from `localhost:<port>` — different origin per
  the browser's same-origin policy even though one `http.server` process answers both hosts on
  the same port, so no second server process was needed).
- `packages/meeting-bot/py/test_sb_join_iframe.py` (new) — 5 tests, real headless Chrome via
  SeleniumBase (matches `sb_join.py`'s own automation library; `headless=True, uc=False` — UC/
  anti-bot mode is only needed against Zoom's real checks, not local fixtures, and headless is
  fine for tests since no audio capture is involved), one shared browser instance for the whole
  module to stay light on RAM (~1.9GB free at build time):
  1. `test_click_js_finds_and_clicks_button_inside_same_origin_iframe` — CLICK_JS reaches into
     the iframe and clicks "Join".
  2. `test_body_text_js_reads_waiting_for_host_text_inside_iframe` — BODY_TEXT_JS's return value
     contains the iframe's waiting-for-host and reconnect-banner text, merged with the top
     document's own text.
  3. `test_click_js_and_body_text_js_traverse_nested_iframe` — both traverse two iframe levels
     deep.
  4. `test_cross_origin_iframe_is_skipped_without_throwing` — the cross-origin iframe's content
     never leaks into either script's output, and neither script raises.
  5. `test_no_iframe_page_click_and_body_text_regression` — a page with no iframe behaves exactly
     as before (Zoho/Meet regression guard).

## How to verify (commands + expected)

```
python -m pytest packages/meeting-bot/py -q
```
Expected: 27 passed (22 pre-existing + 5 new iframe tests), ~6s.

## Actual outputs (from maker's own run)

```
$ python -m pytest packages/meeting-bot/py -q
...........................                                              [100%]
27 passed in 6.57s
```

Repeatability check (run twice back-to-back, after `fb45fbd`'s fix, each picking its own random
port; confirms the port-rendering fix and rules out any leftover stray file from a prior run):

```
$ python -m pytest packages/meeting-bot/py/test_sb_join_iframe.py packages/meeting-bot/py/test_sb_join.py -q
...........................                                              [100%]
27 passed in 7.14s
$ python -m pytest packages/meeting-bot/py/test_sb_join_iframe.py packages/meeting-bot/py/test_sb_join.py -q
...........................                                              [100%]
27 passed in 5.54s
$ git status --porcelain -- packages/meeting-bot/py/fixtures/cross_origin_outer.html
   (no output — template untouched by either run)
```

### RED-before / GREEN-after (D-020 discipline)

Byte backup taken before any edit
(`sb_join.py.orig.bak` in this session's scratchpad) and again of the fixed file
(`sb_join.py.fixed.bak`) before the swap. Swapped the ORIGINAL (master, unfixed) `sb_join.py`
into the lane, ran the new iframe test file, then restored via `cp` + `cmp` byte-identical
verification (all under a `set -e` / `trap ... EXIT INT TERM ERR` script using **absolute
paths** throughout — an earlier attempt with a relative path inside a script that also `cd`'d
mid-script wrote the restore to the wrong directory; caught immediately by re-diffing, corrected,
and re-verified before proceeding).

```
$ <swap to original sb_join.py, absolute paths, trap-guarded>
$ python -m pytest .../test_sb_join_iframe.py -v
ImportError: cannot import name 'BODY_TEXT_JS' from 'sb_join' (... original sb_join.py has no
such symbol — the exact shape of ISS-U0-1: no iframe-aware body-text/click helper exists on
master)
1 error in 0.22s   <- RED, confirmed on unfixed code
RESTORE: OK (cmp verified byte-identical) -- target=.../sb_join.py
```
```
$ cmp sb_join.py.fixed.bak packages/meeting-bot/py/sb_join.py   -> identical, confirmed
$ python -m pytest packages/meeting-bot/py -q
...........................                                              [100%]
27 passed in 6.57s   <- GREEN again on the fixed lane copy
```

### TS/pnpm suite — not run in this lane (environment gap, not a regression)

This is a **fresh `git worktree add`** and has no `node_modules` at all
(`pnpm --filter @lkb/meeting-bot test` fails with "Local package.json exists, but node_modules
missing"). Zero TypeScript files were touched by this unit (`git diff --stat` below), so this
gap cannot be caused by this change; running a full `pnpm install` under this build's ~1.9GB
free-RAM / 60-minute time budget was judged not worth the risk. **Recommended follow-up (not
blocking this unit):** run `pnpm -r typecheck && pnpm --filter @lkb/meeting-bot test && pnpm -r
test` from the merged tree (or a `pnpm install`-ed worktree) before/at the next checker pass, to
formally close C10 for this unit the way `u0-zoom-browser-join`'s manifest did.

```
$ git diff --stat
 packages/meeting-bot/py/sb_join.py | 77 ++++++++++++++++++++++++++++++++------
 1 file changed, 66 insertions(+), 11 deletions(-)
$ git status --porcelain
 M packages/meeting-bot/py/sb_join.py
?? packages/meeting-bot/py/fixtures/
?? packages/meeting-bot/py/test_sb_join_iframe.py
```
No file outside `packages/meeting-bot/py/` touched. `packages/meeting-bot/src/calendar` and its
CLI (U5's concurrent lane) were not read or modified.

## Capability coverage (each new claim -> its isolating falsification)

| capability (one line) | the check that covers it | the falsifying edit | observed |
|---|---|---|---|
| `CLICK_JS` clicks a button that exists only inside a same-origin iframe | `test_click_js_finds_and_clicks_button_inside_same_origin_iframe` | swap in master's original `sb_join.py` (no `BODY_TEXT_JS`/iframe-aware `CLICK_JS` at all) | RED: `ImportError: cannot import name 'BODY_TEXT_JS'` (collection fails outright — the symbol this test needs doesn't exist pre-fix). Restored, then GREEN: `27 passed in 6.57s`. |
| `BODY_TEXT_JS` reads text that exists only inside a same-origin iframe (waiting-for-host / reconnect banner) | `test_body_text_js_reads_waiting_for_host_text_inside_iframe` | same swap as above | same RED/GREEN pair as above (one shared import gate covers both new symbols) |
| Traversal recurses to arbitrary iframe depth, not just one level | `test_click_js_and_body_text_js_traverse_nested_iframe` (2 levels deep) | same swap | same RED/GREEN pair |
| Cross-origin iframe is skipped silently, never throws, never leaks content | `test_cross_origin_iframe_is_skipped_without_throwing` | n/a — this is an invariant that also holds on master (master's old code never looked at any iframe, so it never threw either); the test guards the NEW recursive code specifically against regressing into an unguarded `contentDocument` access | Passes on the fixed code (`27 passed`); verified by code inspection that every `frame.contentDocument` read in `_IFRAME_WALK_JS` is wrapped in try/catch, both in `CLICK_JS` and `BODY_TEXT_JS`. |
| A page with zero iframes (Zoho/Meet) behaves exactly as before | `test_no_iframe_page_click_and_body_text_regression` | n/a — regression guard, passes both before and after by construction (no iframe path is untouched code) | Passes on the fixed code. |

## Live browser evidence

**None captured for this unit, by design.** Per the dispatch's constraints, no real Zoom URL was
opened, the bot was not launched against the live webinar, `data/bot-profile/` was never
touched, and `raw/webinars/2026-09-27-ashoka-join-url.txt` was never read (its path was named in
this manifest only as text, exactly as ISS-U0-1's own filed evidence names it — the token inside
it was neither read nor printed). All evidence above is from local HTML fixtures + a headless
Chrome, per the dispatch's own instruction to defer live verification.

## Planned live verification (after Umesh's Zoom sign-in)

Once Umesh has signed the bot's persistent Chrome profile (`data/bot-profile/`) into a Zoom
account (resolving ISS-U0-2, the separate HUMAN_GATE — untouched by this unit), run, around
09:50-10:50 IST today against the real Ashoka Educator Dialogues webinar:

```
python packages/meeting-bot/py/sb_join.py <the real join URL> --profile data/bot-profile \
  --title <session title> --stop-file <a stop-file path>
```

Expected event sequence (stdout, one JSON object per line): `starting` → `opened` → `clicked
text="join from browser"` (top-document click, unchanged) → then, with THIS unit's fix, either a
`clicked text="..."` event for whatever the iframe's own Join/Computer-Audio button text is
(previously impossible — the old code could never see or click it), or, if the webinar hasn't
started yet, no crash/hang and a normal `heartbeat` while the DOM shows a waiting-for-host
message (previously that message was invisible to `body`, so `END_PHRASES`/`RECONNECT_PHRASES`
detection could never fire on it either). Confirm reaching the waiting screen or joining audio;
watch for any `warn`/`fatal` event, which would indicate a live-DOM shape this fixture set didn't
anticipate.

## Known gaps

- TS/pnpm suite not run in this lane (see "TS/pnpm suite" section above) — recommend running it
  once at merge time or in the next checker pass, since this lane's `git worktree add` had no
  `node_modules` and installing one mid-build was judged too risky under the RAM/time budget.
- No live-Zoom verification yet (ISS-U0-2 HUMAN_GATE is a separate, unresolved gate; this unit's
  fix is untested against Zoom's *real* DOM shape beyond the ISS-U0-1 evidence text/screenshot
  that this fixture set was built to reproduce). Flagged, not hidden.
- The fixture set approximates Zoom's real structure (one same-origin iframe, `src` identical to
  the parent URL, per ISS-U0-1's own evidence) but cannot prove Zoom's *actual* live DOM matches
  exactly — only a live, signed-in run can close that gap.
- `_IFRAME_WALK_JS`'s `walkFrames` continues visiting sibling/nested frames after a click hit is
  found (skips work via an early-return guard in the `visit` callback, but the outer recursive
  walk itself doesn't short-circuit) — functionally correct (first-found-wins, matches the old
  single-return semantics) but slightly less efficient than a full early exit. Not fixed here:
  correctness over micro-optimization under the time budget; noted for a future pass if profiling
  ever shows it matters (each tick's DOM is tiny — one Zoom iframe, not hundreds).

**Status (cycle 1):** superseded by cycle 2 below.

## Fix cycle 3 (responds to cycle-2 FAIL — `qa/verdicts/u0-zoom-iframe-traversal.md`, "Cycle 2")

**What the checker found (cycle 2, VERDICT: FAIL, 2/3 criteria met):** cycle 2's `isFrameVisible`
(`sb_join.py:74-85` at head `38b9fdb`) enumerated hiding TECHNIQUES one at a time (self zero-size,
self/any-ancestor `display:none` via `getClientRects()`, ancestor `visibility:hidden`) and the
checker's own adversarial fixtures kept finding new techniques the enumeration missed:
- **ISS-U0-6 (high):** an ancestor `<div>` that clips its OWN box to zero size via
  `overflow:hidden`, while the `<iframe>` itself keeps an explicit nonzero `width`/`height`.
  `overflow:hidden` only clips rendering — it never removes the child from the layout tree or
  zeros the child's own rect — so `getClientRects().length === 0` stayed `false` (non-empty) and
  the frame was wrongly treated as visible. `click_hit: "join"`, end-phrase leaked.
- **ISS-U0-7 (medium):** `opacity:0` and off-screen absolute positioning (`left:-9999px;
  top:-9999px`, nonzero size) also defeated the gate — neither computed `opacity` nor actual
  viewport intersection was ever checked. Both reproduced `click_hit: "join"` + leaked end-phrase.

The checker's verdict named the fix direction explicitly: stop enumerating techniques one at a
time and replace the whole approach with an actual on-screen visible-AREA / intersection test.

**What changed this cycle** — `packages/meeting-bot/py/sb_join.py:74-119` (`isFrameVisible`,
inside `_IFRAME_WALK_JS`), replaced entirely, IN PLACE (same function name, same call site at
`walkFrames`'s `if (!isFrameVisible(frame)) continue;` — untouched):
1. `_rectIntersect(a, b)` — a small helper: returns the intersection rect of two
   `{left,top,right,bottom}` boxes, with `width`/`height` clamped to `>= 0` (no negative
   "intersection" when the boxes don't overlap at all).
2. `_hiddenBySelfStyle(cs)` — `display === 'none' || visibility === 'hidden' || visibility ===
   'collapse' || parseFloat(opacity) === 0`, applied to a single element's own computed style.
3. `isFrameVisible(frame)` (`sb_join.py:80-97`):
   - checks `_hiddenBySelfStyle` on the `<iframe>` itself first (closes the `opacity:0` half of
     ISS-U0-7 directly, plus keeps the cycle-2 `display:none`/`visibility:hidden` self-checks);
   - computes `r` = the frame's own `getBoundingClientRect()` intersected with
     `frame.ownerDocument.defaultView`'s viewport (`0,0,innerWidth,innerHeight`) — `ownerDocument`
     is the PARENT document containing the `<iframe>` tag (not its nested `contentDocument`), so
     this is the same coordinate space the ancestor walk below lives in, and it closes the
     off-screen half of ISS-U0-7 (`offscreen_top.html`'s `left:-9999px` now fails the viewport
     intersection);
   - fails immediately if `r.width < 2 || r.height < 2` (an exact 0×0 rect is unambiguously
     invisible; the 2px floor is a small deliberate margin above that so a 1px rounding/
     antialiasing sliver from `getBoundingClientRect()` floats never counts as "on screen");
   - walks `el = frame.parentElement` up to `documentElement` (loop ends naturally —
     `documentElement.parentElement` is `null`, its parent is the `Document`, not an `Element`):
     at each ancestor, `_hiddenBySelfStyle` fails immediately (covers `display:none`/
     `visibility:hidden`/`opacity:0` on ANY ancestor, same as cycle 2 plus the new opacity case);
     and whenever that ancestor's own `overflow-x`/`overflow-y` computed value isn't `'visible'`
     (i.e. `hidden`/`clip`/`auto`/`scroll`), the running rect `r` is intersected with THAT
     ancestor's own `getBoundingClientRect()` too — this is the ISS-U0-6 fix: a zero-size
     `overflow:hidden` ancestor now shrinks `r` to `0×0` regardless of the iframe's own nonzero
     rect, because the ancestor's own (zero) box is what gets intersected in, not just checked for
     a hiding *keyword*.
   - final visibility = the intersected rect surviving every ancestor at `>= 2×2`px.
   - `_rectIntersect`, `_hiddenBySelfStyle` and `isFrameVisible` are declared once inside
     `_IFRAME_WALK_JS` (prepended to both `CLICK_JS` and `BODY_TEXT_JS`), so both scripts share the
     identical geometric test — no drift between the click gate and the body-text gate.
   - **Nesting composes automatically, unchanged from cycle 2's design:** `walkFrames` only
     recurses into a frame once that frame's OWN `isFrameVisible()` call passes, and each call
     only looks at that frame's local ancestor chain in ITS OWN parent document (via
     `frame.ownerDocument.defaultView`) — a nested frame's geometry is always checked fresh
     against its own (already-visible) parent document, never inherited or assumed from the outer
     frame's result.

Top-document behaviour is byte-identical: `isFrameVisible` is only ever called on an `<iframe>`
element (never on `document` itself), so a page with zero iframes (`querySelectorAll('iframe')`
→ `[]`) never calls it at all — Zoho/Meet take the exact same code path as cycles 1/2, confirmed
by `test_no_iframe_page_click_and_body_text_regression` staying green (still in the 35-test run
below).

**Tests added** — `packages/meeting-bot/py/test_sb_join_iframe.py`:
- `test_zerosize_overflow_hidden_ancestor_iframe_is_never_clicked_or_merged` — new fixture
  `fixtures/zerosize_ancestor_top.html` (iframe with its own explicit `width:400px;height:300px`,
  nested inside `<div style="width:0;height:0;overflow:hidden;">`, reusing the existing
  `hidden_leaf.html` content). Asserts `CLICK_JS` returns `None` and the end-phrase never leaks.
- `test_opacity_or_offscreen_iframe_is_never_clicked_or_merged`, parametrized over two new
  fixtures: `fixtures/opacity_zero_top.html` (iframe itself `opacity:0`, otherwise nonzero
  on-screen size) and `fixtures/offscreen_top.html` (iframe itself
  `position:absolute;left:-9999px;top:-9999px`, nonzero size). Same two assertions.
- `test_happy_path_visible_iframe_still_clicked_and_read`, parametrized over two new fixtures —
  the dispatch's explicit worry that the geometric rewrite could overcorrect into breaking today's
  real join: `fixtures/happy_fullviewport_top.html` (`position:fixed;inset:0;width:100%;
  height:100%` — Zoom's real web-client shape is often a full-viewport overlay, not a small fixed
  box) and `fixtures/happy_scrollable_container_top.html` (a genuinely visible, on-screen iframe
  nested inside an `overflow:auto` container that does NOT clip it — the container is `700×520`,
  the iframe `640×480`, so it fits entirely inside; this proves an `overflow:auto` ancestor is
  only treated as clipping when it actually reduces the intersected rect, not merely because its
  computed `overflow` isn't `'visible'`). Both fixtures reuse `inner.html` (the real join-UI leaf:
  name field, Join button, Computer Audio button, waiting-for-host text) and assert the SAME
  positive behaviour the pre-existing `top.html` tests assert: text is read, the Join button is
  clicked, and the top document's own text ("back") survives the merge.

**Measured against the ledger's own recorded reproductions (D-015)** — re-ran, not authored
fresh:
- **ISS-U0-6** (reproduction: same-origin iframe with its own explicit nonzero `width:400px;
  height:300px` nested inside an ancestor `<div style="width:0;height:0;overflow:hidden;">`,
  `CLICK_JS` returns the matched text, `BODY_TEXT_JS` leaks the end-phrase) —
  `zerosize_ancestor_top.html` reproduces this exact construction verbatim: **1/1 refused**
  (`click_hit` is `None`, end-phrase absent) against the fix; **RED-confirmed** (`click_hit ==
  "join"`, end-phrase present) against the unmodified cycle-2 code (`38b9fdb`) — see RED/GREEN
  below.
- **ISS-U0-7** (reproduction: `opacity_zero_top.html`-shaped and `offscreen_top.html`-shaped
  fixtures per the two style variants named in the issue, both leaking a click hit + end-phrase
  against the real `CLICK_JS`/`BODY_TEXT_JS`) — both named constructions reproduced verbatim by
  the two new fixtures of the same names: **2/2 refused** against the fix; **RED-confirmed** (both
  `click_hit == "join"`, both leaking) against the unmodified cycle-2 code.
- No recorded reproduction from either issue's row was left untested.

**Happy-path results (the dispatch's explicit overcorrection check):** both new happy-path
fixtures pass — `happy_fullviewport_top.html` and `happy_scrollable_container_top.html` are both
still traversed, their text read (`"please wait, the host will let you in soon"` present), and
their Join button clicked (`click_hit == "join"`, `"join (clicked)"` present in the merged body
text afterward), with the top document's own `"back"` text still present. The geometric rewrite
does not treat "fills the whole viewport" or "sits inside a non-clipping scrollable container" as
in any way less visible than the pre-existing fixed-size fixtures.

## Evidence — cycle 3

```
$ python -m pytest packages/meeting-bot/py -q
...................................                                       [100%]
35 passed in 5.69s          # 30 pre-existing (cycles 1+2) + 5 new cycle-3 cases
```

### RED-before / GREEN-after (D-020 discipline: timeout-wrapped, trap-restored on EXIT/INT/TERM/ERR, cmp-verified)

Byte backup taken (`sb_join.py.fixed.bak`) before either swap; `trap ... EXIT INT TERM ERR` fired
the restore + `cmp` verification on every run, success or failure — never only on the happy path.

```
$ cp packages/meeting-bot/py/sb_join.py <scratch>/sb_join.py.fixed.bak
$ trap 'cp <scratch>/sb_join.py.fixed.bak packages/meeting-bot/py/sb_join.py; \
        cmp <scratch>/sb_join.py.fixed.bak packages/meeting-bot/py/sb_join.py' EXIT INT TERM ERR
$ git show 38b9fdb:packages/meeting-bot/py/sb_join.py > packages/meeting-bot/py/sb_join.py   # cycle-2 FAILed code
$ timeout 120 python -m pytest packages/meeting-bot/py -q -k "zerosize_overflow_hidden_ancestor"
FAILED ...test_zerosize_overflow_hidden_ancestor_iframe_is_never_clicked_or_merged
  AssertionError: zerosize_ancestor_top.html: CLICK_JS clicked 'join' inside a zero-size,
  overflow:hidden ancestor's iframe (ISS-U0-6)
1 failed, 34 deselected in 5.52s        <- RED, confirmed against cycle-2 (checker-FAILed) code
--- restoring packages/meeting-bot/py/sb_join.py from fixed backup ---
RESTORE OK (byte-identical)
$ git show 38b9fdb:packages/meeting-bot/py/sb_join.py > packages/meeting-bot/py/sb_join.py   # cycle-2 FAILed code again
$ timeout 120 python -m pytest packages/meeting-bot/py -q -k "opacity_or_offscreen or happy_path"
FAILED ...test_opacity_or_offscreen_iframe_is_never_clicked_or_merged[opacity_zero_top.html]
FAILED ...test_opacity_or_offscreen_iframe_is_never_clicked_or_merged[offscreen_top.html]
2 failed, 2 passed, 31 deselected in 6.52s   <- RED for both ISS-U0-7 cases; the 2 happy-path
                                                 fixtures already passed even on cycle-2 code
                                                 (expected — cycle 2 never broke the visible case)
--- restoring packages/meeting-bot/py/sb_join.py from fixed backup ---
RESTORE OK (byte-identical)
$ python -m pytest packages/meeting-bot/py -q
...................................                                       [100%]
35 passed in 5.69s                      <- GREEN again on the fixed lane copy, full suite
```

```
$ git diff --stat
 packages/meeting-bot/py/sb_join.py             | 71 ++++++++++++++++++++------
 packages/meeting-bot/py/test_sb_join_iframe.py | 63 +++++++++++++++++++++++
 2 files changed, 117 insertions(+), 17 deletions(-)
$ git status --porcelain
 M packages/meeting-bot/py/sb_join.py
 M packages/meeting-bot/py/test_sb_join_iframe.py
?? packages/meeting-bot/py/fixtures/happy_fullviewport_top.html
?? packages/meeting-bot/py/fixtures/happy_scrollable_container_top.html
?? packages/meeting-bot/py/fixtures/offscreen_top.html
?? packages/meeting-bot/py/fixtures/opacity_zero_top.html
?? packages/meeting-bot/py/fixtures/zerosize_ancestor_top.html
```

No file outside `packages/meeting-bot/py/` touched; no real Zoom URL opened; no live bot;
`data/bot-profile/` untouched; `raw/webinars/2026-09-27-ashoka-join-url.txt` never read. U5's
calendar lane untouched.

### TS/pnpm suite — still not run in this lane (unchanged environment gap from cycles 1-2)

Zero TypeScript files touched this cycle either (`git diff --stat` above). Same disclosed,
non-blocking gap as cycles 1 and 2.

## Known gaps carried into cycle 3

- No live-Zoom verification yet (ISS-U0-2 HUMAN_GATE, separate and unresolved).
- This is the FINAL fix cycle for this unit (3 of max 3, round cap per the project's D-013/D-014
  backlog rules — the security/tenancy-class exception does not apply here, but a live webinar at
  10:55 IST is the forcing function regardless). If the checker's cycle-3 pass finds a FOURTH
  independent CSS construction defeating `isFrameVisible`, that is a `HUMAN_GATE` call, not a
  cycle-4 build — the geometric intersection approach was chosen specifically because it is not
  another single-technique patch, but the checker's own judgment on cycle 3 is what decides
  whether a fourth round-N+1 is warranted regardless of the cap.
- `_IFRAME_WALK_JS`'s sibling/nested-frame traversal after a click hit still isn't a full early
  exit (unchanged from cycles 1-2 — functionally correct, not fixed here, same judgment call).

**Status (cycle 2):** superseded by cycle 3 above.

**Status:** checked-PASS (cycle 3, checker verdict `qa/verdicts/u0-zoom-iframe-traversal.md` "Cycle 3")

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree

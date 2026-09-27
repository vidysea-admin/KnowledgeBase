# Manifest — u0-zoom-iframe-traversal
**Contract:** qa/contracts/meeting-bot-live-capture.md (T-024b, ADOPTED 2026-09-25) — criteria C1
(real browser join), C2 (bounded/denylisted auto-click — exact-match semantics unchanged, only
traversal added), C10 (no regression)
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** ISS-U0-1 (high, coverage-class — `qa/issues.u0.jsonl`)
**Executor:** claude-opus-subagent (dispatched as a time-critical /maker build unit, ~08:05 IST,
target 10:55 IST live webinar)

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

**Status:** ready-for-check

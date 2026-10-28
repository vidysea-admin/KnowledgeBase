# T-029 — Auto-reconnect

Roadmap row: `docs/meeting-bot-roadmap.md:44`. Done when: "a forced network drop mid-run is
recovered without a human, and the gap is logged."

Bound root: `D:/KnowledgeBase-lanes/t-029-reconnect` (worktree, branch `wave/t-029-reconnect` @
`784df67`).

## What changed

**`packages/meeting-bot/py/sb_join.py`** (main bot loop, `kill_orphans`/title-pinning/tab-switch
recovery/click caps all left untouched):

- `RECONNECT_PHRASES` / `OFFLINE_PAGE_PHRASES` (lowercase substrings) + `RECONNECT_THRESHOLD_S=20`
  / `RECONNECT_COOLDOWN_S=30` / `MAX_RECONNECTS=5` constants.
- `detect_trouble(body_lower, online)` — pure function, no Selenium object touched. Returns
  `"banner"` / `"offline"` / `None` from the same `document.body.innerText` the loop already
  computes for the join/end-phrase checks (no extra `execute_script` call), plus a fresh
  `navigator.onLine` read.
- `ReconnectState` — pure state machine (`tick(reason, now) -> (action, gap)`,
  `close_at_end(now) -> gap|None`). Actions: `wait` (under threshold) → `reload` (over threshold,
  not in cooldown, under `MAX_RECONNECTS`) → `cooldown` (reloaded too recently) → `give-up` (over
  `MAX_RECONNECTS`, keeps holding the window, stops reloading). A gap `{start, end, reason,
  recovered}` is emitted the tick trouble clears (`recovered: true`), or once at run-end via
  `close_at_end` if a gap was still open when the stop-file/browser-death path fires
  (`recovered: false`).
- `main()`'s loop: computes `online` + `reason` each tick, drives `reconnect.tick(...)`, and on
  `"reload"` calls `sb.uc_open_with_reconnect(a.url, 4)` — **the same open call used at initial
  join**, and the existing `CLICK_JS`/`JOIN_TEXTS`/`MAX_CLICKS` click mechanism is untouched
  (no new selectors, no click-target widening). The only change to clicking is a widened *time*
  window (`extra_click_until`, reset to `now + CLICK_WINDOW_S` after a reload) so the bot can
  click "Join" again after reconnecting past the original 15-minute click window — required for
  a drop that happens later in a long-running webinar; it does not touch `MAX_CLICKS` or the
  target list. Every gap is emitted on stdout as a `{"event":"gap", ...}` JSON line — the
  existing per-line JSON event stream `obs-windows.ts` already parses, per the brief's "pick the
  smallest channel" — no new file/pipe.

**`packages/meeting-bot/src/capture/reconnect-gaps.ts`** (new file — see "Why a new file" below):
`GapWindow`/`GapRecord` types, `gapsForSourceDoc()` (epoch-seconds → ISO timestamps for
`source.json`), `collectGapEvent()` (pushes a `BotEvent` with `event:"gap"` onto an array;
no-op for everything else).

**`packages/meeting-bot/src/capture/record-commands.ts`** (`runRecord`, `finalizeRecording`):
`runRecord` now collects gaps via `collectGapEvent` inside the existing `onEvent` callback (the
same one that already detects `"ended"`), and passes them to `finalizeRecording`, which now
takes an optional `gaps: GapWindow[] = []` parameter and writes `gaps: gapsForSourceDoc(gaps)`
into `source.json`. `runFinalize` (the T-047 process-death recovery path) calls
`finalizeRecording` without the new argument, so it gets `gaps: []` — there is no live event
stream in that recovery path to draw gaps from; this is a known, disclosed scope boundary, not a
bug (see "Known gaps"). `schema/sources.schema.json` has `additionalProperties: true`, so no
schema change was needed.

### Why a new file (`reconnect-gaps.ts`) instead of editing in place only

`record-commands.ts` was 270 non-blank LOC before this change (budget 300) and `obs-windows.ts`
was already at 271. Inlining `gapsForSourceDoc`/`collectGapEvent` into `record-commands.ts` would
have pushed it to ~300 and made the pure mapping logic untestable without also exercising
`finalizeRecording`'s `ffmpeg`/OBS calls. Splitting it out (43 LOC) keeps both files well under
budget and mirrors the existing pattern of `controller-state.ts` already being split out of the
same file for the same reason (T-047).

## How to verify

```bash
cd D:/KnowledgeBase-lanes/t-029-reconnect

# Python unit tests (pure detect_trouble + ReconnectState, no browser)
python -m pytest packages/meeting-bot/py/test_sb_join.py -v

# TS unit tests for the gap -> source.json path (no browser/ffmpeg/OBS)
pnpm --filter @lkb/meeting-bot test

# Whole-repo suites
pnpm -r --no-bail test
pnpm -r typecheck
pnpm lint:structure   # exits 1 at the pre-existing lint-root check (ISS-248, 16>15 loose root
                       # files from the untracked AGENTS.md/.codex runtime projection) — this unit
                       # touches no root file; lint-loc itself is OK (314 files within budget)
```

## Capability coverage (falsifiable rows)

| # | Behaviour | How it's falsified | Result |
|---|---|---|---|
| 1 | Trouble under the 20s roadmap threshold never triggers a reload | `test_tick_stays_wait_under_threshold` (hardcoded 19.0s, not derived from the constant) | PASS; mutating `RECONNECT_THRESHOLD_S` 20→5 makes this test **fail** (see Falsification below) |
| 2 | Trouble past the 20s threshold triggers exactly one reload | `test_tick_reloads_once_threshold_crossed` (hardcoded 21.0s) | PASS; same mutation above also fails this one |
| 3 | The roadmap's literal 20s value is pinned, not just the mechanism | `test_reconnect_threshold_constant_is_20s_per_roadmap` | PASS |
| 4 | A second reload attempt inside the cooldown window is blocked | `test_tick_cooldown_blocks_immediate_second_reload` | PASS |
| 5 | A reload fires again once the cooldown has elapsed | `test_tick_reloads_again_after_cooldown_elapses` | PASS |
| 6 | Reloading stops (give-up) once `MAX_RECONNECTS` is exceeded, without losing state | `test_tick_gives_up_after_max_reloads` | PASS |
| 7 | A recovered gap carries the exact `{start,end,reason,recovered:true}` the caller needs to log | `test_tick_recovery_closes_a_gap_with_correct_fields` | PASS; mutating `"recovered": True` → `False` in the recovery branch makes this **fail** (Falsification below) |
| 8 | No gap is fabricated when nothing was ever wrong | `test_tick_no_gap_when_never_in_trouble` | PASS |
| 9 | A gap still open at run-end is recorded with `recovered:false`, not silently dropped | `test_close_at_end_records_an_unrecovered_gap` (+ idempotency: a second `close_at_end` is a no-op) | PASS |
| 10 | An in-app banner and a hard net-error page are both detected, through the same path | `test_detect_trouble_banner_phrase`, `test_detect_trouble_net_error_interstitial`, `test_detect_trouble_offline_flag_wins_even_with_clean_body` | PASS |
| 11 | Ordinary page text never false-positives as trouble | `test_detect_trouble_none_on_ordinary_page` | PASS |
| 12 | `gap` events on the stdout stream are correctly mapped into `source.json`'s ISO-timestamped shape | `reconnect-gaps.test.ts`: `gapsForSourceDoc converts epoch-second windows to ISO timestamps...` | PASS |
| 13 | Only `"gap"` events are collected; every other event type on the same stream is ignored | `reconnect-gaps.test.ts`: `collectGapEvent ignores every non-gap event...` | PASS |
| 14 | A malformed gap event (missing reason/recovered) degrades to a safe default instead of throwing | `reconnect-gaps.test.ts`: `collectGapEvent defaults a missing reason/recovered...` | PASS |
| 15 | End-to-end, live headed Chrome, real reload+rejoin+gap-logging against a real forced-drop fixture (see Offline live proof) | `offline_proof.py` (scratch, not committed — see Evidence) | PASS |

## Evidence

### Python tests

```
$ python -m pytest packages/meeting-bot/py/test_sb_join.py -v
...
collected 14 items
test_detect_trouble_none_on_ordinary_page PASSED
test_detect_trouble_banner_phrase PASSED
test_detect_trouble_offline_flag_wins_even_with_clean_body PASSED
test_detect_trouble_net_error_interstitial PASSED
test_reconnect_threshold_constant_is_20s_per_roadmap PASSED
test_tick_stays_wait_under_threshold PASSED
test_tick_reloads_once_threshold_crossed PASSED
test_tick_cooldown_blocks_immediate_second_reload PASSED
test_tick_reloads_again_after_cooldown_elapses PASSED
test_tick_gives_up_after_max_reloads PASSED
test_tick_recovery_closes_a_gap_with_correct_fields PASSED
test_tick_no_gap_when_never_in_trouble PASSED
test_close_at_end_records_an_unrecovered_gap PASSED
test_close_at_end_is_none_when_nothing_was_open PASSED
============================= 14 passed in 0.11s ==============================
```

### D-020 falsification (mutation, timeout + byte-backup trap on EXIT/ERR/INT/TERM + cmp)

Script backed up `sb_join.py`, applied each mutation under `trap restore EXIT ERR INT TERM`,
ran `timeout 60 python -m pytest ...`, then explicitly restored + `cmp`'d after each mutation too:

```
=== MUTATION 1: RECONNECT_THRESHOLD_S 20 -> 5 (threshold behaviour) ===
FAILED test_reconnect_threshold_constant_is_20s_per_roadmap - assert 5 == 20
FAILED test_tick_stays_wait_under_threshold - AssertionError: assert ('reload', None) == ('wait', None)
2 failed, 12 passed in 0.69s
[restore] OK: sb_join.py byte-identical to backup
mutant-1 exit: 1 (expect non-zero = a test caught it)

=== MUTATION 2: hardcode recovered=False even on real recovery ===
FAILED test_tick_recovery_closes_a_gap_with_correct_fields
    AssertionError: assert {'start': 100...vered': False} == {'start': 100...overed': True}
1 failed, 13 passed in 0.67s
[restore] OK: sb_join.py byte-identical to backup
mutant-2 exit: 1 (expect non-zero = a test caught it)

=== FINAL: confirm working tree restored, tests green again ===
14 passed in 0.04s
[restore] OK: sb_join.py byte-identical to backup
```

`git status --porcelain` immediately after: only the intended tracked edits + new files, no
mutation residue.

### TS package tests (`@lkb/meeting-bot`)

```
$ pnpm --filter @lkb/meeting-bot test
✔ gapsForSourceDoc converts epoch-second windows to ISO timestamps, keeping reason/recovered
✔ gapsForSourceDoc on an empty run is an empty array
✔ collectGapEvent pushes a well-formed gap event
✔ collectGapEvent ignores every non-gap event (heartbeat, clicked, ended, reconnect-reload)
✔ collectGapEvent defaults a missing reason/recovered rather than throwing
✔ collectGapEvent accumulates multiple gaps across a run in order
... (existing controller-state/watchdog/joiners/live-monitor/platform/user-profile/strategy suites, unchanged)
ℹ tests 88
ℹ pass 88
ℹ fail 0
```

```
$ pnpm --filter @lkb/meeting-bot typecheck
> tsc --noEmit -p tsconfig.json
(no output — clean)
```

### Whole-repo suites

```
$ pnpm -r --no-bail test   # exit 0
packages/core   : tests 7   pass 7   fail 0
packages/db     : tests 14  pass 14  fail 0
packages/ai     : tests 74  pass 74  fail 0
packages/ask    : tests 50  pass 50  fail 0
packages/ingest : tests 97  pass 97  fail 0
packages/index  : tests 228 pass 228 fail 0
packages/meeting-bot : tests 88  pass 88  fail 0
apps/api        : tests 175 pass 175 fail 0
apps/web        : no test script (Done, no-op)
```

```
$ pnpm -r typecheck   # exit 0
apps/web typecheck: Done
packages/core typecheck: Done
packages/ai typecheck: Done
packages/db typecheck: Done
packages/ask typecheck: Done
packages/ingest typecheck: Done
packages/index typecheck: Done
apps/api typecheck: Done
packages/meeting-bot typecheck: Done
(10 of 11 workspace projects have a typecheck script; all Done, 0 errors)
```

```
$ pnpm lint:structure   # exit 1
lint-loc: OK (314 file(s) within budget)
lint-dirsize: OK (84 dir(s) within budget)
lint-root: FAIL — 1 violation(s)
  root has 16 loose files (budget 15): ... AGENTS.md ... (matches qa/issues.jsonl ISS-248
  verbatim: "the runtime-created untracked AGENTS.md makes the repository's structure gate fail
  in every Codex session" — status open, pre-existing, not touched by this unit)
 ELIFECYCLE  Command failed with exit code 1.
```
`git status --porcelain` at the time of this run showed only this unit's files — no root file was
added or touched, confirming the failure is ISS-248, not a regression from this unit.

### Offline live proof (real headed Chrome, real reload, real gap)

Spec: "a local HTML fixture served from a temp http server that shows the reconnect banner for
25 s, driven by SeleniumBase headless ... if feasible in <5 min." Built as a scratch driver (not
committed — throwaway, scratchpad-only):

- `fixture_server.py` — a threading HTTP server computing a **fixed wall-clock** `CLEAR_AT`
  (server-start + 45s) once at startup, so a page *reload* doesn't reset the simulated outage
  (a real network drop wouldn't either). Body text is the reconnect banner
  ("Oops, connection interrupted. Trying to reconnect...") until `CLEAR_AT`, then
  "You are back online. Recovered."
- `offline_proof.py` — starts that server, then runs the **real, unmodified**
  `packages/meeting-bot/py/sb_join.py` as a subprocess (`--no-click`, throwaway profile dir)
  against it, streams its stdout JSON events, and asserts it saw both a `reconnect-reload` and a
  `gap` event.
- Ran headed (not headless — `sb_join.py` hardcodes `headed=True`; SeleniumBase's UC mode is
  headed-only on this build), which the docstring in `sb_join.py` already explains is required
  for OBS's audio capture in production, and is what a live webinar run actually uses.

Result (~75s wall clock, well under the 5-minute budget):

```
CLEAR_AT=<t0+45000ms>
{"event": "starting", ...}
{"event": "opened", "url": "http://127.0.0.1:8934/"}
{"event": "heartbeat", ...}
{"event": "reconnect-reload", "reason": "banner", "attempt": 1}   # ~22s after opening: threshold crossed
{"event": "reconnect-rejoined"}
{"event": "heartbeat", ...}
{"event": "reconnect-reload", "reason": "banner", "attempt": 2}   # banner still showing post-reload (CLEAR_AT not yet reached) -> cooldown, then a second attempt
{"event": "reconnect-rejoined"}
{"event": "gap", "start": 1790277555.05, "end": 1790277614.39, "reason": "banner", "recovered": true}
GAP CAPTURED: duration=59.3s reason=banner recovered=True
RESULT saw_reload=True saw_gap=True events=9
PROOF PASSED
```

No orphan Chrome left running afterward (`Get-CimInstance Win32_Process ... -like
'*bot-profile-proof*'` returned nothing post-run); the throwaway scratch profile dir was removed.

## Known gaps

1. **Not a real network drop.** The offline proof simulates the drop by serving banner text from
   page load (not by cutting an active connection mid-session). `sb_join.py`'s actual detection
   path (`detect_trouble` reading the live DOM every 2s) is exercised for real; what isn't
   exercised is Zoho's actual webinar UI producing that banner text, or a real OS-level network
   interruption. **A later live run with an actual forced network drop remains the disclosed
   live-proof gap**, as the brief anticipated.
2. **`RECONNECT_PHRASES`/`OFFLINE_PAGE_PHRASES` are best-guess substrings** — the roadmap names
   the state only as "connection interrupted / trying to reconnect"; Zoho's exact banner wording
   in production has not been observed by this unit. If the live text differs, `detect_trouble`
   won't fire until the phrase list is updated from an observed banner.
3. **`runFinalize` (T-047 recovery path) always writes `gaps: []`.** There is no live event
   stream to draw gaps from once the controlling process has died and `lkb finalize --stop-obs`
   is recovering after the fact — this is a scope boundary of T-029, not a defect in it.
4. **`MAX_RECONNECTS=5` and `RECONNECT_COOLDOWN_S=30` are judgment calls**, not specified by the
   roadmap row (which only names the 20s threshold). Chosen to bound reload storms without
   giving up too early on a webinar that's still recoverable; open to adjustment.

## Amendment (2026-09-25, T-024b C2/C10)

**Why:** T-024b's adoption (`qa/contracts/meeting-bot-live-capture.md`, ADOPTED 2026-09-25, binds
meeting-bot units from this date) requires this unit's C2/C10 evidence to be re-verified against
the adopted (not draft) criteria. A previous amendment builder had started this work and died
mid-edit; the uncommitted diff it left (`sb_join.py` +25/-4, `test_sb_join.py` +77) was reviewed
and found sound — kept and finished rather than discarded.

### 1. [C2] Cap holds across reloads

**What changed:**
- `packages/meeting-bot/py/sb_join.py:67-84` — extracted the inline click-eligibility check into a
  pure `click_gate(clicks, now, started, extra_click_until, last_click, no_click)` predicate, and
  the reload path's window-widening into a pure `apply_reload(clicks, now) -> (clicks,
  extra_click_until)`. `apply_reload` returns `clicks` **unchanged** — a reload widens *when*
  clicking is still allowed (`extra_click_until`), never *how many* clicks the whole run gets.
  `MAX_CLICKS = 8` (`sb_join.py:33`) stays the single run-long cap.
- `sb_join.py:240` (click-gate call site) and `sb_join.py:265` (reload call site) now call these
  two functions instead of the inline conditional / inline `extra_click_until = ...` assignment —
  behaviourally identical to what was already there (the prior code never reset `clicks` either;
  this makes that property explicit, named, and independently testable instead of implicit in an
  inline expression).
- `packages/meeting-bot/py/test_sb_join.py:14-22,141-211` — imports `CLICK_WINDOW_S`, `MAX_CLICKS`,
  `apply_reload`, `click_gate`; adds three tests:
  - `test_click_gate_exhausts_at_max_clicks_inside_initial_window` — 20 eligible ticks inside the
    initial window still stop at `MAX_CLICKS`.
  - `test_total_clicks_capped_across_multiple_reloads` — the amendment's required scenario: initial
    window exhausts the cap, then **3 separate reloads** each go through `apply_reload()` and each
    open a fresh widened window; asserts `total_click_events == MAX_CLICKS` across the whole run
    (tracked separately from `clicks` so a mutant that resets `clicks` per reload, which would still
    show `clicks == MAX_CLICKS` at the end of each window, is still caught on the cumulative count).
  - `test_apply_reload_widens_window_but_returns_clicks_unchanged` — direct unit test on the exact
    function `main()` calls on reload.

**How to verify:**
```bash
cd D:/KnowledgeBase-lanes/t-029-reconnect
python -m pytest packages/meeting-bot/py/test_sb_join.py -v
```

**Actual output:**
```
collected 17 items
... (14 pre-existing) ...
test_click_gate_exhausts_at_max_clicks_inside_initial_window PASSED
test_total_clicks_capped_across_multiple_reloads PASSED
test_apply_reload_widens_window_but_returns_clicks_unchanged PASSED
============================= 17 passed in 0.12s ==============================
```

**Falsification (D-020 safe: byte backup, `trap restore EXIT INT TERM ERR`, `timeout 60`, `cmp`
verify after restore) — single-hunk mutation of `apply_reload`'s return to `return 0, now +
CLICK_WINDOW_S` (resets the click budget on every reload):**
```
=== MUTATION applied: apply_reload resets clicks -> 0 each reload; FULL suite ===
collected 17 items
... (15 pre-existing + test_click_gate_exhausts_at_max_clicks_inside_initial_window PASSED) ...
test_total_clicks_capped_across_multiple_reloads FAILED
    AssertionError: C2: MAX_CLICKS must bound the WHOLE run's total click actions across reloads,
    not just the current window's counter value; got 32 total clicks after an exhausted initial
    window + 3 reloads (would be up to 32 if apply_reload() reset the counter on each reload)
    assert 32 == 8
test_apply_reload_widens_window_but_returns_clicks_unchanged FAILED
    AssertionError: assert 0 == 5
2 failed, 15 passed in 0.67s
[restore] OK: sb_join.py byte-identical to backup
mutant exit: 1 (expect non-zero = a test caught it)

=== FINAL: confirm working tree restored, tests green again ===
17 passed in 0.07s
```
`git diff --stat packages/meeting-bot/py/sb_join.py` immediately after: unchanged from the intended
edit (21 insertions, 4 deletions) — no mutation residue landed.

**Allowlist check (task item 4):** `JOIN_TEXTS` (`sb_join.py:24-28`) is untouched by this amendment
and contains none of `share`/`unmute`/`raise hand`/`allow`/`enable` as a standalone match.

### 2 & 3. [C10] Full no-regression set + python tests, from worktree root

Run from `D:/KnowledgeBase-lanes/t-029-reconnect` (this unit's worktree, base `784df67`):

```
$ pnpm -r typecheck
Scope: 10 of 11 workspace projects
packages/core typecheck: Done
apps/web typecheck: Done
packages/db typecheck: Done
packages/ai typecheck: Done
packages/ask typecheck: Done
packages/ingest typecheck: Done
packages/index typecheck: Done
packages/meeting-bot typecheck: Done
apps/api typecheck: Done
(exit 0, all Done, 0 errors)

$ pnpm -r test
packages/core   : tests 7   pass 7   fail 0
packages/db     : tests 14  pass 14  fail 0
packages/ai     : tests 74  pass 74  fail 0
packages/ask    : tests 50  pass 50  fail 0
packages/ingest : tests 97  pass 97  fail 0
packages/index  : tests 228 pass 228 fail 0
packages/meeting-bot : tests 88  pass 88  fail 0
apps/api        : tests 175 pass 175 fail 0
apps/web        : Done (no test script)
(exit 0)

$ pnpm gen:types --check
OK: 24 generated type file(s) + index.ts match schema/
(exit 0)

$ python schema/validate.py
PASS: 24 collection schema(s) validated correctly.
(exit 0)

$ python -m pytest packages/meeting-bot/py -q
17 passed in 0.10s
(exit 0)

$ pnpm lint:structure
lint-loc: OK (314 file(s) within budget)
lint-dirsize: OK (87 dir(s) within budget)
lint-root: FAIL — 1 violation(s)
  root has 16 loose files (budget 15): .dependency-cruiser.cjs .dockerignore .env.example
  .gitignore .gitmodules AGENTS.md ARCHITECTURE.md docker-compose.yml
  Living-Knowledge-Base-Architecture.html migrate-mongo-config.cjs package.json pnpm-lock.yaml
  pnpm-workspace.yaml structure.config.json TASKS.md tsconfig.base.json
(exit 1)
```

**The `lint:structure` FAIL is `ISS-248`** ("the runtime-created untracked AGENTS.md makes the
repository's structure gate fail in every Codex/Claude session" — status: open), and it is
reproduced identically on base commit `784df67`: a throwaway `git worktree add <scratch>/base-check
784df67 --detach` (outside `D:/KnowledgeBase`, per instructions), run there:

```
$ node scripts/lint-root.mjs
lint-root: FAIL — 1 violation(s)
  root has 16 loose files (budget 15): .dependency-cruiser.cjs .dockerignore .env.example
  .gitignore .gitmodules AGENTS.md ARCHITECTURE.md docker-compose.yml
  Living-Knowledge-Base-Architecture.html migrate-mongo-config.cjs package.json pnpm-lock.yaml
  pnpm-workspace.yaml structure.config.json TASKS.md tsconfig.base.json
(exit 1)
```
Identical file list and count — same pre-existing failure, not a regression from this unit. This
also matches the adopted contract's own C10 wording: "except a failure reproduced identically on
the unit's base commit, which must be named with its issue id in the manifest." The base worktree
was removed after the check (`git worktree remove --force`).

**Result: C10 clean except the named, reproduced, pre-existing ISS-248.**

## Capability coverage — added row (cross-reload click cap, C2)

| # | capability | the check that covers it | the falsifying edit | observed (pasted runner output) |
|---|---|---|---|---|
| 16 | `MAX_CLICKS` bounds total clicks across the WHOLE run, including across multiple reloads (not a fresh budget per reload) | `test_total_clicks_capped_across_multiple_reloads`, `test_apply_reload_widens_window_but_returns_clicks_unchanged` | single-hunk edit: `apply_reload` returns `0, now + CLICK_WINDOW_S` instead of `clicks, now + CLICK_WINDOW_S` | PASS before: `17 passed in 0.12s` (both tests green). FAIL after: `test_total_clicks_capped_across_multiple_reloads` → `assert 32 == 8`; `test_apply_reload_widens_window_but_returns_clicks_unchanged` → `assert 0 == 5`. Restored + `cmp`-verified byte-identical; `17 passed in 0.07s` after restore. |

## Live browser evidence (amendment)

Not UI-touching — the amendment's changed paths are `packages/meeting-bot/py/sb_join.py` (pure
function extraction, no new Selenium calls, no new selectors) and
`packages/meeting-bot/py/test_sb_join.py` (pure unit tests, no browser). The unit's original "Live
browser evidence" section above (offline headed-Chrome proof against a local fixture) is unchanged
and still stands; this amendment did not touch the reload/click behaviour observed there, only
extracted it into named, independently-tested functions.

Fix cycle: 0
Status: checked-PASS — qa/verdicts/t-029-reconnect.md (Cycle checked: 0, 9eb5307); merged to master; meeting-bot 94/94 + pytest 17/17 on merged tree; debt ISS-T-029-1 (low, live proof script uncommitted)

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree

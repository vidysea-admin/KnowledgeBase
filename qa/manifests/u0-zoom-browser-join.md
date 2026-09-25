# Manifest — u0-zoom-browser-join
**Contract:** qa/contracts/meeting-bot-live-capture.md (T-024b, ADOPTED 2026-09-25) — criteria C1
(real browser join), C2 (bounded/denylisted auto-click), C10 (no regression), C3 (per-process
capture, unchanged by this unit)
**Goal task:** none (`.goal/goal.json` phase-1 chain is HUMAN_GATEd at meeting-bot-phase-2-start
per commit 29696ea; this unit was dispatched directly by the orchestrator, not pulled from the
goal queue)
**Date:** 2026-09-25
**Fix cycle:** 0 of max 3
**Dual check:** no
**Issues addressed:** none (this unit found and filed ISS-U0-1, ISS-U0-2 — it did not close any
pre-existing issue)
**Executor:** claude-sonnet-subagent
**Executor rationale:** in-repo TS/Python edit + live browser probing against real Zoom
infrastructure; no external tool was better positioned than a Claude subagent with SeleniumBase
already wired into the repo.

## What changed

- `packages/meeting-bot/src/capture/record-commands.ts:47-61` — added `shouldAutoClick(platform)`,
  a pure exported function (`platform === "zoho" || platform === "zoom"`), replacing the inline
  `platform === "zoho"` literal at the `createObsBrowserDeps({ ... autoClick: ... })` call site
  (now line 116). Pulled out to a pure function so the zoom-selection decision is unit-testable
  without spinning up `runRecord`'s OBS/python side effects.
- `packages/meeting-bot/src/capture/record-commands.test.ts:19` — import `shouldAutoClick`.
- `packages/meeting-bot/src/capture/record-commands.test.ts:36-44` — new test:
  `shouldAutoClick: zoom and zoho get autoClick, everything else does not` (zoho baseline
  unchanged + zoom now `true`; webex/cloudonair/meet/teams/unknown stay `false`).
- `packages/meeting-bot/py/sb_join.py` — **no changes.** `JOIN_TEXTS` (line 24-28) already
  contained every real button text this live probe could verify (see "What was verified NOT
  needed" below); no URL-rewrite helper was needed either (Zoom's own client performs the
  `/w/<id>` → `app.zoom.us/wc/<id>/join` navigation itself, `tk` preserved, confirmed live).
- `packages/meeting-bot/py/test_sb_join.py:14-25` — import `JOIN_TEXTS`.
- `packages/meeting-bot/py/test_sb_join.py:239-264` — two new tests: C2's forbidden-standalone-word
  guarantee (`test_join_texts_never_contains_a_c2_forbidden_word_standalone`, checking
  `{"share","unmute","raise hand","allow","enable"}` against the lowercased set) and a pin on the
  real verified Zoom button text (`test_join_texts_contains_the_verified_zoom_web_client_button`,
  `"join from browser"`). **This C2 test did not exist before this unit** despite the contract's
  amendment log describing it as "verified as holding" — that was a manual read, never a
  regression test; this closes that gap.
- `qa/issues.u0.jsonl` — new lane ledger file (this is a worktree, per D-019): `ISS-U0-1` (Zoom's
  web-client UI lives in a same-origin iframe `sb_join.py` never traverses — high, coverage-class,
  filed not fixed) and `ISS-U0-2` (HUMAN_GATE — this specific webinar requires Zoom-account
  sign-in the bot doesn't have — high, blocks the stated GOAL, needs an Approver decision).
- `qa/evidence/u0-zoom-browser-join-2026-09-25/` — live evidence (see below).

## How to verify (commands + expected)

- `python -m pytest packages/meeting-bot/py -q` → expected: all pass, 22 (was 20 + 2 new)
- `pnpm --filter @lkb/meeting-bot test` → expected: all pass, 142 (was 141 + 1 new)
- `pnpm -r typecheck` → expected: clean, no errors
- `pnpm gen:types --check` → expected: `OK: ... match schema/`
- `python schema/validate.py` → expected: `PASS: 24 collection schema(s) validated correctly.`
- `pnpm lint:structure` → expected: FAILs at `lint-root` with the pre-existing 16-vs-15 loose-file
  count (ISS-248) — **not this unit's regression**; every other lint-structure sub-check passes.
- `pnpm -r test` (once) → expected: 787 pass, 0 fail across all 8 test-bearing workspaces

## Actual outputs (from maker's own run)

```
$ python -m pytest packages/meeting-bot/py -q
......................                                                   [100%]
22 passed in 0.11s

$ pnpm --filter @lkb/meeting-bot test
...
ℹ tests 142
ℹ pass 142
ℹ fail 0
[exited with code 0]

$ pnpm -r typecheck
Scope: 10 of 11 workspace projects
packages/core typecheck: Done
apps/web typecheck: Done
packages/db typecheck: Done
packages/ai typecheck: Done
packages/ask typecheck: Done
packages/ingest typecheck: Done
packages/index typecheck: Done
apps/api typecheck: Done
packages/meeting-bot typecheck: Done

$ pnpm gen:types --check
OK: 24 generated type file(s) + index.ts match schema/

$ python schema/validate.py
... (24 OK lines)
PASS: 24 collection schema(s) validated correctly.

$ pnpm lint:structure
lint-loc: OK (324 file(s) within budget)
lint-dirsize: OK (84 dir(s) within budget)
lint-root: FAIL — 1 violation(s)
  root has 16 loose files (budget 15): .dependency-cruiser.cjs .dockerignore .env.example
  .gitignore .gitmodules AGENTS.md ARCHITECTURE.md docker-compose.yml
  Living-Knowledge-Base-Architecture.html migrate-mongo-config.cjs package.json pnpm-lock.yaml
  pnpm-workspace.yaml structure.config.json TASKS.md tsconfig.base.json
 ELIFECYCLE  Command failed with exit code 1.
```
**ISS-248 confirmed pre-existing, not this unit's regression:** `AGENTS.md` is tracked in git
since commit `e31065a` (`git log --oneline -1 -- AGENTS.md`), and this unit touched no root file —
only `packages/meeting-bot/**` and `qa/**`. Same failure the contract's own amendment log
(2026-09-25 entry, "[C10] corrected") documents as pre-existing on master.

```
$ pnpm -r test    (once, full)
packages/core test:   tests 7   pass 7   fail 0
packages/db test:     tests 14  pass 14  fail 0
packages/ai test:     tests 74  pass 74  fail 0
packages/ask test:    tests 50  pass 50  fail 0
packages/index test:  tests 228 pass 228 fail 0
packages/ingest test: tests 97  pass 97  fail 0
apps/api test:        tests 175 pass 175 fail 0
packages/meeting-bot test: tests 142 pass 142 fail 0
[exit code 0]
```
Total: 787 pass, 0 fail. (apps/web and any worker package carry no `test` script — unchanged from
base, not this unit's scope.)

## Capability coverage (each new claim -> its isolating falsification)

| capability (one line) | the check that covers it | the falsifying edit | observed (pasted runner output) |
|---|---|---|---|
| `shouldAutoClick("zoom")` returns `true` — zoom joins now get sb_join.py's auto-click enabled, same as zoho | `record-commands.test.ts` test `shouldAutoClick: zoom and zoho get autoClick, everything else does not` | single-hunk edit to `record-commands.ts:61`: `return platform === "zoho" || platform === "zoom";` → `return platform === "zoho";` (D-020: byte backup + `cp`/`cmp` restore in a `trap`, never `git checkout --`) | PASS before: `✔ shouldAutoClick: zoom and zoho get autoClick, everything else does not (0.2745ms)`. FAIL after: `✖ shouldAutoClick: zoom and zoho get autoClick, everything else does not (3.6658ms)`. Restore verified: `RESTORE: OK (cmp verified byte-identical)`, then re-run PASSed again: `✔ shouldAutoClick: zoom and zoho get autoClick, everything else does not (0.2745ms)`. |
| `JOIN_TEXTS` never contains a C2-forbidden standalone word (`share`/`unmute`/`raise hand`/`allow`/`enable`) — the guarantee the contract's C2 depends on, now enforced by a real test for the first time | `test_sb_join.py::test_join_texts_never_contains_a_c2_forbidden_word_standalone` | single-hunk edit to `sb_join.py:27`: append `"allow"` to the `JOIN_TEXTS` list (the exact class of edit C2 forbids) | PASS before: `22 passed in 0.11s` (test present and green). FAIL after: `FAILED packages/meeting-bot/py/test_sb_join.py::test_join_texts_never_contains_a_c2_forbidden_word_standalone` / `1 failed, 21 passed in 0.51s`. Restore verified: `RESTORE: OK (cmp verified byte-identical)`, then re-run: `22 passed in 0.11s`. |

No new JOIN_TEXTS entries or URL-rewrite function were added (see "What changed" and "What was
verified NOT needed" below), so there is nothing further to falsify for those — the existing
`JOIN_TEXTS` entries were already covered by this repo's pre-existing content (no coverage claim
made for them here beyond the two rows above).

## Live browser evidence (D-024)

`qa/evidence/u0-zoom-browser-join-2026-09-25/`:

- `sb_join_live_events.jsonl` — the **canonical evidence**: the real, edited
  `packages/meeting-bot/py/sb_join.py`, run directly (autoClick behavior as production would run
  it — no `--no-click`), against the REAL Ashoka Educator Dialogues Zoom join URL from
  `raw/webinars/2026-09-27-ashoka-join-url.txt`, on the bot's own persistent profile
  (`data/bot-profile/`), stopped cleanly via `--stop-file` after ~45s. `tk`/`uuid`/`_x_zm_rtaid`
  redacted before saving. Event sequence, **zero human clicks**:
  1. `starting`
  2. `opened` — the `/w/95194691654` landing page
  3. `clicked text="join from browser"` — the bot's own `CLICK_JS` found and clicked this button
     autonomously
  4. `heartbeat` — now at `app.zoom.us/wc/95194691654/join` (Zoom's own web-client URL — no code
     rewrote it; Zoom's client performed the navigation itself)
  5. `closed` — clean exit on the stop-file sentinel, no error
- `01-landing-page-join-buttons.png` — the `/w/95194691654` landing page, confirming the exact
  real button text `"join from browser"` (already in `JOIN_TEXTS`).
- `02-after-autonomous-click-top-frame.png` — immediately after the autonomous click, top document
  at `app.zoom.us/wc/95194691654/join`.
- `03-web-client-iframe-sign-in-required.png` — the actual web-client content (renders inside a
  same-origin `<iframe>`, `src` identical to the top URL): **"Sign in to join this meeting — The
  host requires participants to be signed in with a Zoom account."**

These three screenshots were captured by short-lived companion read-only scripts driving the SAME
real page/profile/URL immediately around the canonical `sb_join_live_events.jsonl` run, since
`sb_join.py` itself is JSON-events-only by design (no screenshot capability) — satisfying the
task's "a screenshot **or** the page's visible text" with both.

**What screen the live probe reached:** the bot autonomously navigated from the `/w/<id>` landing
page into Zoom's own web client (`app.zoom.us/wc/<id>/join`) with zero human intervention — that
much of the stated GOAL is proven. It could not reach "waiting for host / webinar has not started"
because **this specific webinar requires Zoom-account sign-in to join** (see HUMAN_GATE below),
which blocks every join path (bot or human-without-credentials) regardless of any code in this
package.

**Probe cleanup:** no `raw/webinars/` or `data/` artifact was created by this probe (running
`sb_join.py` directly, not the full `record` CLI, so no OBS/no `source.json` registration
happened) — only the `data/bot-profile/.stop-u0-probe` stop-file sentinel was created, and it was
deleted after the run. `git status --porcelain -- data/ raw/` is clean.

## HUMAN_GATE — raised, not resolved

**This webinar requires an authenticated Zoom account to join** ("The host requires participants
to be signed in with a Zoom account"). The bot's persistent profile is not signed into any Zoom
account (`zoom.us/profile` → redirects to `zoom.us/signin#/login`), and no Zoom credential exists
anywhere in this repo (`.env`, code, docs — grepped `zoom_email`/`zoom_password`/`zoom_account`,
zero hits). **No credential was fabricated or guessed.** This is a decision only Umesh (Approver)
can make: (a) sign the bot's Chrome profile into a Zoom account matching or acceptable to the
approved registration, and say where that credential should live, or (b) ask the Ashoka host to
relax "require sign-in" for this webinar's registrants. Filed as `ISS-U0-2` (high,
`qa/issues.u0.jsonl`). Until resolved, the stated GOAL (a real recording of the 2026-09-27
09:00-12:00 IST webinar) cannot be delivered by this or any code change alone.

Separately, `ISS-U0-1` (high, coverage-class, filed not fixed): Zoom's own web-client UI beyond
the landing page renders inside a same-origin iframe that `sb_join.py`'s click/body-text logic
does not yet traverse — this would block progress even after ISS-U0-2 is resolved, and needs its
own live-verified fix once a signed-in session is reachable to test against.

## What was verified NOT needed

- **No URL-rewrite function**: confirmed live (`sb_join_live_events.jsonl` `heartbeat` event) that
  Zoom's own "Join from browser" button already navigates `/w/<id>` → `app.zoom.us/wc/<id>/join`
  with `tk` preserved. A hand-rolled rewrite would be redundant and riskier than trusting Zoom's
  own client.
- **No new `JOIN_TEXTS` entries**: every task-suggested candidate except `"launch meeting"` was
  already present (`"join from browser"`, `"join"`, `"join audio"`, `"join with computer audio"`,
  `"computer audio"`). `"launch meeting"` was **not** added — no such button appeared anywhere in
  this real flow (the `/w/` page shows "Join meeting" as a header, not a button, plus "Join from
  Zoom Workplace app" / "Join from browser"); adding an unverified string would violate this
  task's own "verify against the REAL page, not memory" instruction.

## Status: ready-for-check

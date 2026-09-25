# Verdict — u0-zoom-browser-join
**Cycle checked:** 0
**Date:** 2026-09-25
**Checker:** fresh Claude subagent (Mode A), bound to `D:/KnowledgeBase-lanes/u0-zoom-browser-join` (branch wave/u0-zoom-browser-join, HEAD 1a64dac)
**Contract:** qa/contracts/meeting-bot-live-capture.md (T-024b, ADOPTED 2026-09-25) — C1, C2, C10 graded; C3 unchanged/carryover

## What I re-ran (all commands executed by me, not pasted)

- `python -m pytest packages/meeting-bot/py -q` → **22 passed** (matches manifest)
- `pnpm --filter @lkb/meeting-bot test` → **142/142 pass, 0 fail** (matches manifest)
- `pnpm -r typecheck` → clean, all 9 typechecked workspaces "Done" (matches manifest)
- `pnpm gen:types --check` → `OK: 24 generated type file(s) + index.ts match schema/` (matches)
- `python schema/validate.py` → `PASS: 24 collection schema(s) validated correctly.` (matches)
- `pnpm lint:structure` → FAILs only at `lint-root` (16 vs 15 loose-file budget) — matches manifest's claimed pre-existing failure (ISS-248). **Independently verified on base**: built a detached `git worktree add` at commit `29696ea` (the unit's stated base) in scratch, symlinked `node_modules`, ran `node scripts/lint-root.mjs` there — **identical failure, byte-identical file list**, confirming this is not the unit's regression. Worktree removed afterward.
- `pnpm -r test` (once, full) → **exit code 0** across all 8 test-bearing workspaces (787 pass, 0 fail per manifest's own breakdown; my run's per-package output was truncated by my own `tail`, but the aggregate exit code is authoritative per this repo's own exit-code-over-grep rule, feedback-inbox 2026-09-08).

All re-runs match the manifest's claims. No regression beyond the pre-existing, independently-reproduced ISS-248.

## Capability coverage — both rows independently reproduced in throwaway copies (never the bound tree)

1. **`shouldAutoClick("zoom")` → `true`** (`record-commands.test.ts`): reproduced in a **detached `git worktree add` copy** at scratch (outside the bound root), with `node_modules` symlinked in read-only from the bound tree for dependency resolution only (the file under test itself is the copy's own file, never resolved through the symlink). GREEN before (6/6, including the target test) → applied the exact single-hunk edit named in the manifest (`return platform === "zoho" || platform === "zoom";` → `return platform === "zoho";`) → **RED after**, and the failing assertion is exactly the named one (`shouldAutoClick: zoom and zoho...`, `false !== true`, the other 5 tests stayed green) → restored via backup+`cmp`, byte-identical → GREEN again. Copy fully deleted afterward; **the bound tree's real `node_modules` was verified intact and untouched** throughout (checked `node_modules/tsx`, `packages/meeting-bot/node_modules/@lkb` before and after).
2. **`JOIN_TEXTS` never contains a C2-forbidden standalone word** (`test_sb_join.py`): reproduced in a plain file copy of `packages/meeting-bot/py/` at scratch. GREEN before (22/22) → applied the exact single-hunk edit named in the manifest (appended `"allow"` to `JOIN_TEXTS`) → **RED after**, exactly the named test failed with the exact assertion message (`C2 violation: ... {'allow'}`) → restored, `cmp` byte-identical → GREEN again (22/22).

**CAPABILITY-COVERAGE: 2/2 rows reproduced.**

## Diff scope (step 4c)

`git diff 29696ea..HEAD --stat` and full diff reviewed. Touches exactly the files the manifest's "What changed" names: `packages/meeting-bot/py/test_sb_join.py`, `packages/meeting-bot/src/capture/record-commands.{ts,test.ts}`, `qa/issues.u0.jsonl` (new), `qa/manifests/u0-zoom-browser-join.md` (new), `qa/evidence/u0-zoom-browser-join-2026-09-25/**` (new). No existing function, test, export, or config key was deleted or renamed. `sb_join.py` itself is confirmed unchanged (0 diff lines) — matches the manifest's explicit claim. Clean.

## Credential handling (never-capped class — checked carefully)

Grepped the whole lane for `tk=` and for the unredacted join URL: the only hits are in the committed `sb_join_live_events.jsonl`, and every one carries `tk=<redacted>` (also `uuid=<redacted>`, `_x_zm_rtaid=<redacted>`) — no raw token value found anywhere in tracked files. `data/bot-profile/` and `raw/webinars/` are both `.gitignore`d and confirmed untracked (`git ls-files raw/webinars/` empty). **No credential leak found.**

## JOIN_TEXTS / MAX_CLICKS (contract C2)

Read `sb_join.py` directly: `JOIN_TEXTS` contains no forbidden standalone word (`share`/`unmute`/`raise hand`/`allow`/`enable`) — confirmed by inspection, not just the test. `MAX_CLICKS = 8`, `CLICK_WINDOW_S = 900` (15 min). For Zoom's observed multi-step flow (join-from-browser → iframe Join → Join Audio ≈ 3 clicks), 8 is ample margin — **not exhausted** under the flow observed so far. Noted, not fixed: since `sb_join.py` doesn't yet traverse the iframe (ISS-U0-1), the real click count *inside* the iframe once that's implemented is unverified — worth re-checking when ISS-U0-1 is fixed and a signed-in session is reachable.

## Due-diligence check not asked for but worth recording

`packages/meeting-bot/src/strategy.ts`'s `selectJoinStrategy` routes `zoom` to `"vexa"`, not `"browser"` — at first read this looked like it could make `shouldAutoClick("zoom")` dead code in the production `record` CLI path. Checked `runRecord` (`record-commands.ts:96-98`): it only `console.warn`s when `selectJoinStrategy(platform) === "vexa"` ("no Vexa is deployed — using the local browser bot") and **always** falls through to `createObsBrowserDeps`/`createBrowserJoiner` regardless of the strategy result. So `shouldAutoClick` genuinely is exercised for a real `lkb record <zoom-url>` today. Not a finding — recorded so a future reader doesn't have to re-derive it.

## Scope honesty (judgment call, per dispatch item 3)

The manifest's stated unit goal ("enable ... auto-click for Zoom so a ... webinar link joins with no human click") is **not** fully delivered end-to-end — real join is blocked by ISS-U0-1 (iframe not traversed) and ISS-U0-2 (this webinar requires Zoom sign-in, HUMAN_GATE). I judge this as **correctly scoped, not overclaimed**: the manifest states plainly, in its own "What screen the live probe reached" and "HUMAN_GATE" sections, that the full goal is not reached and names exactly what's missing and why, rather than asserting completion. The capability actually claimed — `shouldAutoClick` toggled on for zoom, exercised live to autonomously advance one real navigation step with zero human clicks, with a real regression test added for the first time — is narrowly stated and fully evidenced. Both open issues are high-severity and correctly filed rather than buried. This is a first slice with enumerated debt, not a false "done."

## Live-browser (Mode D / D-024)

`LIVE-BROWSER: not-applicable` — the changed paths (`packages/meeting-bot/src/capture/record-commands.ts`, `py/test_sb_join.py`) are a backend bot-automation surface, not a web UI this session renders; per dispatch instruction, my own browser run was not required. I instead judged the **committed** live-probe evidence (`qa/evidence/u0-zoom-browser-join-2026-09-25/`): the events sequence (`starting → opened → clicked "join from browser" → heartbeat at app.zoom.us/wc/.../join → closed`) is internally consistent and consistent with screenshots 01 and 03. **One finding**: screenshots `02-after-autonomous-click-top-frame.png` and `03-web-client-iframe-sign-in-required.png` are **byte-identical** (verified via `md5sum`/`cmp`, same hash `e2b5e6452b...`), despite being captioned as two different DOM-state captures. This means ISS-U0-1's own specific claim ("the top document has exactly ONE element, 'Back'") has no distinct supporting screenshot as depicted — filed as **ISS-U0-3** (medium, evidence-integrity). It does not change any graded criterion here: the JSONL event log (the manifest's own stated "canonical evidence") and screenshot 03 remain accurate and sufficient for D-024's "screenshot or visible text" requirement.

## Verdict

```
VERDICT: PASS
SCOREBOARD: 3/3 criteria met (C1 carryover/corroborated, C2 met + newly tested, C10 met), 0/0 invariants (none graded here)
FAILURES (if any): none
CAPABILITY-COVERAGE: 2/2 rows reproduced
LIVE-BROWSER: not-applicable (packages/meeting-bot/** backend automation, no web UI surface) — committed evidence in qa/evidence/u0-zoom-browser-join-2026-09-25/ reviewed; see ISS-U0-3 for one evidence-integrity finding (does not affect graded criteria)
ISSUES-WRITTEN: ISS-U0-3 (medium, evidence-integrity — screenshots 02/03 byte-identical despite different captions)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: All manifest verify commands re-run independently and matched, including an independent base-commit reproduction of the pre-existing ISS-248 lint-root failure. Both capability-coverage rows falsified and restored cleanly in throwaway copies outside the bound tree (git-worktree copy for the TS row, plain-file copy for the Python row), with the bound tree's node_modules verified untouched. No credential leak (tk/uuid tokens redacted everywhere committed). Diff scope matches "What changed" exactly, no deletions. ISS-U0-1 and ISS-U0-2 are correctly filed as open debt rather than hidden — scope honesty holds. One new finding (ISS-U0-3, medium): two evidence screenshots are byte-identical despite differing captions, so one open issue's (ISS-U0-1) specific DOM-state claim lacks its own distinct screenshot proof — does not affect this unit's graded criteria.
```

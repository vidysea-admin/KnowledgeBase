# Verdict — t-029-reconnect

**Date:** 2026-09-25
**Cycle checked:** 0
**Checker:** fresh Claude Sonnet subagent (Mode A), bound to `D:/KnowledgeBase-lanes/t-029-reconnect` (branch `wave/t-029-reconnect`, HEAD `2433b5e`)
**Contract:** `D:/KnowledgeBase/qa/contracts/meeting-bot-live-capture.md` (T-024b, master copy, ADOPTED 2026-09-25) — read-only outside the bound root, as instructed.
**Base commit for diff scope:** `784df67` (confirmed via `git merge-base master wave/t-029-reconnect`)

## What I re-ran myself (never trusted pasted output)

- `python -m pytest packages/meeting-bot/py/test_sb_join.py -v` → **17 passed** (matches manifest exactly, same 17 test names).
- `pnpm --filter @lkb/meeting-bot test` → **88/88 pass** (matches manifest exactly, including the 6 new `reconnect-gaps.test.ts` cases and the untouched controller-state/watchdog/joiners/platform/user-profile/strategy suites).
- `pnpm -r typecheck` → all 10 workspace projects `Done`, 0 errors.
- `pnpm -r test` → 8 packages, all green (core 7, db 14, ai 74, ask 50, ingest 97, index 228, meeting-bot 88, api 175 — matches manifest counts exactly).
- `pnpm gen:types --check` → OK, 24 generated type files match schema.
- `python schema/validate.py` → PASS, 24/24 collection schemas.
- `pnpm lint:structure` → FAIL at `lint-root` only (16 loose root files vs budget 15), same file list as manifest claims.

**Independent ISS-248 reproduction (not trusted from the manifest):** built a throwaway `git worktree add <scratch>/base-check-784df67 784df67 --detach` from the **main repo** (outside the bound root, removed after use — never touched the bound tree), ran `node scripts/lint-root.mjs` there directly (no `pnpm install` needed — the script only reads root filenames). Result: **identical FAIL, identical 16-file list, identical count**, confirming this is genuinely pre-existing on the base commit and not introduced by this unit. `git worktree remove --force` cleaned it up afterward; `git worktree list` confirms it is gone.

## Criterion-by-criterion (contract `meeting-bot-live-capture.md`, master/ADOPTED copy)

- **[C1] Real browser join — NOT regressed.** `kill_orphans`, the `--deny-permission-prompts` Chromium args, and the title-pinning block (`sb_join.py:236-238`, runs every ~2s loop tick) are untouched by the diff (confirmed by reading `git diff 784df67..HEAD -- packages/meeting-bot/py/sb_join.py` — the two hunks touch only the new constants/functions block and the main-loop body around the click-gate/reconnect insertion). The `while not os.path.exists(a.stop_file)` exit condition is unchanged; the only addition after loop-exit is `final_gap = reconnect.close_at_end(...)` before the existing `emit("closed")` — a clean-exit addition, not a break. **Holds.**
- **[C2] Bounded, denylisted auto-click, cap across reloads — MET, evidenced by my own falsification.** Re-derived the allowlist check myself: `JOIN_TEXTS` (`sb_join.py:24-28`) is untouched by this diff and contains none of `share`/`unmute`/`raise hand`/`allow`/`enable` as a standalone match. `MAX_CLICKS = 8` is the one run-long cap; `apply_reload()` widens only `extra_click_until`, never `clicks`. **I personally reproduced the row-16 falsification** in a throwaway copy (see Capability coverage below) — mutating `apply_reload` to return `0, now + CLICK_WINDOW_S` instead of `clicks, now + CLICK_WINDOW_S` turns exactly the two named tests red with exactly the manifest's claimed assertion values (`32 == 8`, `0 == 5`), and restoring gives 17/17 green again, byte-identical file confirmed via `cmp`.
- **[C10] No regression — MET**, per the full re-run above plus my own independent ISS-248 reproduction on the base commit. `git diff 784df67..HEAD --stat` touches only `packages/meeting-bot/py/sb_join.py`, `packages/meeting-bot/py/test_sb_join.py`, `packages/meeting-bot/src/capture/reconnect-gaps.ts` (new), `packages/meeting-bot/src/capture/reconnect-gaps.test.ts` (new), `packages/meeting-bot/src/capture/record-commands.ts`, and `qa/manifests/t-029-reconnect.md` — every one of those is named in the manifest's "What changed". No existing function, export, test, or config key was deleted or renamed (read the full diff, not just the stat).
- **[C3]-[C9]** — not touched by this diff (`obs-windows.ts`, `sync-session.mjs`, the silence-gate threshold logic, credential handling) are untouched; `finalizeRecording`'s signature gained one optional trailing `gaps` parameter defaulting to `[]`, which is additive and does not alter any of C3-C9's behaviour. **Not in scope for this unit**, correctly not claimed by the manifest.

## Roadmap done-when ("a forced network drop mid-run is recovered without a human, and the gap is logged")

**Mechanism verified, at the unit level, by me:** `detect_trouble` + `ReconnectState.tick` drive the reload (re-uses the same `uc_open_with_reconnect` join call), and every gap — recovered mid-run or still open at `--stop-file`/browser-death — is emitted as a `{"event":"gap",...}` JSON line. On the controller side, `record-commands.ts`'s `runRecord` collects those via `collectGapEvent` inside the existing `onEvent` callback and `finalizeRecording` writes `gaps: gapsForSourceDoc(gaps)` into `source.json` — I read this wiring directly (not just the manifest's description) and confirm `runFinalize` (the T-047 recovery path) intentionally gets `gaps: []`, which the manifest discloses as a scope boundary, not a defect — there is genuinely no live event stream to draw gaps from once the controller process has died.

**Live-proof caveat (see ISS-T-029-1, filed below):** the manifest's row-15 end-to-end live-Chrome proof (`offline_proof.py`) is real prose evidence with a plausible, internally-consistent result, but the script itself was never committed — `git show HEAD --stat | grep -i offline_proof` finds nothing. Per my dispatch I did not (and should not) re-run a live Chrome session against this. I am treating row 15 as **UNVERIFIED-by-checker** rather than silently accepting it, and filed the gap so a future checker/maker knows the live proof is not repo-reproducible. The manifest is honest about the underlying limitation too (Known gaps #1: this is a simulated banner, not a real network cut) — this is a reproducibility gap in the evidence trail, not a misrepresentation of what was tested.

## Capability coverage — what I actually reproduced myself

Built ONE throwaway copy of `packages/meeting-bot/py/` (the only directory these rows depend on — no monorepo-wide install needed) at `<scratch>/t029-copy`, outside the bound root, confirmed **green before each edit** (17/17), applied each single-hunk edit to the one file named in "What changed" (`sb_join.py`), confirmed **red after** with the manifest's own named assertion, then restored from a byte backup and `cmp`-verified byte-identical before the next mutation. Deleted the scratch copy when done. The bound tree (`D:/KnowledgeBase-lanes/t-029-reconnect`) was never edited.

| Row | What I falsified | Result |
|---|---|---|
| 16 | `apply_reload` returns `0, now + CLICK_WINDOW_S` instead of `clicks, ...` | RED exactly as claimed: `test_total_clicks_capped_across_multiple_reloads` → `assert 32 == 8`; `test_apply_reload_widens_window_but_returns_clicks_unchanged` → `assert 0 == 5`. Restored, 17/17 green, `cmp` clean. |
| 7 | Recovery-branch `"recovered": True` → `"recovered": False` | RED exactly as claimed: only `test_tick_recovery_closes_a_gap_with_correct_fields` fails, on the named field. Restored, 17/17 green. |
| 1-3 | `RECONNECT_THRESHOLD_S 20 → 5` | RED exactly as claimed: `test_reconnect_threshold_constant_is_20s_per_roadmap` (`5==20`) and `test_tick_stays_wait_under_threshold` (`'reload' != 'wait'`) fail; nothing else does. Restored, `cmp` clean. |

The remaining Python rows (4,5,6,8-11) and the TS rows (12-14) were **re-run (not re-falsified in an isolated copy)** — full-suite reruns above reproduce every test name and pass/fail count the manifest claims, and I read the underlying implementation directly (`ReconnectState.tick`/`close_at_end`, `gapsForSourceDoc`/`collectGapEvent`) to confirm the code shape matches what each test asserts; I did not stand up an isolated pnpm-workspace copy for the TS rows (that needs the monorepo's pnpm symlink store, which is materially more expensive to reproduce safely than the self-contained Python directory) — noting this honestly rather than silently claiming full mutation coverage. Row 15 is UNVERIFIED-by-checker (see above, ISS-T-029-1).

## Diff scope (step 4c)

`git diff 784df67..HEAD --stat`: `sb_join.py` (+139/-4… net additive), `test_sb_join.py` (+216, new tests only), `reconnect-gaps.ts` (new, 47 lines), `reconnect-gaps.test.ts` (new, 54 lines), `record-commands.ts` (+6/-1, additive wiring), `qa/manifests/t-029-reconnect.md` (new). Read the full diff, not just the stat: **no existing function, export, test, or config key was deleted or renamed**; every touched file is named in the manifest's "What changed". Clean.

## UI surface (D-024)

Changed paths: `packages/meeting-bot/py/**` (Python backend bot script) and `packages/meeting-bot/src/capture/*.ts` (backend capture/controller logic). No `apps/web/**` or any browser-rendered file is touched. **Mode D does not apply** — this is backend/controller-only work, not a UI change, direct or indirect (no retrieval/ranking/rendering path is touched).

## Issues addressed

Manifest claims no `Issues addressed`. Checked the ledger for anything else naming T-029/reconnect: nothing outstanding predates this unit. No re-open needed.

```
VERDICT: PASS
SCOREBOARD: 3/3 in-scope criteria met (C1 not regressed, C2 met, C10 met; C3-C9 correctly out of scope for this diff), 0/0 invariants in scope
FAILURES (if any):
- none at >80% confidence
CAPABILITY-COVERAGE: 5/16 rows independently falsified by checker (rows 1-3, 7, 16); 10/16 re-verified via full-suite rerun + direct code read (not isolated-copy falsified); 1/16 UNVERIFIED-by-checker (row 15, issue: ISS-T-029-1)
LIVE-BROWSER: not-applicable (changed paths: packages/meeting-bot/py/sb_join.py, packages/meeting-bot/py/test_sb_join.py, packages/meeting-bot/src/capture/reconnect-gaps.ts, packages/meeting-bot/src/capture/reconnect-gaps.test.ts, packages/meeting-bot/src/capture/record-commands.ts — no UI surface)
ISSUES-WRITTEN: ISS-T-029-1
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: C2's cross-reload click cap and C10's no-regression suite both re-ran green under my own re-execution, including an independent reproduction of the pre-existing ISS-248 lint-root failure on the base commit from a throwaway worktree I built and removed myself. C1's title-pinning/stop-file/orphan-kill paths are untouched by the diff. The roadmap done-when's mechanism (detect -> reload+rejoin -> gap logged to source.json) is wired correctly end to end at the code level and unit-tested; the one live, real-Chrome proof of that mechanism was never committed to the repo, so I filed it as low-severity debt (ISS-T-029-1) rather than accepting it on prose alone or re-running a live bot myself, which this dispatch forbade.
```

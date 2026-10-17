# budgetmb-meeting-bot-loc-split

**Handshake status:** checked-PASS
Fix cycle: 0
Tier: roadmap/CI (ISS-CIFIX-001 loc violations in packages/meeting-bot; Umesh chose REFACTOR over raising budgets). Class: PURE REFACTOR of security-sensitive code (registration, CDP, loopback guard, owned-profile cleanup): FULL ceremony. Verdict by the checker only.
Lane: lane/budgetmb (branch from 364cb094). No ledger rows changed; no new issues.

## Scope
Split four files over the 300 non-blank-line budget with no behaviour change and no test expectation change:
- `py/sb_join.py` 1191 -> 123 (thin entry point + `main()` skeleton; every previously top-level name is still importable from `sb_join`)
- `py/registration_cdp.py` 305 -> 229
- `src/calendar/schedule-tick.ts` 321 -> 167
- `src/calendar/state/schedule-state.ts` 360 -> 212

## Files (new, all moved verbatim)
Python (`packages/meeting-bot/py/`): `sb_join_profile.py` (69), `sb_join_detect.py` (112: phrases, click_gate, ReconnectState), `sb_join_scripts.py` (131: CLICK_JS/BODY_TEXT_JS), `sb_join_ownership.py` (288: kill_orphans), `sb_join_register.py` (153: REGISTRATION_JS, register_form), `sb_join_cli.py` (79: parse_args, load_registration, managed_driver), `sb_join_recorder.py` (198: recorder-extension ownership proof + policy install), `sb_join_loop.py` (102: the hold-the-window loop), `registration_cdp_page.py` (79: PageCdp, connect_page_cdp, LOOPBACK_ADDRESS).
TS (`packages/meeting-bot/src/calendar/`): `schedule-loaders.ts` (HTTP candidate/calendar loaders, discovery health), `state/schedule-dedup-state.ts` (dedup state + scheduled-job files). Both re-exported from the original module, so every importer is unchanged.

## How behaviour was preserved (what a checker should look at)
1. Line-multiset check: every non-blank original `sb_join.py` line (stripped) occurs in the new files; the only original line absent is `deadline = time.monotonic() + 15`; added lines are imports, defs, docstrings and the glue listed below.
2. Tests patch module globals on `sb_join` (`sb_join.kill_orphans`, `.SB`, `._bootstrap_progress`, `.register_form`, `.time`, `.os`). So `main()` stays in `sb_join.py` and still resolves those names there; `kill_orphans` is a 2-line wrapper in `sb_join` that hands its own (patchable) `os`/`time` to `sb_join_ownership.kill_orphans(..., *, os, time)`; the recorder context manager and the loop take `os`/`time`(/`emit`) keyword parameters, which main passes from its own globals. Moved bodies are byte-identical and simply see those parameters.
3. `main()` glue (the only non-verbatim parts): `parse_args()`, `load_registration(a)`, `managed_driver(a, emit)` replace the inlined blocks; the `try: ... finally:` around the recorder/registration section became `with recorder_link(...) as link:` (a `contextlib.contextmanager` generator whose `try/finally` is the original one, `yield` after the policy install). `deadline = time.monotonic() + 15` in the capture-invoke branch became `link.arm(15)`, which rebinds the generator's `deadline` closure variable with the same single `time.monotonic()` call. `policy_check, command, extension_id` are read from `link`. The `emit("registration-result", **register_form(...))` line is unchanged and at the same indent (the instrumented-main test string-replaces it).
4. TS: schedule-state keeps the webinar-operation code (incl. the status literal `send-now.test.ts` drift-guards by reading the file); schedule-tick's `loadWebinarSourcesWithHealth` parameter type `Pick<ScheduleTickDeps, ...>` became the structurally identical `WebinarSourceLoaders` (avoids a module cycle).

## Test-file change (one, unavoidable)
`py/test_sb_join_ownership.py::test_registration_native_same_host_other_port_confinement` copies `sb_join.py` (instrumented) plus `registration_cdp.py` into a temp dir and runs it as a script, so the new sibling modules must be copied too. The single line copying `registration_cdp.py` now copies every `registration_cdp*.py` / `sb_join_*.py` module. No assertion or expectation changed. cifix3's two meeting-bot test files were not touched.

## Evidence
Python (`.venv` python, `pytest packages/meeting-bot/py`, real Chrome, D-146):
```
before (main tree 364cb094): 4 failed, 296 passed  (300)  -- 4x test_registration_native_same_host_other_port_confinement (real-Chrome subprocess; driver-bringup > 55 s under load)
after  (lane):               2 failed, 298 passed  (300)  -- same test only
real-Chrome subset (-k native_same_host, 7 cases) alone: before 5 pass / 2 fail (native308, resource: "Cannot inspect owned Job"); after 5 pass / 2 fail (native308, positive-alias: same message)
```
The failures are load flakes in the same real-Chrome test on both trees (different cases fail run to run); every one of the 7 cases passed at least once on the lane, including wrong-action/wrong-page/native307/resource/positive. `Cannot inspect owned Job` is raised by the unchanged cleanup code when the 15 s replay window expires under the concurrent hei-sweep load. Not a regression, not fixed here.
TS (`node --test --import tsx "src/**/*.test.ts" "py/tab-capture/*.test.mjs"` from packages/meeting-bot):
```
before: tests 851 pass 840 fail 9 skipped 1
after:  tests 851 pass 840 fail 9 skipped 1
```
Same 7 known failures in both (4x obs-windows ISS-324, WebM remux, interrupted recovery, owned status gaps; Windows/ffmpeg/cwd). The remaining two differ by environment only: before `shouldAutoClick forwards Meet join permission...` (19 s timing flake; passes 2/2 alone on the lane), after `actual login/tab/OBS spawn interfaces...` (cwd: it resolves `packages/meeting-bot/py/...` from the package dir; cifix3's lane; passes at the repo root, 2/2). `registration actual child timeout performs exact owned-profile cleanup` (real Chrome via the split sb_join, from joiners.test.ts) passes on the lane with an absolute python path (the lane has no .venv): 23.8 s.
`tsc --noEmit -p packages/meeting-bot`: clean. After the schedule-state re-split: send-now, schedule-tick, state, alert-who, join-rules suites 263/263.
`node scripts/lint-loc.mjs`: meeting-bot has 0 violations; the 8 remaining are outside this lane (index, ingest, api, scripts). `--all`: dependency-cruiser on packages/meeting-bot clean; no new dirsize/dupes/dependency entries from these files.

## Not verified
Only real-Chrome paths the existing tests reach. `--capture-extension` live recording and OBS were not run. Orphan Chrome from timed-out fixture runs: none left running at the end.

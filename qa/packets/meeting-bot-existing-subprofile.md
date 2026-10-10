# meeting-bot-existing-subprofile — cycle 1 checker packet

Authorized T-051 runtime blocker, tier 3 (next unblocked roadmap task), auth class uncapped. Scope is an optional existing Chrome subprofile selector for product login and tab/OBS capture. Maker skill: `skills/maker/SKILL.md`. No filed issue corpus is claimed.

## Ground truth and immutable candidate

Contract: `qa/contracts/meeting-bot-existing-subprofile.md`, C1–C6, SHA256 `cc4e0bc36fa82078484cef9aff16de706d49506537c54480fbc788a0bb09c776`.

All paths below are under `C:/Users/product/Desktop/KnowledgeBase`.

- Inventory: `.cache/coordination/meeting-bot-existing-subprofile-cycle-2/inventory.json`, SHA256 `a263a3d7f420c04cf0e23f82596f07e4dbe2d0bb6f9788a4e9d8d0f00d3152bd`. It records every exact source/test/doc candidate hash and original hash; three new files have no base.
- Full changed logic and adjacent context: `.cache/coordination/meeting-bot-existing-subprofile-cycle-2/candidate.patch`, SHA256 `cabb4fda736b2f49cb85032a1d15a1f32d1ca0afbc0fc104e1ff4c26d2b59041`.
- Original byte copies: `.cache/coordination/meeting-bot-existing-subprofile-cycle-1/base/` and `base-pins.json`. All five original copies match the captured starting hashes. No Git state is used or changed.

## Exact eight-file source allowlist and interfaces

| Path | Changed seam / immediate consumer |
| --- | --- |
| `packages/meeting-bot/src/capture/browser-profile.ts` (new) | `browserProfileArgs` validates one safe basename, existing physical parent/subprofile/Preferences and canonical realpaths before effects. `selectedBrowserProfile` resolves CLI over environment and rejects missing/duplicate arguments. |
| `packages/meeting-bot/src/capture/record-commands.ts` | `runLogin` loads existing environment then validates, carries selector to actual Python args, retains unconditional `--no-click`; flag-first login uses the normal accounts URL. `runRecord` validates before backend/control creation and passes identical selector and executable into tab/OBS config; OBS now honors the same process-local `LKB_PYTHON`. |
| `packages/meeting-bot/src/capture/tab-browser.ts` | `TabBrowserConfig.profileDirectory` reaches validated argv before the existing actual `spawn`; unchanged parent, locks, extension, ownership, receiver and denied media policy. |
| `packages/meeting-bot/src/capture/obs-windows.ts` | `ObsBrowserConfig.profileDirectory` and `browserExecutable` reach validated Python argv; unchanged OBS/window/parent process control. |
| `packages/meeting-bot/py/sb_join.py` | Parser + `existing_profile_directory` + `validate_uc_profile_support` run before ownership/cleanup/launch. `selected_uc_profile` wraps only the process-local UC constructor, verifies one selector, preserves old welcome flags, forces documented `suppress_welcome=False`, restores in `finally`. `kill_orphans` retains original parent lock/Job ownership and selects only session/exit metadata cleanup; direct selected cleanup validates first. Omission keeps legacy behavior. |
| `packages/meeting-bot/py/test_sb_join_profile.py` (new) | Hostile/path/redirect/support gate, class success/error restoration, actual installed UC final argv at intercepted Popen, selected cleanup + sibling + redirected child fixtures. |
| `packages/meeting-bot/src/capture/browser-profile.test.ts` (new) | CLI/env/safe/hostile/physical/junction cases and actual login/tab/OBS spawn interception, downstream child argv + tab failure cleanup. |
| `docs/webinar-release.md` | CLI/env use, physical existing profile requirement, strict dependency gate, inherited vendor Default Preferences limitation and no auth-proof claim. |

Unchanged immediate upstream: `packages/meeting-bot/src/cli.ts` dispatches `login` and `record` to `record-commands.ts`. Unchanged downstream: Python SB launch and `seleniumbase/core/browser_launcher.py` call `undetected.Chrome`; the scoped class substitution is visible to that existing call. No SB unsupported keyword is passed.

Security flags: auth **yes** (select correct existing browser identity); tenancy/cross-tenant routing **unchanged**; filesystem writes **yes**, existing ownership cleanup only. Own selected cleanup deletes selected `Sessions` after recursive physical containment checks and changes only `profile.exit_type` to `Normal` and `profile.exited_cleanly` to `true` in selected Preferences. It never clears/copies cookies, credentials or account metadata. Tests use synthetic temporary Preferences; this build reads no private profile contents. Source edits do not touch profiles or vendor code.

## Dependency/capability pin and limitations

Installed SeleniumBase **4.51.9**. Its public SB API omits `suppress_welcome`; the low-level UC Chrome constructor documents and accepts it. Default UC otherwise appends `--profile-directory=Default` after caller chromium args. Explicit selection refuses any other version or missing constructor capability before ownership effects; the adapter verifies an exact one-selector argv before invoking the constructor. Existing pin hashes (checker independently captured):

- `.venv/Lib/site-packages/seleniumbase/undetected/__init__.py`: `6cded8cf95bcdef4d540fd384dfc1b7a54e9814dbe435eb315528720e5f0e3b2`.
- `.venv/Lib/site-packages/seleniumbase/core/browser_launcher.py`: `a4135ce67ca9e50f655122fb2b48d085ee5ec9245e958517502666f8160d2a3c`.
- `.venv/Lib/site-packages/seleniumbase/plugins/sb_manager.py`: `1bf021f72babc9928769453364aea57ec2fe8a5574d3c4413f99e7ff34400e3c`.

Inherited UC still handles `parent/Default/Preferences` even with `suppress_welcome=False`. Do not interpret our sibling-cleanup test as vendor-wide sibling immutability. This unit intentionally does not intercept vendor filesystem behavior or migrate metadata. Existing controller-state cleanup-only recovery has only a parent profile context and retains legacy Default cleanup; selector propagation is scoped to login and capture startup, not a recovery schema migration. A subsequent explicit selected launch performs selected cleanup. The parent lock/Job boundary remains unchanged.

## Retained cycle-one evidence (unchanged interfaces; not claimed as a fresh cycle-two run)

Working directory: `C:/Users/product/Desktop/KnowledgeBase`.

Python affected-stage and compatibility/downstream suite (temporary profiles, mocked ownership, intercepted Popen, **no live browser/network**):

```powershell
& .venv/Scripts/python.exe -m pytest packages/meeting-bot/py/test_sb_join_profile.py packages/meeting-bot/py/test_sb_join.py packages/meeting-bot/py/test_sb_join_ownership.py::test_linux_orphan_cleanup_exact_identity_and_refusals packages/meeting-bot/py/test_sb_join_ownership.py::test_windows_cleanup_exact_profile_identity_and_failure_gate packages/meeting-bot/py/test_sb_join_ownership.py::test_cleanup_only_uses_existing_exact_profile_cleanup_without_browser -q --tb=short
```

Exit **0**, **50 passed in 1.42s**. Process wrapper elapsed **4.2552093s**, started `2026-10-09T14:41:06.8264470Z`. Evidence: `python-tests-elevated.log`, `python-test-run-elevated.json` in the cache evidence folder. This includes omitted-selector managed driver verification and unchanged SB launch seam expectations in `test_sb_join.py`. Only the first three mocked ownership tests were selected; real native-confinement cases were not run.

Node immediate downstream producer-to-child interfaces:

```powershell
& 'C:/Users/product/AppData/Local/OpenAI/Codex/runtimes/cua_node/3dd31cfff853001c/bin/node.exe' --test --import tsx packages/meeting-bot/src/capture/browser-profile.test.ts
```

Exit **0**, **2/2 passed**, runner **1115.6092ms**, wrapper **1.2747428s**, started `2026-10-09T14:41:14.5902385Z`. Evidence `node-tests.log`, `node-test-run.json`. Actual built-in spawn bindings are intercepted before child creation; actual tab adapter creates and cleans only its localhost receiver/temporary extension fixture. No Chrome/OBS call is made. The injected OBS seam throws if reached.

Required validator:

```powershell
& .venv/Scripts/python.exe contracts/verify_contracts.py
```

Exit **0**, `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`, **0.2032805s**, started `2026-10-09T14:41:51.4625250Z`. Evidence `contracts.log`, `contracts-run.json`. This validator result supplies no auth or live-capture proof.

Scoped diff hygiene/base pin check:

```powershell
& .venv/Scripts/python.exe .cache/coordination/meeting-bot-existing-subprofile-cycle-1/freeze.py
```

Exit **0**, eight candidate paths, all five base pins verified, zero added trailing whitespace. `diff-hygiene.json` contains elapsed seconds, inventory/patch above contains complete changed logic. No source mutation testing was performed.

Execution prerequisite: default sandbox Python tempfile access produced WinError5 (initial output preserved in `python-tests.log` and `python-test-run.json`; 22 pure cases passed while filesystem cases were blocked). Elevated repeat passed. Use scoped escalation directly for independent Python filesystem and Node/tsx/esbuild subprocess verification; prior restriction is known, avoid another predictable failing attempt. Tests do not launch a browser or external API. Python/Node/tsx/SeleniumBase dependencies are installed; no dependency changes.

## Exact runtime control, after independent source PASS

```powershell
$env:LKB_PYTHON='.venv/Scripts/python.exe'
$env:LKB_BROWSER_EXECUTABLE='cft'
& 'C:/Users/product/AppData/Local/OpenAI/Codex/runtimes/cua_node/3dd31cfff853001c/bin/node.exe' --import tsx packages/meeting-bot/src/cli.ts login --profile-directory 'Profile 1'
# Existing approved room, future until; private URL is intentionally redacted:
& 'C:/Users/product/AppData/Local/OpenAI/Codex/runtimes/cua_node/3dd31cfff853001c/bin/node.exe' --import tsx packages/meeting-bot/src/cli.ts record '<PRIVATE_MEET_URI>' --profile-directory 'Profile 1' --backend tab --until '<FUTURE_ISO>' --session-id '<SAFE_UNIQUE_ID>' --title 'Private Meet proof'
```

Equivalent per-process setting: `LKB_BROWSER_PROFILE_DIRECTORY=Profile 1`; CLI wins. Do not launch into the currently live locked parent; runtime operator preserves existing owned handles and controls that gate separately. Actual expected account label, real presenter→Meet→receiver audio/video and finalization/transcription/index/Ask remain outstanding. No runtime command above was executed in this build. No actual account authentication is claimed.


## Cycle-two repair and new evidence

Canonical cycle-one FAIL is archived byte-exact at `.cache/coordination/meeting-bot-existing-subprofile-cycle-1/checker-verdict.md`, SHA256 `0bbf1a9f99674f6ba66602294a723305c735cb32c09a0721e58016889a085996`. Its exact finding is: C4 accepts named VAR_POSITIONAL `options` / `suppress_welcome` even though required keyword binding is unsupported; both independent main fixtures reached ownership cleanup. No global issue id is allocated; central serialized ledger writes are outside this maker's scope. The canonical finding and reproductions are preserved rather than substituted by a self-authored corpus.

Only TWO source paths change since cycle one: `sb_join.py` constructor guard now permits only `POSITIONAL_OR_KEYWORD` or `KEYWORD_ONLY`, and `test_sb_join_profile.py` adds the two standing equivalent main ownership-gate regressions. The other SIX final source/test/doc hashes are unchanged and explicitly recorded in the cycle-two inventory and `diff-hygiene.json`. Cycle-one frozen source, original manifest/packet and full evidence are preserved. Complete incremental diff: `.cache/coordination/meeting-bot-existing-subprofile-cycle-2/cycle2-only.patch`, SHA256 `195e2387e6d7a7284a161dfdbb3125156618b5348e9ae038e9cdfbc9d666c221`.

Exact cycle-two affected-stage / immediate consumer command:

```powershell
& .venv/Scripts/python.exe -m pytest packages/meeting-bot/py/test_sb_join_profile.py packages/meeting-bot/py/test_sb_join.py::test_main_managed_driver_refuses_missing_unreadable_and_mismatched_versions packages/meeting-bot/py/test_sb_join.py::test_main_passes_verified_installed_driver_to_actual_sb_launch_seam .cache/coordination/meeting-bot-existing-subprofile-cycle-1/checker-independent.py -q --tb=short
```

Exit **0**, **28 passed in 0.55s**, wrapper **3.2819234s**, start `2026-10-09T14:50:25.2623042Z`. Evidence `.cache/coordination/meeting-bot-existing-subprofile-cycle-2/python-tests.log` and `python-test-run.json`. Replayed exact checker-authored script without edits: recorded unsupported constructor corpus **2/2 refused before ownership**, plus its redirected Preferences case **1/1 refused**; new standing reproductions **2/2 refused**. Actual installed UC interrupted-Popen effective argv tests and old managed SB Default consumers re-ran green. No cases left open.

Node and required validator results are reused from cycle one; their tested TS/docs sources and dependency files are unchanged. No full suite or browser is launched. New scoped hygiene command `& .venv/Scripts/python.exe .cache/coordination/meeting-bot-existing-subprofile-cycle-2/freeze.py` exits0, checks all eight paths and asserts six unchanged candidate pins; result includes no added trailing whitespace. Cycle-two inventory is the authoritative candidate. Runtime account/capture gates and inherited limitations remain unchanged.

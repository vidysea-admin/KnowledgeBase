# Verdict: w25-seedfix

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: a233fa79bfdd73b64322cfddfc84f0c5845e1fc2
Base: ae5e2e71
Class reviewed: security (ownership boundary for seeded credential slots)
ISSUES-WRITTEN: none
Ledger rows: none attached to this unit.

## Focus points
1. Planting `.lkb-*` / reparse points: admission needs `OWN_CONTROL_FILE` (`^\.lkb-[A-Za-z0-9][A-Za-z0-9._-]{0,120}$`), `os.path.isfile` and `not os.path.islink`, and a valid marker. Checker probe on this Windows host with the real `unproved_entries`: a junction named `.lkb-junc` (created with mklink /J) is REFUSED (a junction is a directory, isfile is False); `.lkb-` and `.lkb-evil name` are refused; a regular `.lkb-tab-capture.lock` and `.lkb-readiness-failure-1.json` are admitted; with a wrong nonce nothing is admitted. File and directory symlinks could not be created without the privilege (WinError 1314), so the islink guard was verified by code and by the maker's test, not by a live symlink here. Residual (low, not blocking): a pre-planted regular HARD LINK named `.lkb-x` is admitted (content is never inspected); it needs local write access to the slot dir, and only matters if the recorder later writes a file of exactly that name.
2. Admission requires the marker nonce to equal LKB_SEED_NONCE AND the marker slot to equal the directory: `seeded = SEED_MARKER in names and _valid_marker(root, nonce)` reuses the unchanged cycle-1 `_valid_marker`. Probe: wrong nonce admits no `.lkb-*`; no nonce trusts nothing (test).
3. Stale lock (smoke note): not changed by this unit. `selectTabCaptureWorkspace` (tab-session-workspace.ts ~L118) refuses any existing `.lkb-tab-capture.lock` / `.lkb-recovery.lock` / `.record-state.json` regardless of pid, with "Capture slot is occupied or needs owned recovery before reuse". That is fail-closed: a live slot is never hijacked, but a lock left by a hard-killed run blocks that slot until an operator clears it (the manifest documents the manual cleanup). w24's stale sweep removes only seed files, not locks. Follow-up suggestion (separate unit, not required here): treat a lock whose recorded pid is dead as stale.
4. Lowercasing: the slot is lowercased before the unchanged `^[a-z0-9][a-z0-9_-]{0,63}$` and reserved-name checks, so `A` and `a` intentionally become one slot (previously uppercase was refused, so no existing uppercase dirs). All downstream consumers (scheduler deps, native-capture server, record) go through `selectTabCaptureWorkspace` and use `workspace.slot`. Distinct slots cannot collide except by case; the only non-ASCII input that folds into the allowed set is U+212A (Kelvin sign -> `k`), which yields an already-validated safe identifier.

## Checker-run evidence
- node: slot-profile-seed + tab-session-workspace 24/24 pass; record-commands 22/22 pass (rc 0).
- `tsc --noEmit -p tsconfig.json` rc 0.
- pytest with the KnowledgeBase .venv (pytest 9.1.1): test_sb_join_seed.py 5/5 pass. test_sb_join_ownership.py: 50 pass, 7 fail, all `test_registration_native_same_host_other_port_confinement[...]` with "Registration browser failed" (they launch a real browser; environment/Chrome, unrelated to `unproved_entries`; not re-verified on base because that would launch Chrome again).
- D-020 mutation (one, per-mutation byte backup, trap INT/TERM/ERR, timeout 300): removed the `islink` guard and the nonce equality in `_valid_marker`; 2 tests failed (`test_stale_marker_wrong_nonce_...`, `test_own_control_files_pass_only_under_a_valid_marker_and_only_as_regular_files`); restored; cmp ok; `git -c core.autocrlf=true hash-object` == `git rev-parse HEAD:` (94910d6eaf8998f6902d9cabdbda0795651754b5). Working tree clean after.

## Not verified
Real Chrome / maker smoke (out of scope); live file symlink behaviour (no privilege); the 7 browser-launching ownership tests on base; lint-loc.
Runtime token totals not exposed to this reviewer (null); ratios unverified.

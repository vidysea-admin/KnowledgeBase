# Verdict: w24-signedslots

(Authoritative current verdict: see the "Cycle 1 re-check" block at the end of this file.)

Cycle-0 result (superseded by the cycle 1 block below): FAIL
Cycle-0 number: 0
Cycle-0 reviewed SHA: bb481d8a85e3060271288bd0b5f07591eebafcf0
Base: 8029be9f
Class reviewed: security (credential handling)
ISSUES-WRITTEN: none (findings below go back to the maker for cycle 1; no ledger rows may be flipped)

## Findings (maker must fix in cycle 1)

F1 (blocking) fail-closed "signed in" check is trivially satisfied. packages/meeting-bot/src/capture/workspace/slot-profile-seed.ts `assertSlotSignedIn` (lines ~86-96)
does `cookies.toString("latin1").includes(name)` for `SID`/`__Secure-1PSID`/`__Secure-3PSID` and `.includes("google.com")` over the raw SQLite file. The two
substrings are independent: any cookie named `*SID*` on ANY site (or the bytes `SID` anywhere in the file, `SIDCC`, `HSID`) plus any `google.com` host satisfies it.
Probe (run by checker with the real function and a stubbed readFileSync): ACCEPTED for `"google.com NID\0example.com SID"`, `"xxSIDxx google.com"`, `"google.com SIDCC"`;
refused only for `"google.com NID AEC"`. Cookie values/expiry are never inspected. Fix: open the copied Cookies DB (sqlite read-only, or parse the cookie rows) and require a single
row with host_key matching `(^|\.)google\.com$`, name in the session set, a non-empty encrypted_value and expires_utc in the future (or session); add a test with a non-Google `SID`.

F2 (blocking for a credential unit) cleanup does not run on interrupt/kill. record-commands.ts disposes in `finally`, which covers success and thrown errors, but there is no
SIGINT/SIGTERM handler in the record path (only private-acl.ts mentions signals). Ctrl+C, task kill, or a crash leaves cookies + Local State + `.lkb-seed.json` under
`data/bot-profile/.capture-slots/...` until the next seed on that slot. Also dispose is best-effort (maker's own smoke saw EPERM while Chrome was still exiting), so a leftover is possible even on a clean run.
The dir is gitignored (`.gitignore:67 data/bot-profile/`, verified with git check-ignore), so there is no commit leak, but the copy lingers on disk.
Fix: register once-handlers for SIGINT/SIGTERM/SIGBREAK/exit that call dispose, and retry/verify removal after the browser process has exited (fail loudly if a seeded file remains).

F3 (should fix) `.lkb-seed.json` is static: `{version:1, seededAt}`, no nonce, pid or slot binding; py/sb_join_seed.py `_valid_marker` only checks version == 1. Any dir with the marker lets
`Local State` and the whole selected profile directory (contents unchecked) pass the "Legacy occupied or unproved profile refused" check, including a stale marker left by a crashed run.
It cannot be forged by a remote party (needs local write into the slot dir), so it is a hardening gap, not an open exploit. Fix: write a per-run nonce/pid + slot path into the marker and have Python
compare against an env/arg passed by the launcher; reject if the marker slot path differs from `expected`.

## Verified OK
1. Copy scope: allowlist is exactly Local State, <profile>/Network/Cookies, Preferences, Secure Preferences, Local Storage, Session Storage, and the two cloudonair IndexedDB dirs. No Login Data, Web Data, History, Sync, caches. Note (not a defect): Cookies, Local Storage and Session Storage carry ALL origins' data, not only Google/cloudonair; the manifest's "never other origins" holds for IndexedDB only. The owner approval should cover that breadth.
2. Path handling: profile name validated (regex, no `..`, no trailing dot/space); source/slot overlap refused (case-folded on win32); lstat on the profile dir; directory copies reject symlink entries and cap at 32 MiB; slot dir is built by selectTabCaptureWorkspace (physicalDirectories check) under data/bot-profile/.capture-slots. Root files copied with copyFileSync follow a symlinked `Local State`/`Cookies` (read-only exposure of the owner's own file; low).
6. Default behaviour: `seedSlotFromArgs` returns undefined without the flag/env; ownership change is inert without the marker (tests pass). `LKB_SEED_PROFILE_DIR` set with no slot fails closed. `selectedBrowserProfile` now runs inside the try (after consentControl is created); negligible.

## Checker-run evidence (all independent, exit codes captured under the scratchpad w24/ dir)
- node focused: `node --test --test-force-exit --import tsx slot-profile-seed.test.ts tab-session-workspace.test.ts record-commands.test.ts` -> 40/40 pass, rc 0.
- `tsc --noEmit -p tsconfig.json` -> rc 0.
- pytest NOT available in the environment (`No module named pytest`; no venv). py/test_sb_join_seed.py run via a stdlib harness (calls each test function with a temp dir): 4/4 pass. py/test_sb_join_ownership.py was NOT run (needs pytest/psutil): environment gap, HOLD-level for that item, not counted against the maker.
- ps1: `node --test scripts/webinar/start-record-detached.test.mjs` on the candidate -> 6 pass, 1 fail (ISS-323(a,b) "a recorder that dies immediately..."); w24-signedslots test passes.
- Base check of the ISS-323(a,b) failure: extracted `scripts/webinar` from 8029be9f via git archive and ran the single test -> fails the same way (`the pre-fix script exited 0 on a launch that never happened`). Confirms pre-existing; caveat: only the scripts/webinar tree was extracted, not the whole repo.
- D-020 mutation (checker): py/sb_join_seed.py `SEED_MARKER in names and _valid_marker(root)` -> `... and True`, per-mutation byte backup, trap on INT/TERM/ERR, timeout 120: `test_sb_join_seed::test_bad_marker_gives_no_trust` failed (3 pass, 1 fail); restored; `cmp` ok; `git -c core.autocrlf=true hash-object` == `git rev-parse HEAD:` (bc5857e09e05c89c5126610c0318c2f06d544fc6). The maker's own `assertSlotSignedIn` mutation was not rerun.
- Not verified: real Chrome / smoke (out of scope), lint-loc, sb_join_ownership pytest, signal behaviour at runtime (read from code only).

## Contract note (qa/contracts/goal-t034.md criterion 3, "no unapproved credential/profile copying")
Apart from F1-F3 the design is acceptable as an explicit opt-in (flag or env; never implied by --capture-slot; allowlist narrow; fresh copy per launch; removal after run).
OWNER APPROVAL (Umesh) IS A REQUIRED PRECONDITION FOR ACTIVATION of --seed-profile / LKB_SEED_PROFILE_DIR in any real run. It has not been given and is not assumed by this verdict;
a later PASS does not itself grant it.

## Budget
Checker work was bounded to the focused checks above. Runtime token totals are not exposed to this reviewer (null); ratios unverified. Longest commands: node focused 67 s, ps1 file ~4 min, base ps1 test 14 s.

---
# Cycle 1 re-check

VERDICT: PASS
Cycle checked: 1
Reviewed SHA: f36d3f4f7fee99903f7be0a3bf96c0bb10eceb8a
Prior: cycle 0 FAIL at bb481d8a (verdict commit 5c950edb)
ISSUES-WRITTEN: none
Ledger rows: this unit has no ledger rows of its own; nothing to flip.

## Findings re-checked
- F1 CLOSED. `assertSlotSignedIn` now opens the copied Cookies DB read-only (node:sqlite) and requires a row with name in {SID, __Secure-1PSID, __Secure-3PSID}, host_key matching `^(?:.*\.)?google\.com$`, non-empty encrypted_value and unexpired (or session) expires_utc (BigInt-safe). Checker probe with real sqlite DBs through the real function: refused example.com SID + google NID; raw `xxSIDxx google.com`; SIDCC only; .evilgoogle.com SID; google.com.evil.com SID; expired SID; empty-value SID. Accepted: valid .google.com __Secure-1PSID and a session-cookie (expires 0) SID.
- F2 CLOSED. slot-seed-signals.ts installs SIGINT/SIGTERM/SIGBREAK/exit handlers (cleanup, uninstall, re-raise when nothing else listens); `removeSeeded` retries 5x and returns what remains, and dispose logs a loud "SEEDED SESSION FILES REMAIN" line. `sweepStaleSlots` runs at the next seed, only over sibling dirs of the slot under `.capture-slots/<tenant>`, only where the marker has version 1 and a pid that is not alive; it skips its own slot, live pids (PID reuse errs toward skipping), dirs without a marker, and removes only the fixed seed allowlist names (profile name re-validated by seedProfileDirectory, no traversal). Covered by tests F2 signal and F2 sweep (dead swept, live/own/plain kept).
- F3 CLOSED. Marker now carries version, per-run randomUUID nonce, writer pid, slot path and profile. py/sb_join_seed.py trusts it only if marker nonce equals LKB_SEED_NONCE (set on process.env by seedSlotFromArgs; the python child in tab-browser.ts / bot-child.ts inherits process.env, so the nonce reaches it) and marker slot equals the directory (normcase+abspath). Missing nonce, stale nonce, copied marker, missing pid, version 2, non-JSON, oversize, list: all give no trust (tests). Env var is deleted on dispose.
- Owner approval: the manifest line 7 carries the verbatim quote dated 2026-10-19 ("I approve: ... (3) copying signed-in session cookies (never passwords or cards) into temporary capture slots for parallel recordin[gs]"). Present; I cannot independently verify the chat itself. Note for the owner: the quote names cookies, while the allowlist also copies Local Storage, Session Storage and the cloudonair IndexedDB (and those hold all origins' Local/Session Storage). Treat the approval as covering the allowlist only if Umesh intended that; the manifest should say so explicitly.

## Evidence (checker-run)
- node focused (slot-profile-seed, tab-session-workspace, record-commands) -> 44/44 pass, rc 0.
- `tsc --noEmit -p tsconfig.json` -> rc 0.
- test_sb_join_seed via stdlib harness (pytest still not installed) -> 4/4 pass.
- D-020 mutation: `data.get("nonce") == nonce` -> `True` in py/sb_join_seed.py, per-mutation byte backup, trap INT/TERM/ERR, timeout 120: `test_stale_marker_wrong_nonce_missing_nonce_or_other_slot_gives_no_trust` failed (3 pass, 1 fail); restored; cmp ok; `git -c core.autocrlf=true hash-object` == `git rev-parse HEAD:` (27b415478f40f4215e5b63ce0135655b360265eb).

## New-escape review (no blocker)
- Low/hardening: the sweep follows a symlinked/junction sibling dir under `.capture-slots/<tenant>`; with local write access an attacker could point one at a dir holding a dead-pid marker and get the fixed allowlist names deleted there. Needs local write inside data/, deletes only the seed names. Suggest an lstat check on `dir` in a later unit.
- Low: node:sqlite is used (engines node>=24 satisfied; may print an ExperimentalWarning).
- The "dispose then delete env" ordering and default-off behaviour are unchanged; without the flag/env, no nonce is set and the Python refusal for pre-populated profiles is unchanged.

## Not verified / limits
- py/test_sb_join_ownership.py and the kill_orphans wiring were not run (no pytest/psutil here); the one-line call site is unchanged since cycle 0 and unproved_entries is unit-tested directly. Real Chrome/smoke and lint-loc not run. Signal behaviour verified by the injected-process unit test, not a real Ctrl+C.
- Activation precondition: owner approval is recorded in the manifest as above; per-run use still needs the explicit flag/env. Runtime token totals not exposed to this reviewer (null); ratios unverified.

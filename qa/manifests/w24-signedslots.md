# w24-signedslots: parallel signed-in recordings via seeded capture slots

Status: checked-PASS — closed out 2026-10-26 (resume reconcile) citing qa/verdicts/w24-signedslots.md
Fix cycle: 1

## Fix cycle 1 (verdict 5c950edb: F1-F3)
- Owner approval, recorded 2026-10-19 (goal-t034 criterion 3). Umesh, verbatim from chat: "I approve: ... (3) copying signed-in session cookies (never passwords or cards) into temporary capture slots for parallel recordin[gs]".
- F1: `assertSlotSignedIn` opens the copied Cookies DB read-only (node:sqlite, BigInt expiry) and requires a row with name exactly SID/__Secure-1PSID/__Secure-3PSID, host_key `google.com` or `*.google.com`, non-empty value, unexpired. Tests cover non-Google SID, xxSIDxx, SIDCC, HSID, lookalike hosts, empty value, expired, raw non-database bytes.
- F2: `slot-seed-signals.ts` removes seeded files on SIGINT/SIGTERM/SIGBREAK/exit and re-raises; removal retries and reports leftovers loudly; `sweepStaleSlots` cleans sibling slots whose marker pid is dead at the next launch. Tested with a fake process.
- F3: marker holds per-run nonce, pid, slot path, profile; the launcher sets `LKB_SEED_NONCE`; `py/sb_join_seed.py` trusts the marker only with a matching nonce and slot path (4 pytest pass).
- Results: tsc clean; node 44/44 (seed, tab-session-workspace, record-commands); lint-loc --all 10 stages OK.
- D-020 mutation on F1 (host check replaced with `true`): 2 tests fail; restored, hash equals index blob.
- Not re-run: real-Chrome smoke (code path for launch unchanged since cycle 0); sb_join_ownership pytest (needs Chrome).
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w24-signedslots  Branch: lane/w24-signedslots
Base: 8029be9f (origin/master)  Candidate: see `git rev-parse lane/w24-signedslots` (single commit)

## Design choice: (A) seeded slots, not (B) attach
The recorder is not a CDP client. `py/sb_join.py` launches its own Chrome through SeleniumBase UC with `user_data_dir`,
loads the owned tab-capture extension, and the Job-object ownership code requires it to own the browser. Attaching to a running
Chrome would need a new launch/ownership path in Python plus extension loading into a foreign browser. (A) reuses the existing
slot machinery (`--capture-slot`, per-slot lock, record dir, ownership ledger) and only fills the slot's user-data-dir.

## Behaviour
- `--capture-slot N --seed-profile DIR [--profile-directory "Profile 1"]` (or `LKB_SEED_PROFILE_DIR`): before launch, copies
  only session-state files from DIR into the slot's own dir under `data/bot-profile/.capture-slots/...` (gitignored):
  `Local State`, `<profile>/Network/Cookies`, `Preferences`, `Secure Preferences`, `Local Storage`, `Session Storage`,
  and the cloudonair origin only of `IndexedDB`. Never caches, history, passwords, media or other origins. Fresh copy each launch.
- Fail closed (`SlotNotSignedInError`): the slot copy must hold a cookie-encryption key and a Google session cookie
  (`__Secure-1PSID`/`__Secure-3PSID`/`SID` for google.com), else the run exits with "capture slot is not signed in: ...",
  nothing is left in the slot, and Chrome is never launched. A source locked by a running Chrome is refused with a clear
  reason (Chrome holds `Network/Cookies` exclusively on Windows: close the source Chrome, e.g. the 9333 one, first).
- Seeded files and `.lkb-seed.json` are removed after the run (best-effort; the next seed re-wipes).
- Python: `py/sb_join_seed.py` lets the owned-profile check accept `Local State` + the one selected profile directory next
  to `.lkb-profile.lock` only when a valid `.lkb-seed.json` marker is present. Without the marker, the existing
  "Legacy occupied or unproved profile refused" behaviour is unchanged. Seeded slots otherwise hit that refusal.
- Never types credentials or clicks sign-in or consent. No OnAir page-interaction code touched.
- Policy note for the checker: goal-t034.md criterion 3 says "no unapproved credential/profile copying is inferred from
  parallel operation". This is explicit opt-in (flag or env), requested by the orchestrator, never implied by `--capture-slot`.

## Changed paths
packages/meeting-bot/src/capture/workspace/slot-profile-seed.ts (+ .test.ts), tab-session-workspace.ts (1 re-export),
record-commands.ts (+1 net line: seed call, `finally` dispose, usage text), py/sb_join_seed.py (+ test_sb_join_seed.py),
py/sb_join_ownership.py (1 import, 1 condition), scripts/webinar/start-record-detached.ps1 (-CaptureSlot, -SeedProfile,
-ProfileDirectory, also refused with -Job) and its test.

## Checks a checker must run
- `node --test --import tsx src/capture/workspace/slot-profile-seed.test.ts src/capture/workspace/tab-session-workspace.test.ts src/capture/record-commands.test.ts` from packages/meeting-bot (40 pass)
- `tsc --noEmit -p tsconfig.json` (clean); `python -m pytest py/test_sb_join_seed.py` (4 pass)
- `node --test --test-name-pattern=w24-signedslots scripts/webinar/start-record-detached.test.mjs` (1 pass)
- `node scripts/lint-loc.mjs --all` (10 stages OK)
- D-020 mutation: in `assertSlotSignedIn`, replace the Google-cookie condition with `if (false)`: 2 tests fail
  (unit fail-closed and runRecord unsigned-source), restored; hash equals the index blob (88d70b66...).

## Evidence
- Pre-existing failure, unrelated: `ISS-323(a,b) ... dies immediately` in start-record-detached.test.mjs fails identically
  on the unmodified base (error text wraps at console width).
- Smoke (real, 2 slots, CfT 155.0.8059.39, https://cloudonair.withgoogle.com/events/apac-cts-gemini-at-work-q4-2026, no clicks,
  no recording, ~60-85 s each, started 25 s apart): both slots showed no visible "Sign in" button and the "Sign out" controls
  present, identical to the signed-in source Chrome; both exited and seeded files were removed (best-effort EPERM while Chrome
  was still exiting). First attempts without IndexedDB/Session Storage showed a visible "Sign in" button: cloudonair keeps its state there.
- Findings: cookies are v10 (DPAPI), so a different Chrome build of the same Windows user decrypts them. Stable Chrome 155.0.8059.80
  cannot be driven by the installed UC driver 155.0.8059.39 (bring-up hangs), so slots must use the managed CfT browser
  (`LKB_BROWSER_EXECUTABLE=cft`). Launching two UC browsers in the same second collided once ("Cannot inspect owned Job" after a force-kill);
  stagger starts by 20-25 s.
- Left open: the 9333 Chrome had to be closed (it was re-opened once for ground truth and closed again; restart it when needed).
  Real full recording through two slots is not exercised here (smoke used the login-style launch).

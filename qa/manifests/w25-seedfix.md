# w25-seedfix: seeded slots refused at launch ("Legacy occupied or unproved profile refused")

Status: checked-PASS — closed out 2026-10-26 (resume reconcile) citing qa/verdicts/w25-seedfix.md
Fix cycle: 0
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w25-seedfix  Branch: lane/w25-seedfix
Base: ae5e2e71 (origin/master, PR #14)  Candidate: single commit on the branch (`git rev-parse lane/w25-seedfix`)

## Root cause (reproduced with the real `lkb record` CLI, one slot)
The tab backend creates `.lkb-tab-capture.lock` inside the slot's user-data-dir before Python's ownership check runs, and a failed run leaves
`.lkb-readiness-failure-*.json` there. `py/sb_join_seed.py::unproved_entries` accepted only `.lkb-profile.lock`, the marker, `Local State` and the
profile directory, so the first real launch of any seeded slot refused. The nonce plumbing was fine: the debug listing showed
`['.lkb-profile.lock', '.lkb-seed.json', '.lkb-tab-capture.lock', 'Local State', 'Profile 1']` with a valid marker. The cycle 0/1 smokes used the
login-style launch, which does not create the TS lock, so they bypassed this path.

## Fix
- `py/sb_join_seed.py`: under a valid marker (matching `LKB_SEED_NONCE` and slot path) ALSO accept regular, non-link files named `.lkb-*`
  (the recorder's own control files). Unseeded or wrong-nonce profiles, foreign entries and `.lkb-*` directories still refuse; the ownership check itself is untouched.
- `tab-session-workspace.ts`: `--capture-slot` is lowercased (`-CaptureSlot A` == `a`).
- Tests: py (5 pass); TS regression `w25 regression` spawns the real Python with the nonce exported by `seedSlotFromArgs` (env handoff) and asserts control files pass,
  no-nonce trusts nothing, a foreign `Cookies` entry and a `.lkb-dir` directory still refuse; uppercase slot test; the old "A is refused" expectation was updated.

## Checks
- `node --test --import tsx src/capture/workspace/slot-profile-seed.test.ts src/capture/workspace/tab-session-workspace.test.ts` (24 pass); `tsc --noEmit` clean
- `python -m pytest py/test_sb_join_seed.py` with the KnowledgeBase .venv (5 pass)
- `node scripts/lint-loc.mjs --all` (10 stages OK)
- D-020 mutation (`seeded and OWN_CONTROL_FILE.match(name)` -> `OWN_CONTROL_FILE.match(name)`): 2 py tests fail; restored, `cmp` OK, hash equals pre-mutation blob 94910d6e.

## Smoke (real, full `lkb record` path, no clicks, owner approval for cookie/storage copying and cft stands)
Slot `A` (uppercase) on apac-cts-gemini-at-work-q4-2026 and slot `b` on weeklies-inframod-cloud-roadmap-series-infrastructure-for-the-agentic-era-sept-2026,
started 25 s apart, `LKB_BROWSER_EXECUTABLE=cft`, 60 s: both reached the logged "recording until" state, and CDP probes of both Chromes showed
no visible "Sign in" button and the Sign out controls present (signedIn true for both). Earlier attempts: using one URL twice is refused by the same-meeting guard (correct);
a killed prior run leaves slot locks, so clear `data/bot-profile/.capture-slots` and `raw/webinars/.capture-session-locks` after a hard kill.

## Not done
No recording was finalized; smoke processes were killed after the probe.

# Verdict: codexwave1-build (snapshot 46633f71)

VERDICT: FAIL
Cycle checked: 0
Checker: independent build/test checker, 2026-10-14. Base for comparison: main 4f449b27.

Method note: lane node_modules/@lkb/* junctions point at the MAIN tree, so tsc/tests ran with a temporary tsconfig `paths` mapping @lkb/* to lane packages (deleted afterwards). Without it apps/api tsc shows 12 false errors (ISS-CODEXWAVE1-007, environment).

## Results
| Check | Result |
|---|---|
| tsc apps/api, apps/web, packages/core, ask, meeting-bot | all exit 0 (lane paths) |
| apps/api node --test | 933 pass / 0 fail |
| packages/core | 419 / 0 |
| packages/ask | 131 / 0 |
| packages/meeting-bot (src + py/tab-capture) | 961 pass / 2 fail, both known EPERM symlink (record-backend.test.ts:67, tab-browser.test.ts:85); 1 ISS-T034EXT-004 expected-fail reported as pass |
| apps/web vitest | 814 pass / 2 FAIL (SearchPage.test.tsx), deterministic 4/4 reruns |
| pnpm test:webinar globs | 195 pass / 0 fail |
| scripts/webinar/supervisor install-supervisor.test.mjs | 10 / 0 (but see ISS-005: tests main's script) |
| scripts/eval calibration-review.test.mjs | 9 / 0 |
| apps/web vite build | exit 0 (tsc clean separately) |
| lint-loc --all | FAIL 1: test_sb_join_ownership.py 408>400; PRE-EXISTING on main (408 lines), lane/jobreap fixes |
| lint-dirsize | OK |
| docs/SNAPSHOT.md --check | STALE (116 lines) - caused by junk data/registration-checker-fixtures-GaLngI/ and new qa dirs |
| contracts/verify_contracts.py | PASS by vacuity |

## Failures attributed to the snapshot
1. SearchPage.test.tsx x2 (ISS-CODEXWAVE1-003, high): SemanticResults mounted unconditionally in SearchPage.tsx adds a 3rd fetch ("expected spy to be called 2 times, but got 3") and 'failed to load session' replaces 'New session source'. Test file unchanged vs main.
2. Stale SNAPSHOT.md (from junk, ISS-004).

## Not caused by snapshot
meeting-bot 2 EPERM symlink; lint-loc 408 lines (on main).

## Hygiene
- Junk: 34 files in data/ (registration-checker-fixtures-GaLngI/, probes), 45 KB, absolute paths (ISS-004).
- qa/evidence: 28 test/probe-shaped files, none matched by any current test glob; 76 qa files contain C:\Users paths (ISS-005).
- Secrets: none found (regex scan of added/modified text files: only prose false positives).
- >1 MB: none added by the snapshot (the 7 qa/evidence PNGs and 3 raw PDFs already exist on main).

---
# Cycle 1 (commit 4de57107, main merged at 4afb0e31)

VERDICT: PASS
Cycle checked: 1

Same method (temporary lane `paths` tsconfig, deleted).

| Check | Result |
|---|---|
| tsc api/web/core/ask/meeting-bot | all exit 0 |
| apps/api | 933 pass / 0 fail |
| apps/web vitest | 81 files, 816/816 pass (was 814/2 fail) |
| apps/web vite build | exit 0 |
| test:webinar globs | 195/0 |
| supervisor tests | 10/10 on 5 standalone runs; 1 failure in one earlier standalone run (see flakes) |
| lint-loc --all, lint-dirsize | OK (1012 files; 179 dirs) |
| snapshot.mjs --check | OK |
| contracts | PASS by vacuity |

1. ISS-003 root cause CONFIRMED: SessionDetailPage.tsx (absent at main 4f449b27, present at snapshot) mounts GroundedContentPanel, which fetches /sessions/:id/grounded-content; SemanticResults is not the extra call. The cycle-1 diff to SearchPage.test.tsx only adds a grounded-content branch to the routing fetch; no expect()/count assertion changed. Not weakened.
2. Stream-cap deadline 1000 -> 60000 ms: the assertion's purpose is the 'too large' (64 KiB cap) message, and the mock reader returns instantly, so the cap trips well within a second unless the machine is starved (Stopwatch plus 5 ms sleeps). A hang regression would still fail (message becomes 'timed out', or the 15 s spawnSync timeout in run() kills it), so the test is not blinded; 60 s only exceeds the 15 s harness timeout, making the deadline moot. Suggestion: 10000 ms (below the 15 s harness timeout, still load-tolerant).
3. 34 data/ junk files gone; only reference is the .handoffs inventory json; no import. Supervisor test uses import.meta.url. SNAPSHOT check OK. The 28 qa/evidence absolute-path files are evidence only, outside all test globs (apps/*/src, packages/*/src, explicit lists): harmless.
4. Flakes: send-now-host 'launch: 202' 5/5 pass. Supervisor 5/5 pass (10/10 each). One earlier standalone supervisor run failed 1 of 10 (test name not captured) while durations range 17-46 s, i.e. the host is under heavy load (Chrome worker); load-attributed: these tests spawn powershell.exe with a 15 s harness timeout. Not reproduced in 6 subsequent runs; weak evidence it is not real.

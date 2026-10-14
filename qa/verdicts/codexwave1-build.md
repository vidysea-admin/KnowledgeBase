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

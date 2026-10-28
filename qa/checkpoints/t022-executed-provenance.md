# Checkpoint: t022-executed-provenance (checker, cycle 0, 2026-10-26)
Env: node v24.13.1, win32, system python 3.13 (no .venv). Code: scripts/eval/human-calibration.mjs LF-sha bb91820014da89802e0641a4a232551c32d0fce498fee7f37f45c0798df6aa6c, test LF-sha 6d9766ea7f67fdcf8530423f108d45ec2b9299c379e3064461df4dcf5045df63 (= HEAD blobs). Lock: pnpm-lock.yaml unchanged by this unit. Checker: claude-sonnet-subagent.
- node --import tsx --test --test-name-pattern "executed provenance" scripts/eval/human-calibration.test.mjs : 2/2 pass (bound tree)
- same test file whole: 10 tests, 4 pass, 6 skipped (private HOLD), 0 fail
- t022-offline-review.test.mjs: 10 tests, 2 pass, 8 skipped, 0 fail
- python -B contracts/verify_contracts.py : exit 0, PASS by vacuity
- falsification copies (git archive HEAD subset, junctioned node_modules, removed after): C5 content-blind binding red@test:151; C8 router excluded red@test:147; C9 after-check clause removed red@test:183; survivor sha-of-path (low)
Reusable only while the two file hashes, pnpm-lock.yaml, node version and packages/ai/src inventory are unchanged.

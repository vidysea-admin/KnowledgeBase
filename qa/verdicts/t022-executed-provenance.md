# Verdict: t022-executed-provenance (Mode A, cycle 0)

Date: 2026-10-26 · bound to D:/KnowledgeBase · Cycle checked: 0 · Policy-Version: manifest unpinned -> current block proportional-verification/2026-10-19.17
Contract: qa/contracts/goal-t022.md (slice C5/C8/C9/C10, executed-provenance only, per manifest scope)
Base: manifest SHA 5c4cbade is not an object in this clone (history rewritten); judged on CURRENT tree bytes per dispatch.
Resume/Retry: none (first dispatch). Dispatch note: superseded admission HOLD acknowledged, proceeded.

## Check plan (step 0)
Diff = 2 files: scripts/eval/human-calibration.mjs (new export implementationBindings, 5th param on validateHumanProviderOrder) and its test. Logic changed -> affected tests + falsification floor. No UI, no data collection, no LLM output, no security/auth/prod-write trigger -> no dual check, no Mode D. Importers checked: t022-offline-review.test.mjs, u010-corpus.mjs.

## Evidence I produced
1. Tests (bound tree): `node --import tsx --test --test-name-pattern "executed provenance" scripts/eval/human-calibration.test.mjs` -> 2/2 pass, 0 skip (node v24.13.1). Whole touched test file: 10 tests, 4 pass, 0 fail, 6 skipped (existing private-corpus HOLD tests; KB_T022_PRIVATE_REVIEW_TESTS unset; not exercised, not claimed).
2. Importer t022-offline-review.test.mjs: 10 tests, 2 pass, 0 fail, 8 skipped (private HOLD). u010-corpus.mjs hashes human-calibration.mjs bytes at its own load, no pinned hash; unaffected.
3. `python -B contracts/verify_contracts.py` -> "no frozen contracts yet (research phase) -- PASS by vacuity", exit 0 (system python; .venv absent in this checkout). Vacuity limitation disclosed per C10.
4. Final-file identity: working files are CRLF (core.autocrlf=true); LF-normalised sha256 = bb91820014da... / 6d9766ea7f67... = manifest/packet pins = HEAD blobs. Content matches; raw working hashes differ only by line endings.
5. Code read in full (human-calibration.mjs 1-80, 160-264; test 136-190). Binding = 5 implementation files + 8 resolution/config files + every non-test .ts under packages/ai/src (symlink and dynamic import refuse), plus executable/version/platform/arch/execArgv+NODE_OPTIONS hashes and the actual @lkb/ai and tsx/esm/api entries. runHumanCalibration records before/after bindings, effectiveRouting and drift flags; predecessor validation requires both before/after bindings equal to current.

## Criteria (executed-provenance slice)
- C5 (judge implementation change cannot retain effective approvals): MET. Falsification: byteBinding made content-blind (bytes 0, sha256 "") in a copy; green-before 2/2, red-after at human-calibration.test.mjs:151 (the drift notDeepEqual). Direct probe in a copy: same-length 1-byte edit of router.ts changes sha256 and the whole binding.
- C8 (implementation/source/routing provenance recorded): MET for the provenance records (router, both adapters, parser, barrel, lock, tsconfig, runtime, effectiveRouting in report). Falsification: router.ts excluded from AI inventory in a copy; red at test.mjs:147 "missing packages/ai/src/router.ts". Live 30-pair scoring is C7/C8 HOLD, outside this slice.
- C9 (downstream consumer uses current identities): MET. Falsification: drop the bindingsAfterExecution equality clause (human-calibration.mjs:185) in a copy; red at test.mjs:183 "Missing expected exception".
- C10 (matching source/check evidence): MET for the slice (own run, hashes, verifier above). Source PASS only; human labels 0/30 and live calibration remain HOLD; external transitive bytes uncertified (disclosed by code and manifest).
Copies: green-before 2/2 in each (evidence green-copy.txt); all mutations were single-hunk edits in isolated copies (git archive HEAD subset, junctioned node_modules), removed afterwards; bound tree untouched (hashes re-read).
Note: an earlier C8 mutant (drop all aiPaths) went red for a setup reason (ENOENT in temp copy) and was discarded; the replacement above is the counted one.

## Findings (non-blocking)
- P1 low: mutant `sha256 = sha256(path)` SURVIVES both provenance tests (the first test appends bytes so `bytes` length changes and masks sha256; evidence survivor-c5-sha-of-path.txt). Product behaviour is correct (probe above); the test cannot isolate sha256. Ledger ISS-T022PE-001.
- P2 low (EXPLANATION only): raw-byte hashes make bindings differ between LF and CRLF checkouts; same-machine comparison unaffected.
- Process: 4c diff against manifest Base impossible (base absent; both files first appear in 0f3d9bb4, 454 insertions, 2 files). Scope judged by whole-file read; manifest lists only these two source files.

VERDICT: PASS
SCOREBOARD: 4/4 slice criteria (C5, C8, C9, C10 executed-provenance scope) met, 0/0 invariants violated; full-contract C7/C8/C9 live gates remain HOLD, T-022 stays open
TIER: M (exported API plus optional param consumed by 2 importers; no security/prod-write trigger)
FAILURES: none
CAPABILITY-COVERAGE: not-applicable (no Capability coverage table in manifest; 3 checker falsifications reproduced red at the intended assertions)
LIVE-BROWSER: not-applicable (scripts/eval/*.mjs only)
ISSUES-WRITTEN: ISS-T022PE-001 (low), ISS-T022PE-002 (process) in qa/issues.t022pe.jsonl
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: Two provenance tests pass on current bytes, the three one-per-criterion falsifications go red at the intended assertions in isolated copies, and the verifier command ran (vacuous). The sha256-only test gap is a low row, not a FAIL. Evidence: qa/evidence/t022-executed-provenance-check/.
Metrics: start=2026-10-26T16:17:00Z end=2026-10-26T16:33:00Z wall_min=15 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=5 cycle=0 resumes=0 tokens=unavailable policy=2026-10-19.17 check_s=900 mutants=0 defects_unit=0 defects_6c=0 slow: protocol-read plus self-inflicted hung heredoc 6 min tests=2 tests_min=0

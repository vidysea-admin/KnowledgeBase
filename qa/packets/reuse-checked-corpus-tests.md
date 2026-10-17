# Recovered corpus tests — main verification packet

Manifest: `qa/manifests/reuse-checked-corpus-tests.md`.
Fix cycle: 0.
Working directory: `C:\Users\product\Desktop\KnowledgeBase`.
Candidate pins: the three full SHA256 and git blobs in the manifest and `tmp/reuse-checked-tests/hashes.json`; verified unchanged immediately before and after test execution.

## Fresh focused main execution

```text
node --import ./.cache/coordination/safe-test-runtime/register.mjs --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 apps/api/src/ask/source-context.test.ts packages/index/src/tree/tree-real-data.test.ts packages/index/src/pipeline/notes/judge.test.ts
```

The command ran under Python subprocess timeout 120 seconds in authorized lightweight slot 2. No test subprocess isolation, provider/network/DB calls, mutation tests or full suites.

- Exit: 0.
- Tests: 46; pass 46; fail/cancelled/skipped/todo 0.
- Node-reported duration: 5027.221 ms.
- Outer measured elapsed: 5.171 seconds.
- Exact UTC start/end: unknown; not recorded by this invocation.
- Full combined output: `tmp/reuse-checked-tests/focused-tests.txt`.
- Output SHA256: `7f2cce54ff7dd5ea674a293db78c58f46e9b3825856fa008c3c74575743f81f5`.

The API suite hydrated all 29 completed real sessions while reporting both Zoom transcript-only ingests as unfinalized; tree suite exercised real-data/schema/search consumption and malformed/partial fixtures. The judge suite exercised summary/claim consumers with fake models, including original per-issue attack rows. These tests establish their exact scoped test behaviors; they do not establish live ingestion completeness or model quality.

## Frozen contract registry

```text
python contracts/verify_contracts.py
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity
```

Exit: 0. Exact UTC start/end and command duration: unknown. The registry is empty; this check cannot establish pipeline correctness. It ran sequentially in slot 2 after the focused tests; the slot was then released.

## Exact prior approval provenance

- `git show lane/apitests:qa/verdicts/apitests.md`, branch HEAD `020f8107`: cycle 0 PASS checked maker commit `bdf935fb` and test blob `e4aa71d3`, equal to approved branch HEAD. Retains ISS-APITESTS-001 medium array divergence and ISS-APITESTS-002 low env-override coverage observation.
- `git show lane/indextests:qa/verdicts/indextests.md`, branch HEAD `ffce705d`: final cycle 1 PASS checked maker commit `3bbbaeae`, closed ISS-INDEXTESTS-001; ISS-INDEXTESTS-002 policy/contract question remains open pending Umesh.
- Root files were clean and matched HEAD before exact-byte recovery. New main source blobs match the previously checked branch blobs exactly. No historical QA records were imported or changed.

## Acceptance bounds

Review and verdict cover exact source recovery and scoped main consumers. Retained array-helper divergence, unknown timing metadata, open policy question, synthetic judge and empty frozen registry must remain disclosed. No production changes, task closure, provider quality, new seam round or live operational release is claimed.

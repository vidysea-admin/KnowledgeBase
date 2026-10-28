# Independent T-054 original RED diagnosis

This is a fixture diagnosis, not a unit or full-parent PASS. Independent checker accepts the causal-receipt assertion repair only after the behavioral evidence below. No product race or new data-write issue is demonstrated by this RED; ISS-T054RACE-001 is therefore not filed.

## Preserved original floor

Original service test bytes: `qa/evidence/t054-review-completion/service-test-attempt1-source.txt`, SHA256 `032748F4E69A2D98E830A8E5BF68D9FEEA8F1EF04BF29AFC1D304C993802747C`.

Original API run: `qa/evidence/t054-review-completion/api-attempt1-receipt.json` and `api-attempt1.stdout.txt`: 74 declared cases, 73 PASS / 1 FAIL, exit 1, elapsed 5483.0986 ms, checked hashes unchanged. The reviewed-case failure was the final assertion `assert.equal(history.at(-1)!.parentRevision, revision);`. Before that assertion, stale-writer refusal as `conflict`, effective winning text and history row count had passed. These are original failure facts, not evidence of a complete accepted unit.

## Independent reproduction

The root-directed independent probe preserves the old interleaving, fixture input values, stale-writer request and exact failing assertion. It records the original assertion outcome separately, then checks actual durable head, competing receipt, causal audit parent, absence of stale overwrite and explicit history ordering.

Command (sole broker, repository root):

```text
C:\Users\product\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register.mjs qa/evidence/t054-review-completion/checker-race-floor.test.ts
```

Receipt: `qa/evidence/goal-t051checker-broker-t054-independent-race-diagnosis.json`; raw stdout/stderr have the same prefix. Started 2026-10-14T21:32:20.986Z; completed 21:32:22.204Z; measured elapsed 1214.4243 ms; exit 0; diagnostic cases 2 PASS / 0 FAIL; 8 pinned files unchanged. This process ran no real Mongo, provider, browser, mutation or product write.

Original floor outcomes are **initial PASS / reviewed RED**: the old reviewed assertion remains reproduced. Diagnostic PASS does not rename that original RED to green.

Reviewed-case actual output:

- Loaded seed revision: `9d0fb4117113bb42b5241140129c43fa4cc720c7a857c37f46732e24b6d9b2bc`.
- Winning receipt and durable head: `01f025e28a963b963217a6fbc12607609a38c516ebda1b29342c8c4c98cff689`.
- Winning audit parent equals the loaded seed revision; its after text is `winning correction`.
- Stale request refused with `ReviewServiceError.code === "conflict"`; no history change contains `stale overwrite`.
- Both history rows have `reviewedAt === "2026-10-14T09:00:00.000Z"`.
- History ordering is winner (`01f...`) then seed (`9d...`), matching `store.listRevisions`' explicit time-then-lexical-revision comparator.
- The last row is therefore the seed, whose parent is `base-02416769fae99d9c24d30bb55b7f7b887fec78406ca99168`; this exactly matches the original RED actual value.

## Diagnosis and accepted test repair

The old final assertion assumed that array position was causal order. Equal fixture timestamps plus the documented lexical hash tie-break disprove that assumption independently. The corrected test captures the actual competing receipt and finds its audit row, then asserts the same causal parent plus winning text and no stale-overwrite audit. That repair does not weaken stale-writer refusal, the exact interleaving or production CAS. Production service/store bytes are unchanged.

Current corrected service test SHA256: `29D1650F5FC2DEFEB97B519DF8F21637CC1EC053684CB38808D11672E865A615`.
Checked service SHA256: `1FA9A35EE5393F63E4E4A3F9EA2BFF4AE15F706376A9379D029CC91704E55B28`.
Checked store SHA256: `304F7DCF0E156E6D825B0D739793BC976409639EA6E4AE7375801227ECBB2C1D`.

The repaired test still needs its focused authorized execution. Previously green unaffected API evidence may be attributed on unchanged bytes; no blanket 74-case rerun is needed solely for this fixture correction. Maker READY, final pins, DOM/build/frozen receipts, real replica-set publication and actual mounted UI gates remain separate and unaccepted. Scope-read/probe-writing timing was not fully measured; do not infer total checker elapsed from the process duration.

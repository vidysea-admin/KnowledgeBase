# Scoped checker packet — t043-index-proof-v3-consumer, cycle 0

Repository: C:/Users/product/Desktop/KnowledgeBase. Manifest: qa/manifests/t043-index-proof-v3-consumer.md, submitted ready-for-check cycle 0 and closed checked-PASS after matching independent verdict. Checker contract: qa/contracts/t043-index-proof-v3-consumer.md C1–C7, SHA26FB0A286D4A1913A61EE045E6143D6AD86F97FACF2BB9E67244949FB835C0B9. Matching verdict: qa/verdicts/t043-index-proof-v3-consumer.md, PASS/Cycle checked 0, SHAD15B692203830B6B1A5A532E78CA3866FF69C58634E162BF12F7A5FA04969346. Close-out changed only handshake metadata; current source/receipt pins remain the checked candidate.

## Change map and security boundary

- Existing capture/record-finalize.ts: one import of validateCaptureIndexProof; validateIndexProof delegates with optional expectedWorkDb default process.env.MONGO_WORK_DB. Existing exported name/API and surrounding provider/privacy/finalization flow remain. Original before bytes locally archived, hash9996474...; final2A65DFC... below.
- New workspace/index-proof-consumer.ts: guarded unknown JSON; bounded secure read-only snapshots; core v2 checks; v3 current source/session identity/status, independently expected database (testData forces staging), exact source/raw hashes, selected artifact, gate, turn count/identity/timing and final unchanged-byte verification. Fixed artifact names prevent arbitrary path selection. No any, schema/compiler weakening, outbound call or mutation in consumer.
- New fixture executes the exact current sync CLI proof-producing block via VM with the actual prepared helper and retention atomic writer, then tests the actual exported capture consumer. Only completed-index input is synthetic; no real indexer/provider/DB/media is invoked. Temporary fixture filesystem writes are explicit.
- Original six-case test and fixture remain unchanged between original RED and repaired replay; four additional guard cases cover hostile rows despite matching rewritten hashes, stale gates, test-data database binding and legacy count/generation.

Relevant immediate consumers/dependencies: sync producer block → prepared proof helper/retention writer → capture exported validateIndexProof → typed workspace consumer/secure retention reader. This packet does not extend the separately owned pipeline-marker readiness scope.

## Exact current nine pins

All nine independently read by maker on 2026-10-15 still matched the actual replay receipt. New workspace files had no base; existing capture original snapshot is preserved locally. Actual source, not excerpts, remains authoritative.

| Path | SHA256 |
|---|---|
| packages/meeting-bot/src/workspace/index-proof-consumer.test.mjs | 9EA8A3B811B71035746F70FB32B56A12E2CAB69F68C69F8CFFFB7B5190AD4527 |
| packages/meeting-bot/src/workspace/index-proof-fixture.mjs | 01498EA293641A4DF82AB472A0ACB8AB0C9FDBB9F08CE38682055756EDE2A844 |
| packages/meeting-bot/src/workspace/index-proof-identity.test.mjs | A33C5E184191CEE231470FB74837A7E0DE67BD1642AD64F86C574DCA515D9BCF |
| packages/meeting-bot/src/workspace/index-proof-consumer.ts | 1568F08EC400844F885DEFD9DB05D4B3B054A865BBB12911A2ECC7525B4B7E4A |
| scripts/webinar/sync-session.mjs | 9896EFF9E8FDC9E6298ACA5CF751C708C45E8C24CFD2ACF8B42ACB96FD5A4012 |
| packages/meeting-bot/src/capture/record-finalize.ts | 2A65DFC82940EC5EE461E089C1852158AC0DBAE3AB46E5ED070A196A281237B8 |
| scripts/webinar/index-proof.mjs | 7E548F2C2F643D6D3F6AFBA6C2360AAF225A7B531B6DC7E2D0FB2439283843EB |
| packages/ingest/src/retention/production/private-summary.ts | E78E427AB662036994C846B62F9B904334FFB7D1A8270956B40035B24AF50181 |
| packages/ingest/src/retention/production/private-summary-read.ts | 3F451BF9B51D76671F28A7AE132C84F99E8D370FE86F131564CF6C65BA5554F0 |

## Attributed ordinary execution, not a new run

Executor: /root/docker_governance_review, sole ordinary coordinator. Cwd repository root. Node argv for original floor:

```text
--test --import tsx --test-isolation=none --test-concurrency=1 --test-timeout=30000 packages/meeting-bot/src/workspace/index-proof-consumer.test.mjs
```

Original immutable red-spec.json/source-pins.json and original-red.receipt.json/stdout/stderr under qa/evidence/goal-t043/v3-consumer-cycle1/ remain unchanged. Receipt SHA4870246C67CA09DB89FFD62854F171669D1F28ABCBA3345DE74E69C11A4C0A93: child13332 terminal exit1, tests6/pass4/fail2/skipped0, duration1029.2706 ms, all six before/after pins unchanged. Actual two failures: v3 core refusal; speech-only ENOENT knowledge-turns.json. Original producer9896EFF... and finalizer9996474... bytes are preserved locally; source-before backups are not publication leaves.

Repair replay adds only the second explicit test filename:

```text
--test --import tsx --test-isolation=none --test-concurrency=1 --test-timeout=30000 packages/meeting-bot/src/workspace/index-proof-consumer.test.mjs packages/meeting-bot/src/workspace/index-proof-identity.test.mjs
```

Replay spec SHA24F4E6EDC4A3BD7DA2161C7FDAAB1B32CE7A63037ECD370D760800EB19BEAA69; replay-source-pins SHA3B5FF9AC2C9A75C9F85472E549559F857A579B8933CF39B35D27BD3EDE808E56. Receipt repair-replay.receipt.json SHAEF596313AF5837A3C44E57C5D384A742B2E58D27E3F4CBD26F1972F119EB1744: child16648 terminal exit0, 2026-10-14T22:48:41.9139090Z–22:48:43.9396604Z, elapsed2028 ms; stdout10/pass10/fail0/cancel0/skip0/todo0, test duration1838.0198 ms. Outer timeout60000 ms not reached; all nine pins unchanged; costUSD0. Exact stdout/stderr preserved beside receipt.

These reviewed local synthetic executions were separately authorized ordinary operations. Prior blocked provider/private-DB actions were not retried or used as a workaround. No duplicate unchanged execution is requested; changed pins would require a fresh candidate/ordinary classification. No live credentials/environment values are needed for this fixture scope; expected database is supplied as synthetic input.

## Criterion map and limitations

| Criteria | Evidence |
|---|---|
| C1 | unchanged original six-case RED → actual producer/actual consumer compatibility replay |
| C2–C3 | typed current source/session/expected DB/hash/count/core/selected gate guards plus six-case floor |
| C4 | four additional hostile identity/gate probes |
| C5 | narrow capture diff and guarded secure reader, independently inspectable current bytes |
| C6 | explicit legacy limitation below |
| C7 | ready cycle0, nine current pins, attributed terminal receipts; checker must verify matching bytes |

Legacy v2 guarantees remain core tenant/session/hash/stages plus count/string generation. V3 source ID/hash/database/session-status/row/gate guarantees do not extend to v2. Manual downgrade rejection and authenticated/cryptographic proof provenance are not demonstrated.

Full sync/index/provider/media/Mongo/Ask execution, real tenant isolation, corpus completeness, separate marker gate, model costs and project-wide typecheck are outside this scoped proof. Parent T-043 stays in_progress; no full goal C3–C10 PASS may be inferred. contracts/contracts.json currently has no frozen stages; no frozen-stage execution is attributed to this replay. Checker owns the verdict; this packet supplies no intended verdict.

# Vectorless pipeline integration — T-043 / T-050

Status: in_progress
**Handshake status:** in_progress
**Fix cycle:** 1
**Priority tier:** 3 — next unblocked roadmap integration, expressly authorized by D-173/D-174 and root's exclusive leases.

## Bounded behavior

The real webinar sync CLI now demands explicit vectorless index completion. Its completion proof uses v4 lexical/provenance readiness rather than falsely asserting an embedding stage succeeded. The helper retains its historical v2 semantics and the outer proof retains historical v3 shape for legacy consumers; active sync cannot silently downgrade. No parent-task completion is claimed.

Security flags: data writes, tenant/source identity and current generation are in scope. Credentials are neither read nor emitted. Graph queue/checkpoints, provider calls and transaction behavior are unchanged.

## Changed files and bases

- `scripts/webinar/index-proof.mjs`: validate explicit mode and lexical/provenance flags; v4 only for vectorless, legacy semantics preserved; source input and validation byte guards unchanged.
- `scripts/webinar/index-proof.test.mjs`: three focused vectorless tests extend seven existing source/gate regressions.
- `scripts/webinar/sync-session.mjs`: bind real indexing to vectorless, select v4, pass explicit retention mode and describe lexical indexing truthfully.

Exact current SHA256 pins: `qa/packets/vectorless-pipeline-integration/candidate-pins.json`. Byte-for-byte original files are preserved as `base-index-proof.mjs`, `base-index-proof.test.mjs`, `base-sync-session.mjs` in that directory. These are working-tree bases, not assumed clean HEAD.

## Caller and downstream map

`sync-session.mjs` calls `production.ts` buildIndexer(strictWebinar), then prepareWebinarIndexProof; completion must have version2/strict/complete/treeWritten/generation/count and explicit retrievalMode vectorless + lexicalWritten/provenanceValidated. Nonempty chunks represent lexical source rows; no embedding invocation was added.

The proof finalizer retains exact selected source/validation hash verification. Outer sync retains source hash and isolated database identity and writes through existing atomic retention writer. The processed stamp passes retrievalMode vectorless to retention-processed-proof. Capture's index-proof-consumer is independently updated by capture_maker. The graph index handler and runner continue consuming that capture validator and preserve restart/queue/paid-effect behavior.

Relevant contracts: `qa/contracts/goal-t043.md`, `qa/contracts/t043-index-proof-v3-consumer.md`, existing T-050 graph contracts. Their legacy vector clauses require the independently owned D-173/D-174 vectorless adaptation; maker does not edit contracts.

## Verification request and evidence

Broker only: `node --test scripts/webinar/index-proof.test.mjs` — expected 10 tests. Immediate consumers: capture_maker's actual producer-block fixture through capture proof validator; retention_maker's explicit v4 mode/current-source/generation tests. Broker serializes CPU and supplies commands, count, exit code, duration and before/after pins. No live provider, Mongo, recording, browser or media operations authorized for this unit.

Affected stage: broker receipt `qa/goal-vectorless-2026-10-15/verification-pipeline-proof-20261015T0802.json` and adjacent stdout/spec. Exact command: `C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe --test --test-concurrency=1 --test-timeout=10000 scripts/webinar/index-proof.test.mjs`. Node v24.19.0, exit 0, 10/10 tests, 465.2652ms elapsed, before/after candidate hashes unchanged. Broker used auto-review-approved escalation for Windows fixture filesystem execution; future exact same-context checks should reuse this receipt rather than retry a demonstrated-restricted context. No network/DB/media effects.

Immediate capture consumer: broker receipt `qa/goal-vectorless-2026-10-15/verification-capture-consumer-startup-20261015T0815.json` plus stdout. Original tsx runtime, actual sync proof-producing block through capture finalizer validator: nine consumer tests PASS; two separate startup tests also PASS (11/11 total), exit 0, 11487.7102ms elapsed, no skips/failures/drift. Receipt records exact package working directory, runtime, command and candidate identities. This verifies synthetic current v4 producer/consumer compatibility, not real ingestion acceptance.

Retention processed-stamp dedicated successful receipt: `qa/goal-vectorless-2026-10-15/verification-retention-ten-20261015T0835.json` plus stdout/spec, 10/10 PASS, own exit 0, 4207ms elapsed, all pins stable. This is the reusable successful focused receipt; earlier combined 107-test batch had unrelated indexing failures and is not asserted PASS. It covers mode/current-source/generation binding and downstream retention state. All three leased pipeline candidate hashes were rechecked unchanged before readiness.

Actual maker start was not instrumented and token counts are unavailable; candidate snapshot discloses both without fabricated timings. Full maker wall duration is therefore unknown; test phase elapsed values above are measured broker observations.

## Remaining gates

Pre-dispatch revalidation found the historical capture consumer receipt has four changed transitive inputs (record-commands, record-finalize, finalize-workspace-recording and core index barrel). Producer and retention receipt pins remain current. Root requires one coherent current consumer9 refresh after central export freeze before checker dispatch; readiness is withdrawn until that prerequisite is met. No source candidate changed and no checker was dispatched prematurely.

Independent current-cycle checker; source/capture/retention integration receipts; affected-stage and immediate downstream verification; actual staging indexed-source to authenticated cited Ask acceptance; full parent corpus/live acceptance. No filed ledger issue is claimed fixed; new tests are not a substitute for an issue's recorded corpus.

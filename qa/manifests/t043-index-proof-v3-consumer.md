# T-043 scoped index-proof v3 consumer compatibility

Status: checked-PASS
Handshake status: checked-PASS
Fix cycle: 0
Priority tier: 3 — authorized T-043 roadmap implementation, narrow integration repair.
Contract: qa/contracts/t043-index-proof-v3-consumer.md, C1–C7.
Contract SHA256: 26FB0A286D4A1913A61EE045E6143D6AD86F97FACF2BB9E67244949FB835C0B9.
Packet: qa/packets/t043-index-proof-v3-consumer.md
Verdict: qa/verdicts/t043-index-proof-v3-consumer.md (checker owned).

## Authorized scope

Repair the actual sync proof block's v3 output being refused by the immediate capture validator. Existing-source changes are limited to capture/record-finalize.ts's typed-consumer import and validateIndexProof delegation with optional expectedWorkDb from caller/environment. New workspace consumer and local synthetic fixture tests are task-owned. Root owned the sync producer integration. No surrounding privacy/provider/finalization flow, schema, compiler settings or entrypoint changed in this unit.

Security flags: read-only file/tenant/source/database binding at a completion consumer; production mutation, credentials and network are excluded. The synthetic producer fixture uses the actual retention writer only inside temporary local test directories. No real knowledge data is touched.

## Evidence and frozen candidate

The original actual producer/finalizer bytes and original six-case RED remain preserved locally. Sole ordinary executor attributed original receipt: 6 tests, 4 passed, 2 failed, exit 1, no timeout; failures were actual v3 proof refusal and missing combined file for speech-only input. After repair, the unchanged original six-case floor plus four identity/gate cases passed 10/10, exit 0, elapsed 2028 ms, no timeout/skip/cancellation, all nine before/after pins unchanged. No duplicate run was performed by this maker.

Current read-only pin audit on 2026-10-15 found all nine files still match qa/evidence/goal-t043/v3-consumer-cycle1/replay-source-pins.json and repair-replay.receipt.json. Exact paths/hashes, commands and attributed receipts are in the packet. Existing capture base hash 9996474DEDF2628151A5941B9A353FBE934C59A19348F87FD5E6BC682D64E056; final hash 2A65DFC82940EC5EE461E089C1852158AC0DBAE3AB46E5ED070A196A281237B8. New workspace files had no base.

## Explicit limitations

Legacy v2 combined proofs retain only core tenant/session/hash/stage guarantees plus strengthened count/string-generation checks. They do not gain v3 source-ID/source-hash/database/session-status/selected-row/gate guarantees. Manual downgrade rejection and authenticated or cryptographic proof provenance are not demonstrated.

This unit exercises synthetic local proof production and the immediate actual validator. It does not execute the full sync CLI, real indexer, media pipeline, providers, Mongo or /ask, nor the separate pipeline-marker gate, real tenant isolation or project-wide typecheck. It cannot satisfy full parent criteria C3–C10. Parent qa/manifests/goal-t043.md and T-043 remain in_progress regardless of this scoped verdict.

Maker did not edit qa/contracts or write a verdict. Closed only this scoped handshake after independent PASS, Cycle checked 0, in qa/verdicts/t043-index-proof-v3-consumer.md, SHA256 D15B692203830B6B1A5A532E78CA3866FF69C58634E162BF12F7A5FA04969346. Checker independently confirmed all nine current pins matched and post-persistence audit found zero changed candidate files. Parent T-043 remains in_progress; source and receipt bytes were not changed by close-out.

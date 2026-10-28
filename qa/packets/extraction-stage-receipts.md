# Extraction stage receipts — candidate cycle 0

Root: C:/Users/product/Desktop/KnowledgeBase
Candidate ID: sha256:e643ea586eb60cb67c979538244ef1c34cb89ac6ee2a68232ca13ada87b26899
Fix cycle: 0
Status: ready-for-check
Handshake status: ready-for-check
Candidate inventory: qa/packets/extraction-stage-receipts.candidate-inventory.txt
Candidate algorithm: SHA256 of the exact UTF-8 without BOM inventory, sorted owned changed source/test paths, each line repo-relative path + ASCII space + lowercase raw-file SHA256 + LF, final LF included. Governance metadata is excluded to avoid circular self-hashing. Both source pins were rechecked unchanged when this identity was recorded. This ID supplements rather than replaces the original base/history and raw-file pins below.
Base/candidate HEAD: 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a. Candidate includes the following untracked files; neither had a base. Whole-worktree HEAD alone does not identify this candidate.

| Changed file | SHA256 |
| --- | --- |
| scripts/eval/extraction-stage-receipts.mjs | 6465571a1d52cb2ba3babf187ca4884913d3e005ea89dcee27ccec451b39d17c |
| scripts/eval/extraction-stage-receipts.test.mjs | 1808871b284d4bc852ea0a666994f7a0257cbc0f3f4844a7fa70eae46ff58c31 |

Owned metadata: qa/manifests/extraction-stage-receipts.md and this packet; evidence prefix qa/evidence/extraction-stage-receipts/. Other changes belong to concurrent makers.

Applicable ground truth: qa/contracts/goal-u22.md P1, P2, P3, P4 and S4; qa/contracts/parallel-extraction-adjudication.md clauses 3,5. This scoped adapter does not establish all parent criteria. Maker never edits those contracts.

Behavior: stageReceipts reloads the existing validated 72-claim review bundle, checks the exact bound corpus hash/length, contains existing declared artifact paths within the repository, and calls the actual loadManifest evaluator. Existing packet-bound artifacts must retain their known hashes. Acquired zero-claim sessions outside that claim packet get current hash fingerprints with packetBound:false, never a fabricated historical binding. Output contains only hashes, numeric acquisition/stage/citation counts and fixed flags. Raw/parsed/filtered stages are never substituted from persisted claims. requireStages refuses any requested stage lacking evidence for every declared case, counting failed acquisition among unavailable cases. CLI emits generic refusal errors without diagnostics/source text. No network, provider, DB, secrets, browser, child process, source write or gold/threshold import.

Immediate consumer: scripts/eval-extraction.mjs loadManifest called directly by the adapter; packages/index/src/eval/extraction.ts evaluates recorded stages. loadBundle in scripts/eval/extraction-review.mjs verifies original packet, draft and source bindings. requireStages is the additive downstream gate exercised on real receipt output. Existing callers are unchanged.

Dependency fingerprints:

| Path | SHA256 |
| --- | --- |
| scripts/eval-extraction.mjs | 8f586efb874071895b9508403e2d0ff1aa7f272ceee1e87b8d6d0da9fa872741 |
| scripts/eval/extraction-review.mjs | 0eae318240d991b626ada193aa39fe9f213de068b50d2db22c5fed7358f08a44 |
| packages/index/src/eval/extraction.ts | f61db7de33998eb2e9bf5d27904b22f625672df002f35101a86a80675be11430 |
| packages/index/src/eval/corpus-reconcile.ts | 4d783aa6f41e173f6c25b33d7489478d1acff8a901806faa38e3f13bff58ade0 |
| data/eval/extraction-corpus.json | 7518a03e924486ba15a2b43402de6a896235f16dd7fb111485e966785a397027 |
| data/eval/extraction-draft-review/index.json | d2cb375e85d1048fde8f9a1d8160af64085a6f4ae2bdf0e8ee7ccdb21bc110a3 |
| data/eval/extraction-adjudication-packet.json | 1cbc8cb5cf4894b72a9ac0a5ffff2a310cdf2da0c6d5811bcdadc66e2ca0b175 |

Allowed actual-data reads: those bound files, eight referenced draft batch JSON files, packet-bound data/toc-migrated session artifact bytes, all corpus-declared turns/persisted artifact bytes, and directory-entry inventory for data/toc-migrated. No raw source text is copied into QA. Runtime loads tsx and existing workspace modules only; environment variables or credentials are unnecessary. No package installs requested. Keep real private inputs local and output only aggregate/hash receipt.

Required broker checks (focused stage tests now executed only inside the shared command documented below; standalone commands and remaining gates are unexecuted):

1. `node --test scripts/eval/extraction-stage-receipts.test.mjs` — focused affected stage plus actual evaluator and downstream requireStages consumer. Expected pass; real-data assertions:35 declared/29 acquired/6 failed,2 undeclared,72 claims/80 citations/14 invalid, raw unavailable35 and null rows, persisted available29/unavailable6,23 packet-bound artifact cases. Tests also assert deterministic replay, metadata-only projection, malformed requests, subset refusal and generic CLI errors.
2. `node scripts/eval/extraction-stage-receipts.mjs` — actual sample receipt. Expected exit2 because required raw/parsed/filtered/persisted evidence is incomplete. Retain JSON as metadata evidence; exit2 is an honest refused stage gate, not approved quality failure or source failure.
3. Repository required `contracts/verify_contracts.py` — parent/broker may reuse only verified same-SHA/environment evidence; otherwise run with interpreter/import/writable-temp preflight. No validator run has occurred in this maker context.

No maker-local test subprocess has run. Maker actual active seconds/tokens/cost are unknown; unknown is not measured budget success. Fresh checker must load C:/Users/product/.agents/skills/checker/SKILL.md and run its assess gate with explicit bounded BOOTSTRAP_REVIEW if denominators remain unknown. Sole broker owns meaningful execution. Readiness requires completed scoped maker evidence; PASS requires the independent verdict.

## Executed shared evidence reconciliation

Broker receipt: qa/goal-vectorless-2026-10-15/verification-quality-six-unit-twenty-six.json; exact selected-name mapping: qa/goal-vectorless-2026-10-15/verification-quality-six-unit-twenty-six-units.json; raw stdout/stderr paths recorded in that receipt. The shared command passed26/26 selected tests, zero skips, exit0, shared wall duration6096ms. Exactly these three owned stage cases are included: `real bound source inventory retains acquisition and stage gaps without source text`; `requests reject malformed, duplicate and unknown stage names`; `alternate measurement and invalid CLI arguments fail closed without diagnostics`. This covers the real corpus, affected adapter and requireStages downstream consumer assertions described above. It is not a standalone stage command receipt and its shared duration is charged once, never assigned to this maker as standalone active time.

Shared candidate pin inventory d6ad4fc2172711a8651c39a64963f379a74b1668e0a07936d4e1c86ddd480ebe is a different, broader identity from this unit's candidate ID. Both exact owned source hashes recorded above occur unchanged in the broker before/after pins; all62 broker pins were stable. The shared receipt also pins extraction-review.mjs, eval-extraction.mjs, extraction.ts and corpus-reconcile.ts; preservation of the separate corpus/draft/source input bindings is additionally asserted by actual loadBundle/stageReceipts replay. No broader candidate equivalence or unlisted dependency equality is inferred.

Runtime: C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe, v24.19.0, executable SHA2563602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237. Import root is this repository. Lock SHA2562af3aada247f31436a28f46f4803dc8b4294956c21825f7421ca37faf07d83dd; environment fingerprint1f6b045ea8ea78388b899ea4c9e324c4cb6e81929b685d030acc40df41e48bac (values omitted; named hashed whitelist is in the receipt). Windows host, require_escalated auto-review approved, serial CPU command, test timeout30000ms and outer timeout120000ms. Exact command includes --test-concurrency=1, --import tsx and an anchored26-name pattern across six files; use the linked receipt as authoritative command rather than converting this into an unexecuted standalone command.

## Actual CLI receipt and final checkpoint reconciliation

Actual sample receipt: qa/goal-vectorless-2026-10-15/verification-extraction-stage-current-refusal.json and its linked stdout/stderr. Exact broker command: `C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe scripts/eval/extraction-stage-receipts.mjs`. Own exit2, elapsed372.9881ms, outer timeout30000ms, no signal/error, before/after pins unchanged. Its broader broker candidate4c0ba514be8f51fc6a72535ccbd0f019debd4072cabee78950d216ae35830402 includes this unchanged adapter and evaluator/dependency pins; it does not replace the unit's two-file candidate identity. Runtime version/executable hash, lock and environment fingerprint exactly match the shared26 receipt recorded above.

Actual stdout confirms the exact packet/index/corpus bindings already pinned in this packet;35declared/29acquired/6failed/2undeclared/0outside,72claims/80citations/14invalid. complete:false. All four requested stages are refused with fixed reason stage-evidence-unavailable; persisted is unavailable for six acquisition failures. This is executed honest evidence refusal, never a quality threshold or parent acceptance PASS. Stdout is only hashes/counts/fixed flags; no private source text copied.

Central checkpoint: qa/coordination/knowledge-brain-20261015/final-shared-public-checkpoint.json, state FINAL_SHARED_SOURCE_FROZEN_NOT_CHECKED,18public shared pins plus6selector binding pins. This records the coordinator's final shared source boundary, not a checker verdict. This additive unit's own two source pins were re-read unchanged on reconciliation. It neither changes those shared files nor claims the final checkpoint itself proves U2.2 acceptance.

Applicable validator evidence exists at qa/goal-vectorless-2026-10-15/verification-frozen-contracts-20261015T0914.json with linked stdout: exit0,162.8908ms, Python3.12.10 at C:/Program Files/Python312/python.exe, executable SHA2564d6f5f81a4bca11191c4c7c6b43632694d0a4ce74e068619d8fdc161d469859a; environment45d6e44ed6caba84c6ae1b149a644e661a567026bbac5c815b85328393c43ff7. Output states no frozen contracts, PASS by vacuity only. Its actual relevant inputs were independently rehashed during this metadata reconciliation: contracts/verify_contracts.py1240059fc2abc63cde58472ef8f7964978e74ba5bc2f5156a30379ddae391db3 and contracts/contracts.json d31dad4c1fce135238169f48c18bc5ef68ea0deff7978d9323441330778cc940, both equal receipt before pins. Other broader receipt pins have changed under the shared final source work; no whole-receipt same-candidate equivalence is claimed. Central/checker must explicitly accept scoped same-input/runtime/environment reuse or obtain a current broker receipt. The two changed files are plain .mjs, imported and parsed successfully in actual focused test and CLI execution; no new TypeScript source/build/static gate is introduced by this unit. Required shared final static closure remains coordinator-owned.

## Current mandatory closure and ready handshake

Current validator receipt qa/goal-vectorless-2026-10-15/verification-final-frozen-contracts.json supersedes the earlier validator-reuse question. Actual command `C:/Users/product/Desktop/KnowledgeBase/.venv/Scripts/python.exe -B contracts/verify_contracts.py`, exit0,192.9503ms, no pin drift, linked stdout explicitly PASS BY VACUITY because the frozen registry is empty. Runtime Python3.12.10; existing .venv executable SHA2560b471133e110cfb53a061cad528ce8e517d7b9ac41a0a396c39ad795a487fc14; lock2af3aada247f31436a28f46f4803dc8b4294956c21825f7421ca37faf07d83dd and environment1f6b045ea8ea78388b899ea4c9e324c4cb6e81929b685d030acc40df41e48bac. This is its own executed validator receipt, not borrowed stage test time or evidence of substantive frozen contracts.

At readiness, both owned source hashes and inventory SHA256e643ea586eb60cb67c979538244ef1c34cb89ac6ee2a68232ca13ada87b26899 were re-read unchanged, as were current validator1240059fc2abc63cde58472ef8f7964978e74ba5bc2f5156a30379ddae391db3 and registry d31dad4c1fce135238169f48c18bc5ef68ea0deff7978d9323441330778cc940. Focused3case execution, actual read-only CLI/evaluator consumer, current mandatory validator and final shared source checkpoint are complete for this bounded maker unit. No specific additional static check applies: both changed files are .mjs and their syntax/imports were executed in the focused tests; no TypeScript build is invented. Packet and manifest now agree ready-for-check at cycle0 and the unchanged candidate ID. This is not a checker PASS.

Reviewer dispatch remains HOLD under qa/coordination/knowledge-brain-20261015/quality-delivery/review-budget-prep/admission-hold.md until installed actual_total helper, root finite ceilings and admission close. No reviewer has been dispatched by this maker. Fresh independent verdict remains required. Full U2.2 actual Umesh approval, fact/entity gold, thresholds, raw/parsed/filtered acquisition and production acceptance remain separate gates.

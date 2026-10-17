# U2.5 actual decisions acquisition adapter — maker packet

Status: BUILDING; no execution evidence yet. Fix cycle: 0.
Root: C:/Users/product/Desktop/KnowledgeBase
Base HEAD: 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a
Candidate: 6cf6080a9f32b5b155f257496fa4d9cfd3353c7f31b5797bdd03684c745130b2 (SHA256 of ordered two owned path/hash records, not a Git commit).
Task: U2.5; priority tier 3 explicit parent engineering continuation; no task-completion claim.

## Scope and authoritative basis
qa/contracts/goal-u25.md P3 requires raw/parsed/filtered/persisted decisions measured separately, retaining fabricated citations before filtering. P1 configured-provider evidence and P4 reviewed gold/approved thresholds remain unmet. qa/contracts/goal-u22.md P2/P3/P4 require unavailable stages and genuine human acceptance. Existing goal-u25 safety PASS and goal-u25-consumer work are not repeated or altered. No new acceptance threshold/contract is authored. New acquisition seam has no prior PASS; existing safety/consumer verdicts cover different behavior.

Exclusive owned additions (no base bytes): packages/index/src/eval/decisions-acquisition.ts and decisions-acquisition.test.ts. Exact hashes plus dependencies/lock/contract/validator pins: qa/evidence/u25-decision-acquisition/candidate-pins.json. Own QA additions: this packet, matching manifest, candidate pins and broker spec. No tracked source changes, no barrel/real extractor/persistence modification, no qa/contracts edit.

## Changed logic and immediate consumers
acquireDecisions validates requested tenant/session against every input turn before invoking injected CompleteFn. Actual extractDecisions (../pipeline/notes/decisions.js) performs source validation/prompt/job routing/citation filtering/time/owner handling. Wrapper captures literal completion.text and structured-clones completion.json or same parseJsonLoose fallback before real extractor filters. It never creates raw text from JSON. Source/response/storage snapshots resist later caller mutation.

Actual evaluator evaluateExtractionCase consumes the resulting four-stage artifacts. Authored first test also passes its report through aggregateExtractionReports, the immediate measurement consumer. Filtered owner projects to evaluator speakerRef. Degraded extractor output and raw fabrication remain observable, never promoted into successful no-decision output. Clean provider [] is distinct from no provider call on empty input.

Optional readPersisted receives immutable requested scope and supplies actual storage readback after clean observed extraction. It never writes or synthesizes rows from proposals. Missing/throwing/non-array readback stays unavailable. This is explicitly a storage-observation, not proof the current extraction persisted proposals or that storage is fresh/current generation. Degraded/no-provider extraction skips readback. No real persistence bridge or production consumption is claimed.

Security: tenant read scope/provenance matter; no auth change, data write, credential/environment/filesystem/network/browser/provider defaults. Runtime artifacts contain caller source/provider text and remain subject to existing privacy rules. All authored tests use public synthetic strings; no private/raw corpus copied. No labels, gold, binding thresholds or provider quality manufactured.

## Required broker check (not run by maker)
Executable C:/Program Files/nodejs/node.exe; cwd root; args --test --test-concurrency=1 --test-timeout=25000 --import tsx packages/index/src/eval/decisions-acquisition.test.ts; outer timeout 30000 ms. Frozen spec: qa/evidence/u25-decision-acquisition/broker-spec.json. Exactly 8 authored synthetic tests, actual output authoritative. Tests cover real extractor routing, actual raw vs parsed divergence, fabricated citations, real evaluation/aggregation consumption, missing/readback failure, provider/parse failure, empty-provider vs no-call, predispatch scope, snapshots and foreign stored tenant detection. Test assertions do not constitute configured provider/storage/human acceptance.

No test/build/provider/DB/network action has run locally. Sole broker owns execution/environment preflight and exact output/exit/count/duration/fingerprints. Stored dependency pins are scoped direct dependencies plus package/lock; not a claim of complete transitive closure. Required frozen validator evidence must be supplied/reused with matching pins; currently unavailable to this unit. Sample provider and real live downstream gates remain HOLD.

## Workflow and accounting
BUILDING until actual scoped evidence; do not dispatch checker yet. Matching manifest qa/manifests/u25-decision-acquisition.md. Checker owns future qa/verdicts/u25-decision-acquisition.md; maker cannot issue PASS. Parent U2.5/U2.2 remain in_progress/HOLD regardless scoped result. Actual provider/semantic/gold/threshold/native DB evidence remains pending.
Maker actual tokens/cost/active time: unknown (no guessed ratio denominator). No child agents or local process execution in implementation phase; earlier read-only survey commands are not test evidence. Checker must load canonical checker skill and assess explicit bounded admission before review.

## Actual broker evidence — shared execution, readiness still pending

qa/goal-vectorless-2026-10-15/verification-quality-six-unit-twenty-six.json SHA256 57bccf47cb929ba448193bed0186e404b259fe0cd5dbade9911940492e6f244a records one shared six-unit command, exit0, 26/26 passed, fail/cancel/skip/todo0; UTC 2026-10-15T10:51:54.028Z–2026-10-15T10:52:00.126Z, shared wall6096.396ms/reporter5976.0348ms. The adjacent -units.json SHA256 5bed18972feb608a9c08fa99fdc089525aa04fa77d909d9936ca734233395625 maps this unit’s exact eight names; actual stdout has all8 pass. These are attributable eight outcomes, not a separate unit exit or standalone duration. Shared setup/time are counted once centrally; maker time/tokens/cost remain unknown. Exact command/output paths are in that immutable receipt. Original standalone broker-spec remains a proposal, never relabeled executed.

Actual Node executable C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe v24.19.0 SHA256 3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237 differs from the original proposed Program Files executable; this receipt is authoritative. Environment hash 1f6b045ea8ea78388b899ea4c9e324c4cb6e81929b685d030acc40df41e48bac; pnpm lock 2af3aada247f31436a28f46f4803dc8b4294956c21825f7421ca37faf07d83dd; import root is this repository. Broker ran approved host serial command, not local maker execution. Shared union candidate d6ad4fc2172711a8651c39a64963f379a74b1668e0a07936d4e1c86ddd480ebe includes this unit unchanged; this unit retains its own two-file candidate identity. Rechecked all62 shared after-pins by read-only SHA256:0mismatches; before/after stable. Current source/test/evaluator/extractor/parser/barrel/lock pins match receipt. Full transitive runtime closure is not newly claimed. Compact exact attribution: qa/evidence/u25-decision-acquisition/shared-check-attribution.json.

Still BUILDING: central FINAL shared checkpoint, applicable types/build/static/frozen-verifier receipts and fresh independent same-candidate checker verdict remain pending. No source edits/tests/provider/DB runs made during reconciliation. Actual configured provider decision/no-decision samples, real run-specific persistence/consumer acceptance, human gold and approved thresholds remain unverified; P1–P4 parent acceptance stays HOLD.

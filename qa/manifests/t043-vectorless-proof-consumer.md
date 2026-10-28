# T-043 explicit vectorless proof consumer
**Dual check:** required
dual-trigger: tenancy packages/meeting-bot/src/workspace/index-proof-consumer.ts:21
Policy-Version: proportional-verification/2026-10-19.17

**Handshake status:** checked-PASS — closed out 2026-10-26 by maker resume, dual check: A qa/verdicts/t043-vectorless-proof-consumer.md + B qa/verdicts/t043-vectorless-proof-consumer.b.md (ff4c89b8)
**Status:** checked-PASS — closed out 2026-10-26 by maker resume, dual check: A qa/verdicts/t043-vectorless-proof-consumer.md + B qa/verdicts/t043-vectorless-proof-consumer.b.md (ff4c89b8)
**Fix cycle:** 0
**Priority tier:** 3 — D-173 vectorless roadmap; tenant/source/current-readiness security boundaries uncapped.
**Authority:** root exclusive consumer/test lease, extended explicitly to existing fixture. Maker capture_maker. No pre-READY checker dispatched.
**Contract:** qa/contracts/t043-index-proof-v3-consumer.md existing identity/readiness/legacy clauses; D-173 and root approved v4 vectorless contract replace semantic-only direction. Checker owns any contract revision. No whole-parent acceptance claimed.
**Base:** repository HEAD 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a plus existing working-tree proof-consumer/fixture bytes. Existing v3 logic retained; current change is explicit v4 retrieval-readiness branch, v4 inclusion in same bound validation and producer-backed fixture/tests.
**Maker measured source phase:** 2026-10-15 07:53:05 UTC to 07:55:10 UTC, 125 seconds for source/test/fixture freeze. Earlier startup unit and later evidence-writing time are separate; no inferred test duration.

## Candidate and complete change map

- packages/meeting-bot/src/workspace/index-proof-consumer.ts SHA256 923E6604863F7BF3547F81B714BAFC83F90B7C0F0838F570690F998F4DCB160C: permit version4 only with retrievalMode=vectorless, lexical=done, provenance=passed, semanticSupport=not-required. Versions2/3 still require semanticSupport=passed. Version4 uses every existing v3 source/hash/database/session/turn/readiness/reread check. No absent-mode fallback.
- packages/meeting-bot/src/workspace/index-proof-consumer.test.mjs SHA256 4B51EF56B2C392A9DF0AC02C7916B3662A6B24250E4611E66F07D26607A93DB1: nine cases; actual sync producer through actual finalizer for v4, speech-only validation, genuine legacyv3 and v2, explicit readiness/identity/downgrade attack table, source/session/validation failures.
- packages/meeting-bot/src/workspace/index-proof-fixture.mjs SHA256 895E10BBC12653558E42F2967A2B44C101CA3B744761F97C5B603AF2C4D56055: default explicit vectorless producer input, thirdarg legacy keeps genuine old producer path; no relabelled fixture proof. Real sync block is executed in isolated vm with disposable filesystem and synthetic completed index. No browser/provider/database.
- This new manifest. No dependencies, contracts, verdicts, schemas, trackers or other shared source edited.

Dependencies frozen by pipeline_maker: scripts/webinar/index-proof.mjs 704AA4C9A2CC85B32BFE85155C9C8BC0400CFF42EC34D3C3C3C98DCA4919F06A; scripts/webinar/sync-session.mjs 95F970F5B43501064EDDCD1F47D2BE751825842A761465C40660A08020BB015B. Actual read-only filesystem boundary stays packages/ingest/src/retention/production/private-summary-read.ts; retention_maker notified, no API changes requested. Immediate consumer is capture/record-finalize.ts validateIndexProof delegation and finalizer's required current proof check. Relevant data-write authority derives from returning completion proof for capture processing, so strict tenant/source/generation/current-readiness preservation is acceptance-critical.

## Exact verification request

Bundled runtime C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe, cwd packages/meeting-bot:

`node --test --import tsx src/workspace/index-proof-consumer.test.mjs`

Outer45 seconds; nine cases expected, actual broker counts authoritative. No secrets or API env needed. Source stage and immediate actual-producer→finalizer consumer are exercised together. Broker may batch with producer tests to avoid duplicate work. No tests run by maker; sole verification_broker has exact pins/request. Existing genuine v3 attack corpus remains in the standing suite. Full live capture, Mongo persistence and parent T043 citation acceptance remain open and are not replaced by this fixture receipt.

Pending actual broker receipt and unchanged hashes before READY; root independent checker follows fresh-context budget policy. Prior startup-cleanup static review is not proof-consumer review.

Legacy limitation retained: v2 lacks v3/v4 source/database/session/selected-row validation. The v4 downgrade tests reject version-only rewrites while semanticSupport remains not-required; this does not claim authenticated proof provenance or resistance to an attacker rewriting all legacy fields. Existing legacy support is unchanged by explicit root scope.

## Actual broker evidence and READY

Sole broker reports original-tsx consumer9 plus startup2 combined11/11 PASS, zero failures/skips, exit0, 11487.7102ms, all candidate pins unchanged. Receipt qa/goal-vectorless-2026-10-15/verification-capture-consumer-startup-20261015T0815.json retains exact command/full reuse identity/stdout/spec. Consumer's nine are credited here; startup's two belong to their own manifest. No independent checker verdict yet. Source three hashes above remain frozen; root granted a separate finalizer lean/original-source repair with no index-proof logic changes, so receipt attribution must include that later dependency delta rather than imply the entire finalizer is frozen forever. Root provides shared frozen-contract verifier receipt separately; empty registry is not a stage acceptance proof.

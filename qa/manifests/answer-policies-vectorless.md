# T-056 current-policy and evidence release guard

**Handshake status:** checked-PASS
**Status:** checked-PASS
**Fix cycle:** 0
**Task:** T-056, scoped security/data-release unit; parent remains in_progress.
**Priority tier:** 3, approved roadmap implementation; stale evidence/policy release is security-class and uncapped.
**Authorization:** User's explicit implementation request; D-173 as corrected by D-174. Source frozen by root; subsequent authorization covers metadata readiness only.
**Maker:** answer_policy_maker
**Packet:** qa/packets/answer-policies-vectorless.md
**Verdict:** qa/verdicts/answer-policies-vectorless.md, independent PASS cycle0; canonical unique Verdict/Status/Cycle checked/Reviewed SHA and both current source pins independently re-read before closeout. Readback: qa/coordination/knowledge-brain-20261015/answer-policy-closeout-readback.json.

## Behavior and exact lease

Only apps/api/src/answer-policy/answer-workflow.ts and answer-workflow.test.ts were edited by this maker. Stored answers/history and review-queue content fail closed when the saved effective policy changes or stored candidate/evidence digests fail validation. New policies invalidate earlier default-policy answers. Existing authenticated routes, durable store CAS and conflict-resolution lineage are reused. No API wire/schema, UI, shared composition or contract edit.

## Evidence and remaining gates

Broker receipt qa/goal-vectorless-2026-10-15/verification-answer-policy-four-20261015T0950.json: four mandatory nodes 4/4 passed, exit0, elapsed2533.8524ms; source identity unchanged. Current source hashes match this receipt. Existing 47 PASS / 2 SKIP shared receipt does not select these policy tests and has unrelated typed-fixture drift; it is context only. No full-suite reuse claim. Frozen-validator receipt verification-frozen-contracts-20261015T0914.json: exit0,162.89ms, PASS by vacuity; validator/registry pins still match.

Independent checker adopted qa/contracts/answer-policies-vectorless.md C1-C4 and issued canonical PASS cycle0. Independent seeded failure probe12/12 and two lineage regression nodes passed via broker; exact receipts and scope are in verdict. Closing allocation gate allowed; prior overrun and unknown actual usage retained, no efficiency-success claim. Full T-056 combined integration, live/UI/human acceptance and release gates remain open. Actual maker/reviewer token usage and monetary cost are unavailable, not zero. No maker source edit or test execution occurred after freeze; broker evidence and closeout attached by metadata-only authorization.

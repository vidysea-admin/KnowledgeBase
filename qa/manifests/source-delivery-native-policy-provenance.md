# Manifest — source-delivery-native-policy-provenance

**Handshake status:** building
Status: building
Fix cycle: 0
Priority: tier3, parent-approved native document/message vertical slice, T008/T056 immediate policy release consumer.
Packet: qa/packets/source-delivery-native-policy-provenance.md
Root: C:/Users/product/Desktop/KnowledgeBase
Base: 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a; candidate is two frozen uncommitted source/test paths, not a candidate commit.
Ownership: packages/ask/src/answer-policy.ts and existing packages/ask/src/answer-policy.test.ts only. QA packet/manifest lease explicitly granted by source-delivery coordinator. Root released the compiler edit fence before source edits. Prior policy lane was notified; no unrelated owner paths were edited.

Behavior: policy simulation recognizes strict per-source native provenance using the canonical locator validator plus exact literal UTF8 hash and UTF16 passage length. Native quotes must have exactly their five permitted fields, unique IDs and matching node/source/revision; malformed or legacy/native mixtures within one source require review. Separate native document, message and transcript sources can coexist in one covered answer. Coverage/web/tenant/policy thresholds and actual shared-resolver current-authority release checks remain unchanged.

Original failure: qa/goal-vectorless-2026-10-15/verification-native-doc-four-current.json retained unchanged, exit1/5922.6741ms,3PASS1FAIL,396 before/after pins unchanged. Failed native policy journey expected allowed but received review. The old policy required sessionRef for all internal sources, giving missing-provenance for genuine native evidence. Failed current authority verification would instead mark stale; no missing consent or human approval was demonstrated.

Current candidate SHA256:
- packages/ask/src/answer-policy.ts: 48526DC7BB0367BE5FAC6E9C2AB979AFD4411A6CF4764B442097D1AADCDE64D2
- packages/ask/src/answer-policy.test.ts: 666B0963887A32B7B2AFAE1A661EE3DE002702F2139A9A6E75C598B8B70F2DF6

Evidence: four new tests authored;13 total policy tests. No local tests/build/provider/DB/browser operations. Broker must execute affected policy journey plus policy13/native-verifier7, with current environment/pin receipts. Required independent check and integration gates remain open. Actual maker active time/tokens/cost unknown. No READY/PASS or whole-parent completion claimed.
